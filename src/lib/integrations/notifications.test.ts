import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialDemoDatabase } from '../demo-seed';
import type { BookingWithRelations } from '../types';
import {
  dispatchEmailNotification,
  dispatchRetentionWarningEmail,
  dispatchSalonAlertEmail,
  dispatchWhatsAppNotification,
  renderBookingEmailHtml,
  renderRetentionWarningEmailHtml,
  type RetentionWarningAsset,
} from './notifications';
import {
  buildClientOtpTemplatePayload,
  RESEND_TEMPLATE_ALIASES,
} from './resend-templates';

const mockResendEmailsSend = vi.fn();

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = {
      send: (...args: unknown[]) => mockResendEmailsSend(...args),
    };
  },
}));

const mockGetWhatsAppMonthlyUsage = vi.fn();
const mockGetWhatsAppTemplates = vi.fn();
const mockIncrementWhatsAppMonthlyUsage = vi.fn();
const mockClaimWebhookEventIdempotent = vi.fn();

vi.mock('../repositories/db', () => ({
  getWhatsAppMonthlyUsage: (...args: unknown[]) => mockGetWhatsAppMonthlyUsage(...args),
  getWhatsAppTemplates: (...args: unknown[]) => mockGetWhatsAppTemplates(...args),
  incrementWhatsAppMonthlyUsage: (...args: unknown[]) =>
    mockIncrementWhatsAppMonthlyUsage(...args),
  claimWebhookEventIdempotent: (...args: unknown[]) =>
    mockClaimWebhookEventIdempotent(...args),
}));

function buildSampleBooking(): {
  booking: BookingWithRelations;
  settings: ReturnType<typeof createInitialDemoDatabase>['settings'];
} {
  const db = createInitialDemoDatabase();
  const raw = db.bookings[0];
  const service = db.services.find((s) => s.id === raw?.serviceId);
  const staff = db.staff.find((s) => s.id === raw?.staffId);
  const client = db.clients.find((c) => c.id === raw?.clientId);
  if (!raw || !service || !staff || !client) {
    throw new Error('Missing seed booking relations');
  }
  return {
    booking: { ...raw, service, staff, client },
    settings: db.settings,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('Laikona Nails Resend Emails & WhatsApp Official UTILITY Dispatch', () => {
  it('renders Laikona Nails editorial booking HTML and escapes all dynamic XSS payloads', () => {
    const html = renderBookingEmailHtml({
      salonName: 'Laikona Nails <script>alert(1)</script>',
      bodyText: 'Hola <img src=x onerror=alert(1)>\nTu cita en Puebla está confirmada.',
      manageUrl: 'https://laikona.mx/cita/tok-123',
      address: 'Blvd. Héroes del 5 de Mayo "Puebla" <b onclick=evil()>',
      instagramHandle: '@laikona.nailsss <svg onload=evil()>',
      bookingCode: 'NL-<script>x</script>',
      whatsappUrl: 'javascript:alert(1)',
      speiDetails: {
        bankName: 'Mercado Pago <b>X</b>',
        beneficiary: 'Karla <script>',
        clabe: '7229 6901 3959 779869',
        depositAmountLabel: '$200 MXN',
      },
      hasCalendarAttachment: true,
    });

    expect(html).toContain('#FFFFFF');
    expect(html).toContain('#FCF5F6');
    expect(html).toContain('#8B1E2B');
    expect(html).toContain('Source Serif 4');
    expect(html).toContain('DM Sans');
    expect(html).toContain('7229 6901 3959 779869');
    expect(html).toContain('href="https://laikona.mx/cita/tok-123"');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img ');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain(
      '&lt;img src=x onerror=alert(1)&gt;<br/>Tu cita en Puebla está confirmada.',
    );
    expect(html).toContain('&lt;svg onload=evil()&gt;');
  });

  it('dispatches Resend booking email via published branded template and preserves RFC 5545 .ics attachment', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_laikona_key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'Laikona Nails <citas@laikona.mx>');
    mockResendEmailsSend.mockResolvedValue({ data: { id: 're_msg_123' }, error: null });

    const { booking, settings } = buildSampleBooking();
    const res = await dispatchEmailNotification({
      to: 'clienta@example.com',
      subject: 'Confirmación de cita',
      bodyText: 'Te esperamos en Laikona Nails.',
      booking,
      settings,
      appUrl: 'https://laikona.mx/',
      idempotencyKey: 'confirm-test-1',
    });

    expect(res.status).toBe('sent');
    expect(res.providerMessageId).toBe('re_msg_123');
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(1);
    const callArg = mockResendEmailsSend.mock.calls[0]?.[0] as {
      from: string;
      to: string;
      template: { id: string; variables: Record<string, string | number> };
      attachments: Array<{ filename: string; content: Buffer }>;
    };
    const reqOpts = mockResendEmailsSend.mock.calls[0]?.[1] as {
      idempotencyKey?: string;
    };
    expect(callArg.from).toBe('Laikona Nails <citas@laikona.mx>');
    expect(callArg.template.id).toBe(RESEND_TEMPLATE_ALIASES.bookingConfirmed);
    expect(callArg.template.variables.BOOKING_CODE).toBe(booking.bookingCode);
    expect(callArg.template.variables.SALON_NAME).toBe(settings.name);
    expect(reqOpts.idempotencyKey).toBe('confirm-test-1');
    expect(callArg.attachments).toHaveLength(1);
    expect(callArg.attachments[0]?.filename).toBe(`cita-${booking.bookingCode}.ics`);
    expect(callArg.attachments[0]?.content.toString('utf8')).toContain('BEGIN:VCALENDAR');
  });

  it('selects situation-specific Resend templates (SPEI, canceled, salon alert, retention, OTP) and falls back to HTML on template error', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_laikona_key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'LAIKONA NAILS <citas@laikona.devand.net>');

    const { booking, settings } = buildSampleBooking();
    const pendingSpeiBooking: BookingWithRelations = {
      ...booking,
      status: 'pending_confirmation',
    };

    mockResendEmailsSend
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Template not found in workspace' },
      })
      .mockResolvedValueOnce({ data: { id: 're_html_fallback_1' }, error: null });

    const fallbackRes = await dispatchEmailNotification({
      to: 'clienta@example.com',
      subject: 'Anticipo SPEI',
      bodyText: 'Envía tu comprobante SPEI.',
      booking: pendingSpeiBooking,
      settings,
      appUrl: 'https://laikona.devand.net',
    });
    expect(fallbackRes.status).toBe('sent');
    expect(fallbackRes.providerMessageId).toBe('re_html_fallback_1');
    expect(mockResendEmailsSend).toHaveBeenCalledTimes(2);
    const firstAttempt = mockResendEmailsSend.mock.calls[0]?.[0] as {
      template: { id: string; variables: Record<string, string | number> };
    };
    const secondAttempt = mockResendEmailsSend.mock.calls[1]?.[0] as {
      html: string;
    };
    expect(firstAttempt.template.id).toBe(RESEND_TEMPLATE_ALIASES.bookingPendingSpei);
    expect(firstAttempt.template.variables.CLABE).toBe(settings.depositClabe);
    expect(secondAttempt.html).toContain('#8B1E2B');

    mockResendEmailsSend.mockReset();
    mockResendEmailsSend.mockResolvedValue({ data: { id: 're_tpl_ok' }, error: null });

    const canceledRes = await dispatchEmailNotification({
      to: 'clienta@example.com',
      subject: 'Cita cancelada',
      bodyText: 'Tu cita fue cancelada.',
      booking: { ...booking, status: 'canceled', cancellationReason: 'Cambio de planes' },
      settings,
      appUrl: 'https://laikona.devand.net',
      situation: 'canceled',
    });
    expect(canceledRes.status).toBe('sent');
    const canceledArg = mockResendEmailsSend.mock.calls[0]?.[0] as {
      template: { id: string; variables: Record<string, string | number> };
      attachments?: unknown[];
    };
    expect(canceledArg.template.id).toBe(RESEND_TEMPLATE_ALIASES.bookingCanceled);
    expect(canceledArg.template.variables.CANCELLATION_NOTE).toBe('Cambio de planes');
    expect(canceledArg.attachments).toBeUndefined();

    const alertRes = await dispatchSalonAlertEmail({
      to: 'jairbonillacan@gmail.com',
      subject: 'Aviso al estudio',
      bodyText: 'Reagendada',
      kind: 'rescheduled',
      booking,
      settings,
      appUrl: 'https://laikona.devand.net',
    });
    expect(alertRes.status).toBe('sent');
    const alertArg = mockResendEmailsSend.mock.calls[1]?.[0] as {
      template: { id: string; variables: Record<string, string | number> };
    };
    expect(alertArg.template.id).toBe(RESEND_TEMPLATE_ALIASES.salonAlert);
    expect(alertArg.template.variables.ADMIN_URL).toBe(
      'https://laikona.devand.net/admin/citas',
    );

    const otpPayload = buildClientOtpTemplatePayload({
      clientName: 'Sofía',
      otpCode: '123456',
      expiresMinutes: 5,
      settings,
      appUrl: 'https://laikona.devand.net',
    });
    expect(otpPayload.id).toBe(RESEND_TEMPLATE_ALIASES.clientOtp);
    expect(otpPayload.variables.OTP_CODE).toBe('123456');
  });

  it('renders and dispatches 30d and 7d retention warning emails with Laikona branding and XSS escaping', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const { settings } = buildSampleBooking();
    const assets: RetentionWarningAsset[] = [
      {
        id: 'asset-1',
        storagePath: 'proofs/<script>alert(1)</script>.png',
        folder: 'proofs',
        bookingId: 'bk-1',
        createdAt: '2025-11-20T16:00:00.000Z',
        sizeBytes: 245_000,
      },
      {
        id: 'asset-2',
        storagePath: 'inspo/design-02.webp',
        folder: 'inspo',
        bookingId: 'bk-2',
        createdAt: '2025-11-21T16:00:00.000Z',
        sizeBytes: 512_000,
      },
    ];

    const html30 = renderRetentionWarningEmailHtml({
      stage: '30d',
      assets,
      settings,
      appUrl: 'https://laikona.mx/',
    });
    expect(html30).toContain('#8B1E2B');
    expect(html30).toContain('#FCF5F6');
    expect(html30).toContain('30 días');
    expect(html30).toContain('https://laikona.mx/admin/caja?tab=anticipos');
    expect(html30).toContain('permanecen intactos');
    expect(html30).not.toContain('<script>');
    expect(html30).toContain('proofs/&lt;script&gt;alert(1)&lt;/script&gt;.png');

    const html7 = renderRetentionWarningEmailHtml({
      stage: '7d',
      assets,
      settings,
      appUrl: 'https://laikona.mx',
    });
    expect(html7).toContain('7 días');
    expect(html7).toContain('Último aviso');

    const demoDispatch = await dispatchRetentionWarningEmail({
      to: 'karla@laikona.mx',
      stage: '7d',
      assets,
      settings,
      appUrl: 'https://laikona.mx',
    });
    expect(demoDispatch.status).toBe('sent');
    expect(demoDispatch.providerMessageId).toContain('demo-resend-retention-7d-');
  });

  it('sends official Meta Graph API v21 UTILITY es_MX template and records monthly usage once', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'wa-live-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '10987654321');
    mockGetWhatsAppMonthlyUsage.mockResolvedValue({
      monthKey: '2026-11',
      sentCount: 42,
      quotaLimit: 500,
      percentUsed: 8,
      alertLevel: 'ok',
      warned80At: null,
      warned100At: null,
    });
    mockGetWhatsAppTemplates.mockResolvedValue([
      {
        id: 'tpl-1',
        triggerKey: 'booking_confirmed',
        templateName: 'laikona_cita_confirmada',
        category: 'UTILITY',
        languageCode: 'es_MX',
        isActive: true,
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ]);
    mockClaimWebhookEventIdempotent.mockResolvedValue(true);
    mockIncrementWhatsAppMonthlyUsage.mockResolvedValue({
      monthKey: '2026-11',
      sentCount: 43,
      quotaLimit: 500,
      percentUsed: 9,
      alertLevel: 'ok',
      warned80At: null,
      warned100At: null,
    });

    let capturedUrl = '';
    let capturedBody: Record<string, unknown> = {};
    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      return new Response(
        JSON.stringify({ messages: [{ id: 'wamid.HBgLNTIyMjIxMDAwMDAw' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await dispatchWhatsAppNotification({
      toPhoneE164: '+522221000000',
      bodyText: 'Cita confirmada',
      triggerKey: 'booking_confirmed',
      templateParameters: ['Andrea\nRuiz', 'Rubber\tBase     Natural'],
      withinServiceWindow: false,
      monthKey: '2026-11',
      fetchImpl: mockFetch,
    });

    expect(result.status).toBe('sent');
    expect(result.deliveryMode).toBe('template');
    expect(result.providerMessageId).toBe('wamid.HBgLNTIyMjIxMDAwMDAw');
    expect(capturedUrl).toBe('https://graph.facebook.com/v21.0/10987654321/messages');
    expect(capturedBody).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '522221000000',
      type: 'template',
      template: {
        name: 'laikona_cita_confirmada',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Andrea Ruiz' },
              { type: 'text', text: 'Rubber Base Natural' },
            ],
          },
        ],
      },
    });
    expect(mockClaimWebhookEventIdempotent).toHaveBeenCalledWith(
      'whatsapp_usage',
      'wamid.HBgLNTIyMjIxMDAwMDAw',
    );
    expect(mockIncrementWhatsAppMonthlyUsage).toHaveBeenCalledWith('2026-11', 1);
  });

  it('sends free-form text ONLY inside 24h service window when no template is requested', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'wa-live-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '10987654321');
    mockGetWhatsAppMonthlyUsage.mockResolvedValue({
      monthKey: '2026-11',
      sentCount: 10,
      quotaLimit: 500,
      percentUsed: 2,
      alertLevel: 'ok',
      warned80At: null,
      warned100At: null,
    });

    const sentBodies: Array<Record<string, unknown>> = [];
    const mockFetch: typeof fetch = async (_input, init) => {
      sentBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.text-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const outsideWindow = await dispatchWhatsAppNotification({
      toPhoneE164: '+522221000000',
      bodyText: 'Seguimiento sin plantilla',
      withinServiceWindow: false,
      monthKey: '2026-11',
      fetchImpl: mockFetch,
    });
    expect(outsideWindow.status).toBe('failed');
    expect(outsideWindow.deliveryMode).toBe('fallback_email_wame');
    expect(outsideWindow.fallbackWaMeUrl).toContain('https://wa.me/522221000000');
    expect(sentBodies).toHaveLength(0);

    const insideWindow = await dispatchWhatsAppNotification({
      toPhoneE164: '+522221000000',
      bodyText: 'Respuesta dentro de ventana',
      withinServiceWindow: true,
      monthKey: '2026-11',
      fetchImpl: mockFetch,
    });
    expect(insideWindow.status).toBe('sent');
    expect(insideWindow.deliveryMode).toBe('text');
    expect(sentBodies).toHaveLength(1);
    expect(sentBodies[0]?.type).toBe('text');
  });

  it('degrades cleanly to fallback email + wa.me when monthly quota hits 500/500 limit', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'wa-live-token');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '10987654321');
    vi.stubEnv('RESEND_API_KEY', '');
    mockGetWhatsAppMonthlyUsage.mockResolvedValue({
      monthKey: '2026-11',
      sentCount: 500,
      quotaLimit: 500,
      percentUsed: 100,
      alertLevel: 'limit_100',
      warned80At: '2026-11-20T00:00:00.000Z',
      warned100At: '2026-11-25T00:00:00.000Z',
    });
    mockGetWhatsAppTemplates.mockResolvedValue([]);

    const fetchSpy = vi.fn();
    const { booking, settings } = buildSampleBooking();

    const result = await dispatchWhatsAppNotification({
      toPhoneE164: '+522221000000',
      bodyText: 'Recordatorio de cita',
      triggerKey: 'reminder_24h',
      withinServiceWindow: false,
      monthKey: '2026-11',
      fallbackEmail: {
        to: 'clienta@example.com',
        subject: 'Recordatorio de tu cita',
        booking,
        settings,
        appUrl: 'https://laikona.mx',
      },
      fetchImpl: fetchSpy,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.deliveryMode).toBe('fallback_email_wame');
    expect(result.status).toBe('sent');
    expect(result.providerMessageId).toContain('demo-resend-');
    expect(result.fallbackWaMeUrl).toContain('https://wa.me/522221000000');
  });
});
