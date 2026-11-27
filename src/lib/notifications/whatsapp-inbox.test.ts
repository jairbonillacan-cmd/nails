import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppQuickReplies,
  canonicalizeWhatsAppPhoneE164,
  computeNotificationRetryAt,
  computeWhatsAppServiceWindow,
  getWhatsAppTemplateCatalogItem,
  inferReminderTriggerKey,
  parseInboundWhatsAppIntent,
  renderWhatsAppTemplatePreview,
  resolveNextDeliveryStatus,
  WHATSAPP_SERVICE_WINDOW_MS,
  WHATSAPP_TEMPLATE_CATALOG,
} from './whatsapp-inbox';
import type { WhatsAppDeliveryStatus } from '../types';

describe('whatsapp-inbox pure domain helpers', () => {
  describe('canonicalizeWhatsAppPhoneE164', () => {
    it('normalizes Mexican 521, 52, and 10-digit formats to identical +52 E.164', () => {
      expect(canonicalizeWhatsAppPhoneE164('5215512345678')).toBe('+525512345678');
      expect(canonicalizeWhatsAppPhoneE164('+52 1 55 1234 5678')).toBe('+525512345678');
      expect(canonicalizeWhatsAppPhoneE164('+52 (55) 1234-5678')).toBe('+525512345678');
      expect(canonicalizeWhatsAppPhoneE164('5512345678')).toBe('+525512345678');
      expect(canonicalizeWhatsAppPhoneE164('+1 (415) 555-0199')).toBe('+14155550199');
      expect(canonicalizeWhatsAppPhoneE164('12345')).toBe('');
    });

    it('property: Mexican 10-digit numbers canonicalize identically across 521, 52, and local forms', () => {
      const mxTenDigitsArb = fc
        .array(fc.integer({ min: 0, max: 9 }), { minLength: 10, maxLength: 10 })
        .map((digits) => digits.join(''));

      fc.assert(
        fc.property(mxTenDigitsArb, (local10) => {
          const fromLocal = canonicalizeWhatsAppPhoneE164(local10);
          const from52 = canonicalizeWhatsAppPhoneE164(`+52 ${local10.slice(0, 2)}-${local10.slice(2)}`);
          const from521 = canonicalizeWhatsAppPhoneE164(`521${local10}`);
          expect(fromLocal).toBe(`+52${local10}`);
          expect(from52).toBe(fromLocal);
          expect(from521).toBe(fromLocal);
        }),
      );
    });
  });

  describe('computeWhatsAppServiceWindow', () => {
    it('handles null, invalid, open, near-expiry, and exact 24h boundary', () => {
      const baseMs = Date.parse('2026-11-27T12:00:00.000Z');
      expect(computeWhatsAppServiceWindow(null, baseMs)).toEqual({
        isOpen: false,
        lastInboundAt: null,
        expiresAt: null,
        remainingMinutes: 0,
      });
      expect(computeWhatsAppServiceWindow('not-a-date', baseMs).isOpen).toBe(false);

      const inboundIso = '2026-11-26T12:00:00.000Z';
      const exact24h = computeWhatsAppServiceWindow(inboundIso, baseMs);
      expect(exact24h.isOpen).toBe(false);
      expect(exact24h.remainingMinutes).toBe(0);

      const oneMsBefore = computeWhatsAppServiceWindow(inboundIso, baseMs - 1);
      expect(oneMsBefore.isOpen).toBe(true);
      expect(oneMsBefore.remainingMinutes).toBe(1);

      const twelveHoursLeft = computeWhatsAppServiceWindow(
        inboundIso,
        baseMs - 12 * 60 * 60 * 1000,
      );
      expect(twelveHoursLeft.isOpen).toBe(true);
      expect(twelveHoursLeft.remainingMinutes).toBe(720);
    });

    it('property: window is open iff elapsed < 24h and remainingMinutes is bounded in [1, 1440]', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1_700_000_000_000, max: 1_900_000_000_000 }),
          fc.integer({ min: 0, max: WHATSAPP_SERVICE_WINDOW_MS * 2 }),
          (inboundMs, elapsedMs) => {
            const inboundIso = new Date(inboundMs).toISOString();
            const result = computeWhatsAppServiceWindow(inboundIso, inboundMs + elapsedMs);
            if (elapsedMs < WHATSAPP_SERVICE_WINDOW_MS) {
              expect(result.isOpen).toBe(true);
              expect(result.remainingMinutes).toBeGreaterThanOrEqual(1);
              expect(result.remainingMinutes).toBeLessThanOrEqual(1440);
            } else {
              expect(result.isOpen).toBe(false);
              expect(result.remainingMinutes).toBe(0);
            }
          },
        ),
      );
    });
  });

  describe('resolveNextDeliveryStatus', () => {
    it('property: delivery status transitions are monotonic and never downgrade read/delivered', () => {
      const statuses: readonly WhatsAppDeliveryStatus[] = [
        'queued',
        'sent',
        'delivered',
        'read',
        'failed',
        'received',
      ];
      const statusArb = fc.constantFrom(...statuses);

      fc.assert(
        fc.property(statusArb, statusArb, (current, incoming) => {
          const next = resolveNextDeliveryStatus(current, incoming);
          if (current === 'received' || incoming === 'received') {
            expect(next).toBe('received');
            return;
          }
          if (current === 'read') {
            expect(next).toBe('read');
            return;
          }
          if (current === 'delivered') {
            expect(['delivered', 'read']).toContain(next);
            return;
          }
          if (current === 'failed') {
            if (incoming === 'delivered' || incoming === 'read') {
              expect(next).toBe(incoming);
            } else {
              expect(next).toBe('failed');
            }
          }
        }),
      );
    });
  });

  describe('parseInboundWhatsAppIntent', () => {
    it('recognizes short Spanish confirmation/reschedule/cancel intents and ignores normal chat', () => {
      expect(parseInboundWhatsAppIntent('CONFIRMO')).toBe('confirm');
      expect(parseInboundWhatsAppIntent('  Sí, confirmo!  ')).toBe('confirm');
      expect(parseInboundWhatsAppIntent('Necesito reagendar')).toBe('reschedule');
      expect(parseInboundWhatsAppIntent('No podré ir')).toBe('cancel');
      expect(
        parseInboundWhatsAppIntent(
          'Hola, sí quería confirmar si tienen disponibilidad de tono lechoso y cuánto cuesta el nail art',
        ),
      ).toBeNull();
      expect(parseInboundWhatsAppIntent('¿Aceptan transferencia?')).toBeNull();
    });
  });

  describe('computeNotificationRetryAt', () => {
    it('computes 5m, 15m, 45m backoff monotonically', () => {
      const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
      expect(computeNotificationRetryAt(1, nowMs)).toBe('2026-11-27T12:05:00.000Z');
      expect(computeNotificationRetryAt(2, nowMs)).toBe('2026-11-27T12:15:00.000Z');
      expect(computeNotificationRetryAt(3, nowMs)).toBe('2026-11-27T12:45:00.000Z');
      expect(computeNotificationRetryAt(8, nowMs)).toBe('2026-11-27T12:45:00.000Z');

      fc.assert(
        fc.property(fc.integer({ min: 1, max: 10 }), (attempt) => {
          const t1 = Date.parse(computeNotificationRetryAt(attempt, nowMs));
          const t2 = Date.parse(computeNotificationRetryAt(attempt + 1, nowMs));
          expect(t2).toBeGreaterThanOrEqual(t1);
        }),
      );
    });
  });

  describe('inferReminderTriggerKey', () => {
    it('maps workflow trigger events, post-visit surveys, and subject fallbacks accurately', () => {
      expect(
        inferReminderTriggerKey(
          { triggerEvent: 'before_booking', offsetMinutes: 1440, name: '24h' },
          { triggerKey: null, subject: 'Recordatorio', scheduledFor: '2026-11-27T10:00:00.000Z' },
        ),
      ).toBe('reminder_24h');

      expect(
        inferReminderTriggerKey(
          { triggerEvent: 'before_booking', offsetMinutes: 120, name: '2h' },
          { triggerKey: null, subject: 'Recordatorio', scheduledFor: '2026-11-27T10:00:00.000Z' },
        ),
      ).toBe('reminder_2h');

      expect(
        inferReminderTriggerKey(
          { triggerEvent: 'after_booking', offsetMinutes: 120, name: 'Encuesta' },
          { triggerKey: null, subject: 'Encuesta', scheduledFor: '2026-11-27T10:00:00.000Z' },
        ),
      ).toBeNull();

      expect(
        inferReminderTriggerKey(
          { triggerEvent: 'after_booking', offsetMinutes: 25920, name: 'Retoque' },
          { triggerKey: null, subject: 'Retoque', scheduledFor: '2026-11-27T10:00:00.000Z' },
        ),
      ).toBe('touchup_invite');

      expect(
        inferReminderTriggerKey(null, {
          triggerKey: 'deposit_rejected',
          subject: 'Cualquiera',
          scheduledFor: '2026-11-27T10:00:00.000Z',
        }),
      ).toBe('deposit_rejected');
    });
  });

  describe('WHATSAPP_TEMPLATE_CATALOG, preview and quick replies', () => {
    it('defines all 9 official es_MX templates with matching placeholders and labels', () => {
      expect(WHATSAPP_TEMPLATE_CATALOG).toHaveLength(9);
      for (const spec of WHATSAPP_TEMPLATE_CATALOG) {
        expect(spec.languageCode).toBe('es_MX');
        expect(spec.parameterLabels.length).toBe(spec.exampleParameters.length);
        for (let i = 1; i <= spec.parameterLabels.length; i += 1) {
          expect(spec.bodyText).toContain(`{{${i}}}`);
        }
        expect(getWhatsAppTemplateCatalogItem(spec.triggerKey).defaultTemplateName).toBe(
          spec.defaultTemplateName,
        );
      }
    });

    it('renders template previews with supplied values and fallback examples', () => {
      const rendered = renderWhatsAppTemplatePreview('reminder_2h', [
        'Valeria',
        '4:30 p.m.',
      ]);
      expect(rendered).toContain('Hola Valeria');
      expect(rendered).toContain('4:30 p.m.');
      expect(rendered).toContain('Volcanes');
      expect(rendered).not.toContain('{{');
    });

    it('builds contextual Spanish quick replies', () => {
      const replies = buildWhatsAppQuickReplies({
        clientName: 'Sofía Martínez',
        salonName: 'LAIKONA NAILS',
        address: 'Calle 25 Sur 1904, Puebla',
        appUrl: 'https://laikona.devand.net',
        nextBooking: {
          bookingId: 'bk-1',
          bookingCode: 'NL-1042',
          serviceName: 'Rubber',
          staffId: 'st-1',
          staffName: 'Karla',
          startAt: '2026-11-28T16:00:00.000Z',
          endAt: '2026-11-28T17:15:00.000Z',
          status: 'confirmed',
          attendanceStatus: 'pending',
          totalPriceCents: 38000,
          depositAmountCents: 15000,
          manageToken: 'tok-123',
        },
      });
      expect(replies.length).toBeGreaterThanOrEqual(4);
      expect(replies[0]?.text).toContain('Hola Sofía');
      expect(replies[0]?.text).toContain('Rubber');
      expect(replies.some((r) => r.text.includes('tok-123'))).toBe(true);
    });
  });
});
