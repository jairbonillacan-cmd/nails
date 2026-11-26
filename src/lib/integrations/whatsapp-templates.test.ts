import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildWhatsAppTemplatePayload,
  DEFAULT_WHATSAPP_MONTHLY_QUOTA,
  evaluateWhatsAppQuota,
  getOfficialWhatsAppTemplateSpec,
  getWhatsAppMonthKey,
  OFFICIAL_WHATSAPP_TEMPLATES,
  sanitizeWhatsAppTemplateParameter,
  selectWhatsAppDeliveryMode,
  type WhatsAppQuotaAlertLevel,
  type WhatsAppTemplateTriggerKey,
} from './whatsapp-templates';

const ALL_TRIGGERS: WhatsAppTemplateTriggerKey[] = [
  'booking_confirmed',
  'reminder_24h',
  'reminder_2h',
  'booking_rescheduled',
  'booking_canceled',
  'waitlist_offer',
];

const triggerArb = fc.constantFrom(...ALL_TRIGGERS);
const alertLevelArb = fc.constantFrom<WhatsAppQuotaAlertLevel>(
  'ok',
  'warning_80',
  'limit_100',
);

describe('WhatsApp Official UTILITY (es_MX) Templates Engine', () => {
  it('defines all 6 official UTILITY es_MX templates with unique trigger keys', () => {
    expect(OFFICIAL_WHATSAPP_TEMPLATES).toHaveLength(6);
    const keys = new Set(OFFICIAL_WHATSAPP_TEMPLATES.map((t) => t.triggerKey));
    expect(keys.size).toBe(6);
    for (const key of ALL_TRIGGERS) {
      const spec = getOfficialWhatsAppTemplateSpec(key);
      expect(spec.triggerKey).toBe(key);
      expect(spec.category).toBe('UTILITY');
      expect(spec.languageCode).toBe('es_MX');
    }
  });

  it('property (a): template parameters never contain raw newlines, tabs, or >4 consecutive spaces', () => {
    fc.assert(
      fc.property(
        triggerArb,
        fc.array(fc.string({ minLength: 0, maxLength: 200 }), { minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 10, maxLength: 18 }),
        (triggerKey, rawParams, phone) => {
          const payload = buildWhatsAppTemplatePayload({
            triggerKey,
            templateName: getOfficialWhatsAppTemplateSpec(triggerKey).defaultTemplateName,
            languageCode: 'es_MX',
            toPhoneDigits: phone,
            parameters: rawParams,
          });
          const bodyComponent = payload.template.components[0];
          expect(bodyComponent).toBeDefined();
          for (const param of bodyComponent?.parameters ?? []) {
            expect(param.type).toBe('text');
            expect(param.text.length).toBeGreaterThan(0);
            expect(/[\r\n\t]/.test(param.text)).toBe(false);
            expect(/ {5,}/.test(param.text)).toBe(false);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('property (b): outside 24h service window ALWAYS picks template (never text) when configured', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        alertLevelArb,
        fc.boolean(),
        (hasTemplate, quotaAlertLevel, whatsappCloudConfigured) => {
          const mode = selectWhatsAppDeliveryMode({
            hasTemplate,
            withinServiceWindow: false,
            quotaAlertLevel,
            whatsappCloudConfigured,
          });

          expect(mode).not.toBe('text');

          if (whatsappCloudConfigured && quotaAlertLevel !== 'limit_100' && hasTemplate) {
            expect(mode).toBe('template');
          } else {
            expect(mode).toBe('fallback_email_wame');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('allows text delivery ONLY inside 24h service window when no template is provided and quota allows', () => {
    expect(
      selectWhatsAppDeliveryMode({
        hasTemplate: false,
        withinServiceWindow: true,
        quotaAlertLevel: 'ok',
        whatsappCloudConfigured: true,
      }),
    ).toBe('text');

    expect(
      selectWhatsAppDeliveryMode({
        hasTemplate: true,
        withinServiceWindow: true,
        quotaAlertLevel: 'ok',
        whatsappCloudConfigured: true,
      }),
    ).toBe('template');

    expect(
      selectWhatsAppDeliveryMode({
        hasTemplate: false,
        withinServiceWindow: true,
        quotaAlertLevel: 'limit_100',
        whatsappCloudConfigured: true,
      }),
    ).toBe('fallback_email_wame');
  });

  it('property (c): quota thresholds trigger warning_80 at >= 80% (400/500) and limit_100 at >= 100% (500/500)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1200 }), (sentCount) => {
        const result = evaluateWhatsAppQuota(sentCount, DEFAULT_WHATSAPP_MONTHLY_QUOTA);
        expect(result.quotaLimit).toBe(500);
        expect(result.sentCount).toBe(sentCount);
        expect(result.remaining).toBe(Math.max(0, 500 - sentCount));

        if (sentCount >= 500) {
          expect(result.alertLevel).toBe('limit_100');
          expect(result.percentUsed).toBe(100);
        } else if (sentCount >= 400) {
          expect(result.alertLevel).toBe('warning_80');
          expect(result.percentUsed).toBeGreaterThanOrEqual(80);
        } else {
          expect(result.alertLevel).toBe('ok');
          expect(result.percentUsed).toBeLessThanOrEqual(80);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('property (d): payload always carries messaging_product=whatsapp, type=template, and language.code=es_MX', () => {
    fc.assert(
      fc.property(
        triggerArb,
        fc.string({ minLength: 0, maxLength: 40 }),
        fc.string({ minLength: 10, maxLength: 20 }),
        fc.array(fc.string({ minLength: 0, maxLength: 60 }), { minLength: 0, maxLength: 6 }),
        (triggerKey, templateName, phone, parameters) => {
          const payload = buildWhatsAppTemplatePayload({
            triggerKey,
            templateName,
            languageCode: 'es_MX',
            toPhoneDigits: phone,
            parameters,
          });
          expect(payload.messaging_product).toBe('whatsapp');
          expect(payload.type).toBe('template');
          expect(payload.template.language.code).toBe('es_MX');
          expect(payload.template.name.length).toBeGreaterThan(0);
          expect(/^[0-9]*$/.test(payload.to)).toBe(true);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('sanitizes whitespace-only parameters to non-empty dash and formats YYYY-MM month key', () => {
    expect(sanitizeWhatsAppTemplateParameter('  \n\t\r  ')).toBe('-');
    expect(sanitizeWhatsAppTemplateParameter('Hola\n\t    Andrea     Ruiz')).toBe(
      'Hola Andrea Ruiz',
    );
    expect(getWhatsAppMonthKey(new Date('2026-11-25T18:00:00.000Z'))).toBe('2026-11');
  });
});
