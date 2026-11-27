import { describe, expect, it } from 'vitest';
import type {
  WhatsAppMessageDTO,
  WhatsAppServiceWindowDTO,
  WhatsAppThreadBookingContextDTO,
} from '@/lib/contracts';
import {
  buildWaMeDirectUrl,
  filterManualWhatsAppTemplates,
  formatWhatsAppRelativeTime,
  formatWhatsAppWindowBadge,
  getWhatsAppAttendanceBadge,
  getWhatsAppDeliveryStatusMeta,
  getWhatsAppThreadSnippetPrefix,
  groupWhatsAppMessagesByDate,
  normalizeWhatsAppActionResult,
  prefillWhatsAppTemplateParameters,
  resolveWhatsAppBubbleDirection,
} from './whatsappUiHelpers';

const TZ = 'America/Mexico_City';

function makeMessage(overrides: Partial<WhatsAppMessageDTO> = {}): WhatsAppMessageDTO {
  return {
    id: 'msg-1',
    threadId: 'wth-1',
    phoneE164: '+522224123987',
    clientId: 'client-1',
    bookingId: null,
    notificationId: null,
    direction: 'inbound',
    senderKind: 'client',
    senderName: 'Sofía Ramírez',
    messageType: 'text',
    bodyText: 'Hola, confirmo mi cita',
    templateName: null,
    templateTriggerKey: null,
    templateParams: [],
    deliveryStatus: 'received',
    deliveryMode: 'inbound',
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    createdAt: '2026-11-27T18:00:00.000Z',
    ...overrides,
  };
}

const SAMPLE_BOOKING: WhatsAppThreadBookingContextDTO = {
  bookingId: 'bk-1042',
  bookingCode: 'NL-1042',
  serviceName: 'Rubber',
  staffId: 'karla',
  staffName: 'Karla',
  startAt: '2026-11-28T16:00:00.000Z',
  endAt: '2026-11-28T17:30:00.000Z',
  status: 'confirmed',
  attendanceStatus: 'pending',
  totalPriceCents: 45000,
  depositAmountCents: 20000,
  manageToken: 'demo-token-sofia-1042',
};

describe('whatsappUiHelpers', () => {
  it('formats relative Spanish timestamps for now, minutes, today, yesterday, and older dates', () => {
    const nowMs = Date.parse('2026-11-27T18:30:00.000Z');
    expect(formatWhatsAppRelativeTime(null, nowMs, TZ)).toBe('');
    expect(formatWhatsAppRelativeTime('2026-11-27T18:29:40.000Z', nowMs, TZ)).toBe('Ahora');
    expect(formatWhatsAppRelativeTime('2026-11-27T18:18:00.000Z', nowMs, TZ)).toBe('Hace 12 min');
    expect(formatWhatsAppRelativeTime('2026-11-27T16:00:00.000Z', nowMs, TZ)).toMatch(/10:00/);
    expect(formatWhatsAppRelativeTime('2026-11-26T18:00:00.000Z', nowMs, TZ)).toBe('Ayer');
    expect(formatWhatsAppRelativeTime('2026-11-14T18:00:00.000Z', nowMs, TZ)).toMatch(
      /14\s+(?:de\s+)?nov/i,
    );
  });

  it('groups messages chronologically by local date without mutating input array', () => {
    const nowMs = Date.parse('2026-11-27T20:00:00.000Z');
    const input = [
      makeMessage({ id: 'm3', createdAt: '2026-11-27T19:00:00.000Z' }),
      makeMessage({ id: 'm1', createdAt: '2026-11-25T16:00:00.000Z' }),
      makeMessage({ id: 'm2', createdAt: '2026-11-26T18:00:00.000Z' }),
    ];
    const groups = groupWhatsAppMessagesByDate(input, nowMs, TZ);
    expect(input.map((m) => m.id)).toEqual(['m3', 'm1', 'm2']);
    expect(groups.map((g) => g.label)).toEqual([
      expect.stringMatching(/25\s+(?:de\s+)?nov/i),
      'Ayer',
      'Hoy',
    ]);
    expect(groups[2]?.messages.map((m) => m.id)).toEqual(['m3']);
  });

  it('computes live 24h Meta session badge text and tones', () => {
    const baseMs = Date.parse('2026-11-27T18:00:00.000Z');
    const openWindow: WhatsAppServiceWindowDTO = {
      isOpen: true,
      lastInboundAt: '2026-11-27T13:15:00.000Z',
      expiresAt: '2026-11-28T13:15:00.000Z',
      remainingMinutes: 1155,
    };
    const openMeta = formatWhatsAppWindowBadge(openWindow, baseMs);
    expect(openMeta.isOpen).toBe(true);
    expect(openMeta.tone).toBe('success');
    expect(openMeta.label).toBe('Ventana 24 h · 19 h 15 min');

    const expiringMeta = formatWhatsAppWindowBadge(
      openWindow,
      Date.parse('2026-11-28T12:00:00.000Z'),
    );
    expect(expiringMeta.isOpen).toBe(true);
    expect(expiringMeta.tone).toBe('warning');
    expect(expiringMeta.label).toBe('Ventana 24 h · 1 h 15 min');

    const closedMeta = formatWhatsAppWindowBadge(
      openWindow,
      Date.parse('2026-11-28T14:00:00.000Z'),
    );
    expect(closedMeta.isOpen).toBe(false);
    expect(closedMeta.tone).toBe('warning');
    expect(closedMeta.label).toBe('Ventana cerrada · Solo plantilla');
  });

  it('maps bubble directions, thread snippet prefixes, delivery labels, and attendance tags', () => {
    expect(
      resolveWhatsAppBubbleDirection({
        direction: 'inbound',
        senderKind: 'client',
        messageType: 'text',
      }),
    ).toBe('inbound');
    expect(
      resolveWhatsAppBubbleDirection({
        direction: 'outbound',
        senderKind: 'staff',
        messageType: 'text',
      }),
    ).toBe('outbound');
    expect(
      resolveWhatsAppBubbleDirection({
        direction: 'outbound',
        senderKind: 'automation',
        messageType: 'template',
      }),
    ).toBe('bot');
    expect(
      resolveWhatsAppBubbleDirection({
        direction: 'echo',
        senderKind: 'coexistence_phone',
        messageType: 'text',
      }),
    ).toBe('echo');
    expect(
      resolveWhatsAppBubbleDirection({
        direction: 'outbound',
        senderKind: 'automation',
        messageType: 'system',
      }),
    ).toBe('system');

    expect(
      getWhatsAppThreadSnippetPrefix({
        lastMessageDirection: 'outbound',
        lastSenderKind: 'staff',
      }),
    ).toBe('Tú: ');
    expect(
      getWhatsAppThreadSnippetPrefix({
        lastMessageDirection: 'outbound',
        lastSenderKind: 'automation',
      }),
    ).toBe('Bot: ');
    expect(
      getWhatsAppThreadSnippetPrefix({
        lastMessageDirection: 'echo',
        lastSenderKind: 'coexistence_phone',
      }),
    ).toBe('Celular: ');
    expect(
      getWhatsAppThreadSnippetPrefix({
        lastMessageDirection: 'inbound',
        lastSenderKind: 'client',
      }),
    ).toBe('');

    expect(getWhatsAppDeliveryStatusMeta('queued').label).toBe('En cola');
    expect(getWhatsAppDeliveryStatusMeta('sent').label).toBe('Enviado');
    expect(getWhatsAppDeliveryStatusMeta('delivered').label).toBe('Entregado');
    expect(getWhatsAppDeliveryStatusMeta('read').label).toBe('Leído');
    expect(getWhatsAppDeliveryStatusMeta('failed').label).toBe('No enviado');
    expect(getWhatsAppDeliveryStatusMeta('received').label).toBe('Recibido');

    expect(getWhatsAppAttendanceBadge('confirmed')?.label).toBe('Confirmó asistencia');
    expect(getWhatsAppAttendanceBadge('rescheduled')?.label).toBe('Solicitó reagendar');
    expect(getWhatsAppAttendanceBadge('pending')).toBeNull();
  });

  it('auto-fills template parameters from booking, client, and studio context', () => {
    const confirmedParams = prefillWhatsAppTemplateParameters('booking_confirmed', {
      clientName: 'Sofía Ramírez',
      nextBooking: SAMPLE_BOOKING,
      timezone: TZ,
      appUrl: 'https://laikona.devand.net/',
    });
    expect(confirmedParams[0]).toBe('Sofía');
    expect(confirmedParams[1]).toBe('Rubber');
    expect(confirmedParams[4]).toBe('Karla');
    expect(confirmedParams[5]).toBe('https://laikona.devand.net/cita/demo-token-sofia-1042');

    const reminder2hParams = prefillWhatsAppTemplateParameters('reminder_2h', {
      clientName: 'Andrea López',
      studioAddress: 'Calle 25 Sur 1904, Puebla',
      nextBooking: SAMPLE_BOOKING,
      timezone: TZ,
    });
    expect(reminder2hParams[0]).toBe('Andrea');
    expect(reminder2hParams[2]).toBe('Calle 25 Sur 1904, Puebla');

    const depositRejectedParams = prefillWhatsAppTemplateParameters('deposit_rejected', {
      clientName: 'Andrea López',
      nextBooking: SAMPLE_BOOKING,
      appUrl: 'https://laikona.devand.net',
    });
    expect(depositRejectedParams[1]).toBe('NL-1042');
    expect(depositRejectedParams[2]).toBe('Rubber');

    const manualTemplates = filterManualWhatsAppTemplates();
    expect(manualTemplates.some((tpl) => tpl.triggerKey === 'client_otp')).toBe(false);
    expect(manualTemplates.length).toBe(8);
  });

  it('builds canonical wa.me URLs and normalizes action outcomes', () => {
    expect(buildWaMeDirectUrl('5212224123987')).toBe('https://wa.me/522224123987');
    expect(buildWaMeDirectUrl('222 412 3987', 'Hola Sofía')).toBe(
      'https://wa.me/522224123987?text=Hola%20Sof%C3%ADa',
    );

    expect(normalizeWhatsAppActionResult(true, 'err')).toEqual({
      ok: true,
      error: null,
      code: null,
      fallbackWaMeUrl: null,
    });
    expect(
      normalizeWhatsAppActionResult(
        {
          ok: false,
          error: 'Ventana cerrada',
          code: 'WINDOW_CLOSED',
          fallbackWaMeUrl: 'https://wa.me/522224123987',
        },
        'fallback',
      ),
    ).toEqual({
      ok: false,
      error: 'Ventana cerrada',
      code: 'WINDOW_CLOSED',
      fallbackWaMeUrl: 'https://wa.me/522224123987',
    });
    expect(normalizeWhatsAppActionResult(false, 'No se pudo enviar').error).toBe(
      'No se pudo enviar',
    );
  });
});
