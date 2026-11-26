import { Buffer } from 'node:buffer';
import { Resend } from 'resend';
import {
  buildTouchUpBookingUrl,
  computeSuggestedTouchUpDateKey,
} from '../booking/recurrence';
import { generateId } from '../clock';
import { getRuntimeIntegrationStatus } from '../env';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '../format';
import { generateBookingIcs } from '../ics';
import { logError, logWarn } from '../logger';
import { escapeHtml } from '../sanitize';
import type {
  BookingWithRelations,
  NotificationChannel,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
} from '../types';
import {
  buildBookingTemplatePayload,
  buildRetentionWarningTemplatePayload,
  buildSalonAlertTemplatePayload,
  resolveBookingEmailSituation,
  shouldAttachBookingCalendarIcs,
  type EmailTemplateSituation,
  type ResendTemplateDispatchPayload,
} from './resend-templates';
import {
  buildWhatsAppTemplatePayload,
  evaluateWhatsAppQuota,
  getOfficialWhatsAppTemplateSpec,
  getWhatsAppMonthKey,
  selectWhatsAppDeliveryMode,
  WHATSAPP_GRAPH_API_VERSION,
  type WhatsAppDeliveryMode,
  type WhatsAppTemplateTriggerKey,
} from './whatsapp-templates';

export interface NotificationDispatchResult {
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  errorMessage: string | null;
  deliveryMode?: WhatsAppDeliveryMode;
  fallbackWaMeUrl?: string;
}

export interface BookingEmailSpeiDetails {
  bankName: string;
  beneficiary: string;
  clabe: string;
  depositAmountLabel: string;
}

export interface RetentionWarningAsset {
  id: string;
  storagePath: string;
  folder: 'proofs' | 'inspo' | 'gallery';
  bookingId: string | null;
  createdAt: string;
  sizeBytes: number;
}

export interface WhatsAppDispatchParams {
  toPhoneE164: string;
  bodyText: string;
  triggerKey?: WhatsAppTemplateTriggerKey;
  templateName?: string;
  templateParameters?: readonly string[];
  interactiveButtons?: ReadonlyArray<{ id: string; title: string }>;
  withinServiceWindow?: boolean;
  fallbackEmail?: {
    to: string;
    subject: string;
    booking?: BookingWithRelations;
    settings: SalonSettings;
    appUrl: string;
    situation?: EmailTemplateSituation;
    template?: ResendTemplateDispatchPayload;
    idempotencyKey?: string;
  };
  settingsTimezone?: string;
  monthKey?: string;
  fetchImpl?: typeof fetch;
}

const HTTP_TIMEOUT_MS = 8_000;

function createRequestSignal(timeoutMs = HTTP_TIMEOUT_MS): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function renderNotificationTemplate(
  template: string,
  booking: BookingWithRelations,
  settings: SalonSettings,
  appUrl: string,
): string {
  const normalizedUrl = appUrl.replace(/\/+$/, '');
  const manageUrl = `${normalizedUrl}/cita/${booking.manageToken}`;
  const confirmUrl = `${manageUrl}?action=confirm`;
  const rescheduleUrl = `${manageUrl}?action=reschedule`;
  const bookingUrl = `${normalizedUrl}/reservar`;
  const tz = settings.timezone || 'America/Mexico_City';
  const suggestedTouchUpDate = computeSuggestedTouchUpDateKey({
    startAt: booking.endAt || booking.startAt,
    daysAhead: 21,
    timezone: tz,
  });
  const touchUpUrl = `${normalizedUrl}${buildTouchUpBookingUrl({
    serviceSlug: booking.service.slug,
    staffSlug: booking.staff.bookingSlug,
    suggestedDateKey: suggestedTouchUpDate,
  })}`;
  const addonsText =
    booking.addons.length > 0
      ? ` + ${booking.addons.map((a) => a.name).join(', ')}`
      : '';

  const replacements: Record<string, string> = {
    '{{salon_name}}': settings.name,
    '{{booking_code}}': booking.bookingCode,
    '{{client_name}}': booking.client.fullName,
    '{{service_name}}': `${booking.service.name}${addonsText}`,
    '{{staff_name}}': booking.staff.name,
    '{{date_label}}': formatDateLongInTimezone(booking.startAt, tz),
    '{{time_label}}': formatTimeInTimezone(booking.startAt, tz, false),
    '{{address}}': settings.address,
    '{{manage_url}}': manageUrl,
    '{{confirm_url}}': confirmUrl,
    '{{reschedule_url}}': rescheduleUrl,
    '{{booking_url}}': bookingUrl,
    '{{touchup_url}}': touchUpUrl,
  };

  let out = template;
  for (const [token, val] of Object.entries(replacements)) {
    out = out.split(token).join(val);
  }
  return out;
}

export function buildBookingWhatsAppFallbackUrl(
  booking: BookingWithRelations,
  settings: SalonSettings,
  appUrl: string,
): string {
  const normalizedUrl = appUrl.replace(/\/+$/, '');
  const tz = settings.timezone || 'America/Mexico_City';
  const msg = `Hola ${settings.name}, acabo de agendar mi cita (${booking.bookingCode}) de ${booking.service.name} el ${formatDateLongInTimezone(
    booking.startAt,
    tz,
  )} a las ${formatTimeInTimezone(booking.startAt, tz, false)}. Link de mi cita: ${normalizedUrl}/cita/${booking.manageToken}`;
  return buildWhatsAppLink(settings.whatsappNumber, msg);
}

function sanitizeEmailHref(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch (err) {
    logWarn('notification_invalid_email_href', { error: err });
    return '#';
  }
  return '#';
}

function formatByteSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function friendlyAssetFolderLabel(folder: RetentionWarningAsset['folder']): string {
  if (folder === 'proofs') return 'Comprobante SPEI';
  if (folder === 'inspo') return 'Foto de referencia';
  return 'Galería';
}

function resolveFromAddress(salonName: string): string {
  const safeFromName = salonName.replace(/[\r\n<>"]/g, '').trim() || 'Laikona Nails';
  return process.env.RESEND_FROM_EMAIL?.trim() || `${safeFromName} <onboarding@resend.dev>`;
}

function resolveReplyToAddress(settings: SalonSettings): string | undefined {
  const candidate =
    settings.retentionNoticeEmail?.trim() || settings.contactEmail?.trim() || '';
  return candidate.includes('@') ? candidate : undefined;
}

function isResendTemplateError(message: string | undefined): boolean {
  return Boolean(message && /template/i.test(message));
}

export function renderBookingEmailHtml(params: {
  salonName: string;
  bodyText: string;
  manageUrl: string;
  primaryCtaLabel?: string;
  secondaryAction?: { label: string; href: string } | null;
  address: string;
  instagramHandle?: string;
  bookingCode?: string;
  whatsappUrl?: string;
  speiDetails?: BookingEmailSpeiDetails | null;
  hasCalendarAttachment?: boolean;
}): string {
  const safeHref = escapeHtml(sanitizeEmailHref(params.manageUrl));
  const safePrimaryCtaLabel = escapeHtml(
    params.primaryCtaLabel?.trim() || 'Ver, agregar al calendario o reagendar',
  );
  const safeSecondaryHref = params.secondaryAction?.href
    ? escapeHtml(sanitizeEmailHref(params.secondaryAction.href))
    : '';
  const secondaryCtaHtml =
    safeSecondaryHref && safeSecondaryHref !== '#' && params.secondaryAction?.label
      ? `<a href="${safeSecondaryHref}" style="display: inline-block; margin-left: 8px; margin-top: 8px; padding: 12px 20px; background: #FFFFFF; color: #8B1E2B; border: 1px solid #8B1E2B; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 600;">${escapeHtml(params.secondaryAction.label)}</a>`
      : '';
  const safeSalonName = escapeHtml(params.salonName);
  const safeAddress = escapeHtml(params.address);
  const safeInstagram = escapeHtml(params.instagramHandle?.trim() || '@laikona.nailsss');
  const escapedBodyHtml = params.bodyText
    .split(/\r?\n/)
    .map((line) => escapeHtml(line))
    .join('<br/>');

  const bookingCodeBadgeHtml = params.bookingCode?.trim()
    ? `<p style="margin: 10px 0 0; display: inline-block; padding: 4px 12px; border-radius: 999px; background: #FCF5F6; border: 1px solid #EFE0E2; color: #8B1E2B; font-size: 12px; font-weight: 600; letter-spacing: 0.04em;">Cita ${escapeHtml(params.bookingCode.trim())}</p>`
    : '';

  const speiBlockHtml = params.speiDetails
    ? [
        '<div style="margin-top: 20px; padding: 16px 18px; background: #FCF5F6; border: 1px solid #EFE0E2; border-radius: 12px;">',
        '  <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #8B1E2B;">Anticipo por transferencia SPEI</p>',
        `  <p style="margin: 0 0 4px; font-size: 14px; color: #241C1E;"><strong>Monto:</strong> ${escapeHtml(params.speiDetails.depositAmountLabel)}</p>`,
        `  <p style="margin: 0 0 4px; font-size: 14px; color: #241C1E;"><strong>Banco:</strong> ${escapeHtml(params.speiDetails.bankName)} · <strong>Titular:</strong> ${escapeHtml(params.speiDetails.beneficiary)}</p>`,
        `  <p style="margin: 0; font-size: 14px; color: #241C1E; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;"><strong>CLABE:</strong> ${escapeHtml(params.speiDetails.clabe)}</p>`,
        '</div>',
      ].join('\n')
    : '';

  const safeWhatsappHref = params.whatsappUrl
    ? escapeHtml(sanitizeEmailHref(params.whatsappUrl))
    : '';
  const whatsappLinkHtml =
    safeWhatsappHref && safeWhatsappHref !== '#'
      ? `<p style="margin: 12px 0 0;"><a href="${safeWhatsappHref}" style="color: #8B1E2B; font-size: 14px; font-weight: 600; text-decoration: underline;">Escribir por WhatsApp al estudio</a></p>`
      : '';

  const calendarHintHtml =
    params.hasCalendarAttachment !== false
      ? '<p style="margin: 16px 0 0; font-size: 13px; color: #6C6063;">Adjuntamos tu invitación de calendario (.ics) para guardarla en Apple Calendar, Google Calendar u Outlook.</p>'
      : '';

  return [
    '<div style="margin: 0; padding: 24px 12px; background: #FCF5F6; font-family: \'DM Sans\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Arial, sans-serif; color: #241C1E;">',
    '  <div style="max-width: 580px; margin: 0 auto; background: #FFFFFF; border: 1px solid #EFE0E2; border-radius: 16px; overflow: hidden;">',
    '    <div style="height: 4px; background: #8B1E2B;"></div>',
    '    <div style="padding: 28px 26px 24px;">',
    '      <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8B1E2B;">LAIKONA NAILS BY KARLA · PUEBLA</p>',
    `      <h2 style="font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.2; font-weight: 600; margin: 0; color: #241C1E;">${safeSalonName}</h2>`,
    `      ${bookingCodeBadgeHtml}`,
    `      <p style="margin: 20px 0 0; font-size: 15px; line-height: 1.65; color: #241C1E;">${escapedBodyHtml}</p>`,
    `      ${speiBlockHtml}`,
    '      <div style="margin-top: 24px;">',
    `        <a href="${safeHref}" style="display: inline-block; padding: 13px 22px; background: #8B1E2B; color: #FFFFFF; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 600;">${safePrimaryCtaLabel}</a>`,
    `        ${secondaryCtaHtml}`,
    `        ${whatsappLinkHtml}`,
    '      </div>',
    `      ${calendarHintHtml}`,
    '    </div>',
    '    <div style="padding: 16px 26px; background: #FCF5F6; border-top: 1px solid #EFE0E2;">',
    `      <p style="margin: 0; font-size: 13px; color: #6C6063;">${safeAddress}</p>`,
    `      <p style="margin: 4px 0 0; font-size: 12px; color: #8B1E2B; font-weight: 600;">Instagram ${safeInstagram}</p>`,
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');
}

export function renderRetentionWarningEmailHtml(params: {
  stage: '30d' | '7d';
  assets: readonly RetentionWarningAsset[];
  settings: SalonSettings;
  appUrl: string;
}): string {
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  const cajaHref = escapeHtml(sanitizeEmailHref(`${normalizedUrl}/admin/caja?tab=anticipos`));
  const safeSalonName = escapeHtml(params.settings.name || 'Laikona Nails by Karla');
  const safeAddress = escapeHtml(params.settings.address);
  const safeInstagram = escapeHtml(params.settings.instagramHandle?.trim() || '@laikona.nailsss');
  const tz = params.settings.timezone || 'America/Mexico_City';

  const daysRemainingLabel = params.stage === '7d' ? '7 días' : '30 días';
  const headingText =
    params.stage === '7d'
      ? 'Último aviso: respalda tus comprobantes en los próximos 7 días'
      : 'Aviso preventivo: respalda tus comprobantes antes de la limpieza anual';
  const introText =
    params.stage === '7d'
      ? `En 7 días se cumplirán 12 meses desde la carga de ${params.assets.length} archivo(s) de comprobantes o referencias y se eliminarán automáticamente del almacenamiento.`
      : `Dentro de 30 días se cumplirán 12 meses desde la carga de ${params.assets.length} archivo(s) de comprobantes o referencias y se eliminarán automáticamente del almacenamiento.`;

  const safeAssetsCount = Number(params.assets.length);
  const safeProofsCount = Number(params.assets.filter((a) => a.folder === 'proofs').length);
  const safeInspoCount = Number(params.assets.filter((a) => a.folder === 'inspo').length);
  const totalBytes = params.assets.reduce((sum, a) => sum + Math.max(0, a.sizeBytes), 0);
  const safeTotalSize = escapeHtml(formatByteSizeLabel(totalBytes));

  const visibleAssets = params.assets.slice(0, 20);
  const safeExtraCount = Number(Math.max(0, params.assets.length - visibleAssets.length));
  const rowsHtml = visibleAssets
    .map((asset) => {
      const safePath = escapeHtml(asset.storagePath);
      const safeFolder = escapeHtml(friendlyAssetFolderLabel(asset.folder));
      const safeDate = escapeHtml(formatDateShortInTimezone(asset.createdAt, tz));
      const safeSize = escapeHtml(formatByteSizeLabel(asset.sizeBytes));
      return `<tr><td style="padding: 8px 10px; border-bottom: 1px solid #EFE0E2; font-size: 13px; color: #241C1E;">${safeFolder}</td><td style="padding: 8px 10px; border-bottom: 1px solid #EFE0E2; font-size: 12px; color: #6C6063; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${safePath}</td><td style="padding: 8px 10px; border-bottom: 1px solid #EFE0E2; font-size: 13px; color: #241C1E;">${safeDate}</td><td style="padding: 8px 10px; border-bottom: 1px solid #EFE0E2; font-size: 13px; color: #6C6063; text-align: right;">${safeSize}</td></tr>`;
    })
    .join('\n');

  const extraRowHtml =
    safeExtraCount > 0
      ? `<p style="margin: 10px 0 0; font-size: 13px; color: #6C6063;">Y ${safeExtraCount} archivo(s) adicional(es) en este lote.</p>`
      : '';

  return [
    '<div style="margin: 0; padding: 24px 12px; background: #FCF5F6; font-family: \'DM Sans\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Arial, sans-serif; color: #241C1E;">',
    '  <div style="max-width: 620px; margin: 0 auto; background: #FFFFFF; border: 1px solid #EFE0E2; border-radius: 16px; overflow: hidden;">',
    '    <div style="height: 4px; background: #8B1E2B;"></div>',
    '    <div style="padding: 28px 26px 24px;">',
    `      <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #8B1E2B;">RESPALDO CONTABLE · ${escapeHtml(daysRemainingLabel.toUpperCase())}</p>`,
    `      <h2 style="font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.25; font-weight: 600; margin: 0; color: #241C1E;">${escapeHtml(headingText)}</h2>`,
    `      <p style="margin: 16px 0 0; font-size: 15px; line-height: 1.65; color: #241C1E;">${escapeHtml(introText)}</p>`,
    '      <div style="margin-top: 18px; padding: 14px 16px; background: #FCF5F6; border: 1px solid #EFE0E2; border-radius: 12px;">',
    `        <p style="margin: 0 0 6px; font-size: 14px; color: #241C1E;"><strong>Resumen del lote:</strong> ${safeAssetsCount} archivo(s) · ${safeProofsCount} comprobante(s) SPEI · ${safeInspoCount} foto(s) de referencia · ${safeTotalSize}</p>`,
    '        <p style="margin: 0; font-size: 13px; color: #6C6063;">Tu historial de citas, pagos, reportes de caja y datos de clientas permanecen intactos; solo se depuran las imágenes mayores a 12 meses.</p>',
    '      </div>',
    '      <table style="width: 100%; border-collapse: collapse; margin-top: 18px;">',
    '        <thead><tr><th style="text-align: left; padding: 8px 10px; border-bottom: 2px solid #EFE0E2; font-size: 12px; color: #6C6063;">Tipo</th><th style="text-align: left; padding: 8px 10px; border-bottom: 2px solid #EFE0E2; font-size: 12px; color: #6C6063;">Archivo</th><th style="text-align: left; padding: 8px 10px; border-bottom: 2px solid #EFE0E2; font-size: 12px; color: #6C6063;">Fecha</th><th style="text-align: right; padding: 8px 10px; border-bottom: 2px solid #EFE0E2; font-size: 12px; color: #6C6063;">Tamaño</th></tr></thead>',
    `        <tbody>${rowsHtml}</tbody>`,
    '      </table>',
    `      ${extraRowHtml}`,
    '      <div style="margin-top: 24px;">',
    `        <a href="${cajaHref}" style="display: inline-block; padding: 13px 22px; background: #8B1E2B; color: #FFFFFF; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 600;">Abrir Caja y respaldar comprobantes</a>`,
    '      </div>',
    '    </div>',
    '    <div style="padding: 16px 26px; background: #FCF5F6; border-top: 1px solid #EFE0E2;">',
    `      <p style="margin: 0; font-size: 13px; color: #6C6063;">${safeSalonName} · ${safeAddress}</p>`,
    `      <p style="margin: 4px 0 0; font-size: 12px; color: #8B1E2B; font-weight: 600;">Instagram ${safeInstagram}</p>`,
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');
}

export async function dispatchEmailNotification(params: {
  to: string;
  subject: string;
  bodyText: string;
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
  situation?: EmailTemplateSituation;
  touchUpUrl?: string;
  idempotencyKey?: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  const manageUrl = `${normalizedUrl}/cita/${params.booking.manageToken}`;

  if (!env.resendConfigured || !process.env.RESEND_API_KEY) {
    return {
      status: 'sent',
      providerMessageId: `demo-resend-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const situation = resolveBookingEmailSituation({
      booking: params.booking,
      settings: params.settings,
      situation: params.situation,
    });
    const includeCalendar = shouldAttachBookingCalendarIcs(situation);
    const attachments = includeCalendar
      ? [
          {
            filename: `cita-${params.booking.bookingCode}.ics`,
            content: Buffer.from(
              generateBookingIcs(params.booking, params.settings, manageUrl),
              'utf-8',
            ),
          },
        ]
      : undefined;
    const fromEmail = resolveFromAddress(params.settings.name);
    const replyTo = resolveReplyToAddress(params.settings);
    const whatsappUrl = buildBookingWhatsAppFallbackUrl(
      params.booking,
      params.settings,
      normalizedUrl,
    );
    const templatePayload = buildBookingTemplatePayload({
      booking: params.booking,
      settings: params.settings,
      appUrl: normalizedUrl,
      whatsappUrl,
      situation,
      touchUpUrl: params.touchUpUrl,
    });
    const requestOptions = params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : undefined;

    let result = await resend.emails.send(
      {
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        ...(replyTo ? { replyTo } : {}),
        ...(attachments ? { attachments } : {}),
        template: templatePayload,
      },
      requestOptions,
    );

    if (result.error && isResendTemplateError(result.error.message)) {
      logWarn('notification_email_template_fallback', {
        templateId: templatePayload.id,
        bookingCode: params.booking.bookingCode,
        error: result.error.message,
      });
      const isPendingDeposit =
        situation === 'pending_spei' &&
        params.settings.paymentMode === 'manual_transfer' &&
        Boolean(params.settings.depositClabe.trim());
      const depositCents =
        params.booking.depositAmountCents > 0
          ? params.booking.depositAmountCents
          : (params.settings.depositAmountCents ?? 20000);
      const speiDetails: BookingEmailSpeiDetails | null = isPendingDeposit
        ? {
            bankName: params.settings.depositBankName || 'Mercado Pago',
            beneficiary:
              params.settings.depositBeneficiary || params.settings.depositAccountHolder,
            clabe: params.settings.depositClabe,
            depositAmountLabel: formatCurrency(depositCents, params.settings.currency),
          }
        : null;
      const htmlPrimaryUrl =
        situation === 'reminder_24h'
          ? `${manageUrl}?action=confirm`
          : situation === 'touchup' && params.touchUpUrl
            ? params.touchUpUrl
            : manageUrl;
      const htmlPrimaryLabel =
        situation === 'reminder_24h'
          ? 'Confirmo asistencia'
          : situation === 'touchup'
            ? 'Agendar mi retoque'
            : undefined;
      const htmlSecondaryAction =
        situation === 'reminder_24h'
          ? { label: 'Necesito reagendar', href: `${manageUrl}?action=reschedule` }
          : null;
      result = await resend.emails.send(
        {
          from: fromEmail,
          to: params.to,
          subject: params.subject,
          ...(replyTo ? { replyTo } : {}),
          html: renderBookingEmailHtml({
            salonName: params.settings.name,
            bodyText: params.bodyText,
            manageUrl: htmlPrimaryUrl,
            primaryCtaLabel: htmlPrimaryLabel,
            secondaryAction: htmlSecondaryAction,
            address: params.settings.address,
            instagramHandle: params.settings.instagramHandle,
            bookingCode: params.booking.bookingCode,
            whatsappUrl,
            speiDetails,
            hasCalendarAttachment: includeCalendar,
          }),
          ...(attachments ? { attachments } : {}),
        },
        params.idempotencyKey
          ? { idempotencyKey: `${params.idempotencyKey}-html` }
          : undefined,
      );
    }

    if (result.error) {
      logError('notification_email_provider_error', {
        to: params.to,
        bookingCode: params.booking.bookingCode,
        error: result.error.message,
      });
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: result.error.message,
      };
    }

    return {
      status: 'sent',
      providerMessageId: result.data?.id ?? `resend-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    logError('notification_email_dispatch_exception', {
      to: params.to,
      bookingCode: params.booking.bookingCode,
      error: err,
    });
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando correo',
    };
  }
}

export async function dispatchSalonAlertEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  kind: 'canceled' | 'rescheduled';
  reason?: string;
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  if (!env.resendConfigured || !process.env.RESEND_API_KEY) {
    return {
      status: 'sent',
      providerMessageId: `demo-resend-alert-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = resolveFromAddress(params.settings.name);
    const replyTo = resolveReplyToAddress(params.settings);
    const templatePayload = buildSalonAlertTemplatePayload({
      kind: params.kind,
      reason: params.reason,
      booking: params.booking,
      settings: params.settings,
      appUrl: normalizedUrl,
    });

    let result = await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      ...(replyTo ? { replyTo } : {}),
      template: templatePayload,
    });

    if (result.error && isResendTemplateError(result.error.message)) {
      result = await resend.emails.send({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        ...(replyTo ? { replyTo } : {}),
        html: renderBookingEmailHtml({
          salonName: params.settings.name,
          bodyText: params.bodyText,
          manageUrl: `${normalizedUrl}/admin/citas`,
          address: params.settings.address,
          instagramHandle: params.settings.instagramHandle,
          bookingCode: params.booking.bookingCode,
          hasCalendarAttachment: false,
        }),
      });
    }

    if (result.error) {
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: result.error.message,
      };
    }

    return {
      status: 'sent',
      providerMessageId: result.data?.id ?? `resend-alert-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando aviso al estudio',
    };
  }
}

export async function dispatchRetentionWarningEmail(params: {
  to: string;
  stage: '30d' | '7d';
  assets: readonly RetentionWarningAsset[];
  settings: SalonSettings;
  appUrl: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();
  const subject =
    params.stage === '7d'
      ? `Último aviso (7 días): respalda ${params.assets.length} comprobante(s) en ${params.settings.name}`
      : `Aviso preventivo (30 días): respalda ${params.assets.length} comprobante(s) en ${params.settings.name}`;

  if (!env.resendConfigured || !process.env.RESEND_API_KEY) {
    return {
      status: 'sent',
      providerMessageId: `demo-resend-retention-${params.stage}-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = resolveFromAddress(params.settings.name);
    const replyTo = resolveReplyToAddress(params.settings);
    const templatePayload = buildRetentionWarningTemplatePayload({
      stage: params.stage,
      assets: params.assets,
      settings: params.settings,
      appUrl: params.appUrl,
    });

    let result = await resend.emails.send({
      from: fromEmail,
      to: params.to,
      subject,
      ...(replyTo ? { replyTo } : {}),
      template: templatePayload,
    });

    if (result.error && isResendTemplateError(result.error.message)) {
      result = await resend.emails.send({
        from: fromEmail,
        to: params.to,
        subject,
        ...(replyTo ? { replyTo } : {}),
        html: renderRetentionWarningEmailHtml({
          stage: params.stage,
          assets: params.assets,
          settings: params.settings,
          appUrl: params.appUrl,
        }),
      });
    }

    if (result.error) {
      logError('notification_retention_email_provider_error', {
        to: params.to,
        stage: params.stage,
        assetsCount: params.assets.length,
        error: result.error.message,
      });
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: result.error.message,
      };
    }

    return {
      status: 'sent',
      providerMessageId: result.data?.id ?? `resend-retention-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    logError('notification_retention_email_exception', {
      to: params.to,
      stage: params.stage,
      assetsCount: params.assets.length,
      error: err,
    });
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage:
        err instanceof Error ? err.message : 'Error enviando aviso de retención',
    };
  }
}

async function dispatchPlainFallbackEmail(params: {
  to: string;
  subject: string;
  bodyText: string;
  settings: SalonSettings;
  appUrl: string;
  booking?: BookingWithRelations;
  situation?: EmailTemplateSituation;
  template?: ResendTemplateDispatchPayload;
  idempotencyKey?: string;
}): Promise<NotificationDispatchResult> {
  if (params.booking) {
    return dispatchEmailNotification({
      to: params.to,
      subject: params.subject,
      bodyText: params.bodyText,
      booking: params.booking,
      settings: params.settings,
      appUrl: params.appUrl,
      situation: params.situation,
      idempotencyKey: params.idempotencyKey,
    });
  }

  const env = getRuntimeIntegrationStatus();
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  if (!env.resendConfigured || !process.env.RESEND_API_KEY) {
    return {
      status: 'sent',
      providerMessageId: `demo-resend-fallback-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = resolveFromAddress(params.settings.name);
    const replyTo = resolveReplyToAddress(params.settings);
    const requestOptions = params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : undefined;

    let result = params.template
      ? await resend.emails.send(
          {
            from: fromEmail,
            to: params.to,
            subject: params.subject,
            ...(replyTo ? { replyTo } : {}),
            template: params.template,
          },
          requestOptions,
        )
      : await resend.emails.send(
          {
            from: fromEmail,
            to: params.to,
            subject: params.subject,
            ...(replyTo ? { replyTo } : {}),
            html: renderBookingEmailHtml({
              salonName: params.settings.name,
              bodyText: params.bodyText,
              manageUrl: `${normalizedUrl}/mis-citas`,
              address: params.settings.address,
              instagramHandle: params.settings.instagramHandle,
              hasCalendarAttachment: false,
            }),
          },
          requestOptions,
        );

    if (params.template && result.error && isResendTemplateError(result.error.message)) {
      result = await resend.emails.send(
        {
          from: fromEmail,
          to: params.to,
          subject: params.subject,
          ...(replyTo ? { replyTo } : {}),
          html: renderBookingEmailHtml({
            salonName: params.settings.name,
            bodyText: params.bodyText,
            manageUrl: `${normalizedUrl}/mis-citas`,
            address: params.settings.address,
            instagramHandle: params.settings.instagramHandle,
            hasCalendarAttachment: false,
          }),
        },
        params.idempotencyKey
          ? { idempotencyKey: `${params.idempotencyKey}-html` }
          : undefined,
      );
    }

    if (result.error) {
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: result.error.message,
      };
    }
    return {
      status: 'sent',
      providerMessageId: result.data?.id ?? `resend-fallback-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando correo de respaldo',
    };
  }
}

async function resolveWhatsAppTemplateAndQuota(params: {
  triggerKey?: WhatsAppTemplateTriggerKey;
  templateName?: string;
  monthKey: string;
}): Promise<{
  hasTemplate: boolean;
  resolvedTemplateName: string | undefined;
  quotaAlertLevel: 'ok' | 'warning_80' | 'limit_100';
  sentCount: number;
  quotaLimit: number;
}> {
  let sentCount = 0;
  let quotaLimit = 500;
  let resolvedTemplateName = params.templateName?.trim() || undefined;
  let hasTemplate = Boolean(resolvedTemplateName);

  try {
    const dbRepo = await import('../repositories/db');
    const usage = await dbRepo.getWhatsAppMonthlyUsage(params.monthKey);
    sentCount = usage.sentCount;
    quotaLimit = usage.quotaLimit;

    if (params.triggerKey && !resolvedTemplateName) {
      const templates = await dbRepo.getWhatsAppTemplates();
      const matched = templates.find((t) => t.triggerKey === params.triggerKey);
      if (matched) {
        if (matched.isActive) {
          resolvedTemplateName = matched.templateName;
          hasTemplate = true;
        } else {
          hasTemplate = false;
        }
      } else {
        resolvedTemplateName = getOfficialWhatsAppTemplateSpec(
          params.triggerKey,
        ).defaultTemplateName;
        hasTemplate = true;
      }
    }
  } catch (err) {
    logWarn('notification_whatsapp_repo_lookup_failed', { error: err });
    if (params.triggerKey && !resolvedTemplateName) {
      resolvedTemplateName = getOfficialWhatsAppTemplateSpec(
        params.triggerKey,
      ).defaultTemplateName;
      hasTemplate = true;
    }
  }

  const quota = evaluateWhatsAppQuota(sentCount, quotaLimit);
  return {
    hasTemplate,
    resolvedTemplateName,
    quotaAlertLevel: quota.alertLevel,
    sentCount: quota.sentCount,
    quotaLimit: quota.quotaLimit,
  };
}

async function recordWhatsAppMonthlyUsageOnce(
  monthKey: string,
  providerMessageId: string,
): Promise<void> {
  try {
    const dbRepo = await import('../repositories/db');
    const claimed = await dbRepo.claimWebhookEventIdempotent(
      'whatsapp_usage',
      providerMessageId,
    );
    if (claimed) {
      await dbRepo.incrementWhatsAppMonthlyUsage(monthKey, 1);
    }
  } catch (err) {
    logWarn('notification_whatsapp_usage_record_failed', {
      monthKey,
      providerMessageId,
      error: err,
    });
  }
}

export async function dispatchWhatsAppNotification(
  params: WhatsAppDispatchParams,
): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();
  const waMeUrl = buildWhatsAppLink(params.toPhoneE164, params.bodyText);
  const monthKey =
    params.monthKey ??
    getWhatsAppMonthKey(new Date(), params.settingsTimezone || 'America/Mexico_City');

  const resolved = await resolveWhatsAppTemplateAndQuota({
    triggerKey: params.triggerKey,
    templateName: params.templateName,
    monthKey,
  });

  const deliveryMode = selectWhatsAppDeliveryMode({
    hasTemplate: resolved.hasTemplate,
    withinServiceWindow: Boolean(params.withinServiceWindow),
    quotaAlertLevel: resolved.quotaAlertLevel,
    whatsappCloudConfigured: env.whatsappCloudConfigured,
  });

  if (deliveryMode === 'fallback_email_wame') {
    if (!env.whatsappCloudConfigured) {
      if (params.fallbackEmail && env.resendConfigured) {
        const emailFallback = await dispatchPlainFallbackEmail({
          to: params.fallbackEmail.to,
          subject: params.fallbackEmail.subject,
          bodyText: params.bodyText,
          booking: params.fallbackEmail.booking,
          settings: params.fallbackEmail.settings,
          appUrl: params.fallbackEmail.appUrl,
          situation: params.fallbackEmail.situation,
          template: params.fallbackEmail.template,
          idempotencyKey: params.fallbackEmail.idempotencyKey,
        });
        return {
          ...emailFallback,
          deliveryMode,
          fallbackWaMeUrl: waMeUrl,
        };
      }
      return {
        status: 'sent',
        providerMessageId: `demo-wamid-${Date.now()}`,
        errorMessage: null,
        deliveryMode,
        fallbackWaMeUrl: waMeUrl,
      };
    }

    logWarn('notification_whatsapp_degraded_to_fallback', {
      phone: params.toPhoneE164,
      monthKey,
      sentCount: resolved.sentCount,
      quotaLimit: resolved.quotaLimit,
      quotaAlertLevel: resolved.quotaAlertLevel,
      hasTemplate: resolved.hasTemplate,
      withinServiceWindow: Boolean(params.withinServiceWindow),
    });

    if (params.fallbackEmail) {
      const emailFallback = await dispatchPlainFallbackEmail({
        to: params.fallbackEmail.to,
        subject: params.fallbackEmail.subject,
        bodyText: params.bodyText,
        booking: params.fallbackEmail.booking,
        settings: params.fallbackEmail.settings,
        appUrl: params.fallbackEmail.appUrl,
        situation: params.fallbackEmail.situation,
        template: params.fallbackEmail.template,
        idempotencyKey: params.fallbackEmail.idempotencyKey,
      });
      return {
        ...emailFallback,
        deliveryMode,
        fallbackWaMeUrl: waMeUrl,
      };
    }

    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage:
        resolved.quotaAlertLevel === 'limit_100'
          ? 'Cuota mensual de WhatsApp alcanzada; usa el enlace directo wa.me o correo electrónico.'
          : 'Fuera de la ventana de 24 h se requiere una plantilla oficial aprobada.',
      deliveryMode,
      fallbackWaMeUrl: waMeUrl,
    };
  }

  try {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    if (!phoneId || !token) {
      return {
        status: 'sent',
        providerMessageId: `demo-wamid-${Date.now()}`,
        errorMessage: null,
        deliveryMode: 'fallback_email_wame',
        fallbackWaMeUrl: waMeUrl,
      };
    }

    const fetcher = params.fetchImpl ?? globalThis.fetch;
    const cleanTo = params.toPhoneE164.replace(/\D/g, '');
    const cleanButtons = (params.interactiveButtons ?? [])
      .slice(0, 3)
      .map((btn) => ({
        type: 'reply' as const,
        reply: {
          id: btn.id.slice(0, 256),
          title: btn.title.slice(0, 20),
        },
      }));
    const requestPayload =
      deliveryMode === 'template'
        ? buildWhatsAppTemplatePayload({
            triggerKey: params.triggerKey ?? 'booking_confirmed',
            templateName: resolved.resolvedTemplateName,
            languageCode: 'es_MX',
            toPhoneDigits: cleanTo,
            parameters:
              params.templateParameters && params.templateParameters.length > 0
                ? params.templateParameters
                : [params.bodyText],
          })
        : cleanButtons.length > 0
          ? {
              messaging_product: 'whatsapp' as const,
              recipient_type: 'individual' as const,
              to: cleanTo,
              type: 'interactive' as const,
              interactive: {
                type: 'button' as const,
                body: { text: params.bodyText },
                action: { buttons: cleanButtons },
              },
            }
          : {
              messaging_product: 'whatsapp' as const,
              recipient_type: 'individual' as const,
              to: cleanTo,
              type: 'text' as const,
              text: { body: params.bodyText },
            };

    const res = await fetcher(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(phoneId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: createRequestSignal(),
        body: JSON.stringify(requestPayload),
      },
    );

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };
    if (!res.ok) {
      logError('notification_whatsapp_provider_error', {
        phone: params.toPhoneE164,
        status: res.status,
        deliveryMode,
        error: data.error?.message,
      });
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: data.error?.message || `WhatsApp API HTTP ${res.status}`,
        deliveryMode,
        fallbackWaMeUrl: waMeUrl,
      };
    }

    const providerMessageId = data.messages?.[0]?.id ?? `wamid-${Date.now()}`;
    if (deliveryMode === 'template') {
      await recordWhatsAppMonthlyUsageOnce(monthKey, providerMessageId);
    }

    return {
      status: 'sent',
      providerMessageId,
      errorMessage: null,
      deliveryMode,
      fallbackWaMeUrl: waMeUrl,
    };
  } catch (err) {
    logError('notification_whatsapp_dispatch_exception', {
      phone: params.toPhoneE164,
      deliveryMode,
      error: err,
    });
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando WhatsApp',
      deliveryMode,
      fallbackWaMeUrl: waMeUrl,
    };
  }
}

export async function dispatchSmsNotification(params: {
  toPhoneE164: string;
  bodyText: string;
}): Promise<NotificationDispatchResult> {
  const env = getRuntimeIntegrationStatus();

  if (!env.twilioSmsConfigured) {
    return {
      status: 'sent',
      providerMessageId: `demo-twilio-sms-${Date.now()}`,
      errorMessage: null,
    };
  }

  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM_NUMBER!;
    const auth = Buffer.from(`${sid}:${authToken}`).toString('base64');

    const form = new URLSearchParams({
      To: params.toPhoneE164,
      From: from,
      Body: params.bodyText.slice(0, 320),
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        signal: createRequestSignal(),
        body: form.toString(),
      },
    );

    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      logError('notification_sms_provider_error', {
        phone: params.toPhoneE164,
        status: res.status,
        error: data.message,
      });
      return {
        status: 'failed',
        providerMessageId: null,
        errorMessage: data.message || `Twilio HTTP ${res.status}`,
      };
    }

    return {
      status: 'sent',
      providerMessageId: data.sid ?? `SM-${Date.now()}`,
      errorMessage: null,
    };
  } catch (err) {
    logError('notification_sms_dispatch_exception', {
      phone: params.toPhoneE164,
      error: err,
    });
    return {
      status: 'failed',
      providerMessageId: null,
      errorMessage: err instanceof Error ? err.message : 'Error enviando SMS',
    };
  }
}

function mapImmediateTriggerToEmailSituation(
  trigger: 'booking_created' | 'booking_confirmed' | 'booking_canceled' | 'booking_rescheduled',
  booking: BookingWithRelations,
  settings: SalonSettings,
): EmailTemplateSituation {
  if (trigger === 'booking_canceled') return 'canceled';
  if (trigger === 'booking_rescheduled') return 'rescheduled';
  if (trigger === 'booking_confirmed') return 'confirmed';
  return resolveBookingEmailSituation({ booking, settings });
}

function mapImmediateTriggerToWhatsAppTemplate(
  trigger: 'booking_created' | 'booking_confirmed' | 'booking_canceled' | 'booking_rescheduled',
): WhatsAppTemplateTriggerKey {
  if (trigger === 'booking_canceled') return 'booking_canceled';
  if (trigger === 'booking_rescheduled') return 'booking_rescheduled';
  return 'booking_confirmed';
}

function buildBookingTemplateParameters(params: {
  triggerKey: WhatsAppTemplateTriggerKey;
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
}): string[] {
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  const manageUrl = `${normalizedUrl}/cita/${params.booking.manageToken}`;
  const tz = params.settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(params.booking.startAt, tz);
  const timeLabel = formatTimeInTimezone(params.booking.startAt, tz, false);
  const serviceName = params.booking.service.name;

  if (params.triggerKey === 'booking_canceled') {
    return [params.booking.client.fullName, serviceName, dateLabel];
  }
  if (params.triggerKey === 'booking_rescheduled') {
    return [params.booking.client.fullName, serviceName, dateLabel, timeLabel, manageUrl];
  }
  if (params.triggerKey === 'reminder_2h') {
    return [params.booking.client.fullName, timeLabel, params.settings.address];
  }
  if (params.triggerKey === 'reminder_24h') {
    return [
      params.booking.client.fullName,
      serviceName,
      timeLabel,
      params.booking.staff.name,
      manageUrl,
    ];
  }
  return [
    params.booking.client.fullName,
    serviceName,
    dateLabel,
    timeLabel,
    params.booking.staff.name,
    manageUrl,
  ];
}

export async function buildAndSendImmediateNotifications(params: {
  booking: BookingWithRelations;
  workflows: NotificationWorkflow[];
  settings: SalonSettings;
  trigger: 'booking_created' | 'booking_confirmed' | 'booking_canceled' | 'booking_rescheduled';
}): Promise<ScheduledNotification[]> {
  const env = getRuntimeIntegrationStatus();
  const created: ScheduledNotification[] = [];
  const nowIso = new Date().toISOString();

  const matching = params.workflows.filter(
    (w) => w.isEnabled && w.triggerEvent === params.trigger,
  );

  for (const wf of matching) {
    const subject = renderNotificationTemplate(
      wf.subjectTemplate || `Actualización de cita (${params.booking.bookingCode})`,
      params.booking,
      params.settings,
      env.appUrl,
    );
    const bodyText = renderNotificationTemplate(
      wf.messageTemplate,
      params.booking,
      params.settings,
      env.appUrl,
    );

    for (const channel of wf.channels) {
      if (channel === 'sms' && !params.settings.smsRemindersEnabled) continue;
      if (channel === 'email' && !params.booking.client.email) continue;

      const recipient =
        channel === 'email'
          ? params.booking.client.email!
          : params.booking.client.phoneE164;

      const emailSituation = mapImmediateTriggerToEmailSituation(
        params.trigger,
        params.booking,
        params.settings,
      );
      let res: NotificationDispatchResult;
      if (channel === 'email') {
        res = await dispatchEmailNotification({
          to: recipient,
          subject,
          bodyText,
          booking: params.booking,
          settings: params.settings,
          appUrl: env.appUrl,
          situation: emailSituation,
          idempotencyKey: `${params.trigger}-${params.booking.id}-${wf.id}-email`,
        });
      } else if (channel === 'whatsapp') {
        const triggerKey = mapImmediateTriggerToWhatsAppTemplate(params.trigger);
        res = await dispatchWhatsAppNotification({
          toPhoneE164: recipient,
          bodyText,
          triggerKey,
          templateParameters: buildBookingTemplateParameters({
            triggerKey,
            booking: params.booking,
            settings: params.settings,
            appUrl: env.appUrl,
          }),
          withinServiceWindow: false,
          settingsTimezone: params.settings.timezone,
          fallbackEmail: params.booking.client.email
            ? {
                to: params.booking.client.email,
                subject,
                booking: params.booking,
                settings: params.settings,
                appUrl: env.appUrl,
                situation: emailSituation,
                idempotencyKey: `${params.trigger}-${params.booking.id}-${wf.id}-wa-fallback`,
              }
            : undefined,
        });
      } else {
        res = await dispatchSmsNotification({
          toPhoneE164: recipient,
          bodyText,
        });
      }

      created.push({
        id: generateId('ntf'),
        bookingId: params.booking.id,
        workflowId: wf.id,
        channel,
        recipient,
        scheduledFor: nowIso,
        status: res.status,
        subject,
        previewText: bodyText.slice(0, 160),
        providerMessageId: res.providerMessageId,
        errorMessage: res.errorMessage,
        sentAt: res.status === 'sent' ? nowIso : null,
        createdAt: nowIso,
      });
    }
  }

  if (params.trigger === 'booking_created' || params.trigger === 'booking_rescheduled') {
    const startMs = new Date(params.booking.startAt).getTime();
    const endMs = new Date(params.booking.endAt).getTime();
    const nowMs = Date.now();

    const scheduledWorkflows = params.workflows.filter(
      (w) =>
        w.isEnabled &&
        (w.triggerEvent === 'before_booking' || w.triggerEvent === 'after_booking'),
    );

    for (const wf of scheduledWorkflows) {
      const targetMs =
        wf.triggerEvent === 'before_booking'
          ? startMs - wf.offsetMinutes * 60_000
          : endMs + wf.offsetMinutes * 60_000;
      if (targetMs <= nowMs) continue;

      const subject = renderNotificationTemplate(
        wf.subjectTemplate,
        params.booking,
        params.settings,
        env.appUrl,
      );
      const bodyText = renderNotificationTemplate(
        wf.messageTemplate,
        params.booking,
        params.settings,
        env.appUrl,
      );

      for (const channel of wf.channels) {
        if (channel === 'sms' && !params.settings.smsRemindersEnabled) continue;
        if (channel === 'email' && !params.booking.client.email) continue;

        created.push({
          id: generateId('ntf'),
          bookingId: params.booking.id,
          workflowId: wf.id,
          channel: channel as NotificationChannel,
          recipient:
            channel === 'email'
              ? params.booking.client.email!
              : params.booking.client.phoneE164,
          scheduledFor: new Date(targetMs).toISOString(),
          status: 'pending',
          subject,
          previewText: bodyText.slice(0, 160),
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          createdAt: nowIso,
        });
      }
    }
  }

  return created;
}

export async function dispatchDepositRejectedNotification(params: {
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
  reason?: string | null;
}): Promise<NotificationDispatchResult> {
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  const manageUrl = `${normalizedUrl}/cita/${params.booking.manageToken}`;
  const reasonNote = params.reason?.trim()
    ? ` Motivo: ${params.reason.trim()}.`
    : '';
  const bodyText = `Hola ${params.booking.client.fullName}, no pudimos validar el comprobante de tu anticipo para tu cita ${params.booking.bookingCode} (${params.booking.service.name}) en ${params.settings.name}.${reasonNote} Sube tu comprobante o pega el enlace aquí para confirmar tu lugar: ${manageUrl}`;
  const subject = `Revisa tu comprobante de anticipo (${params.booking.bookingCode}) · ${params.settings.name}`;

  return dispatchWhatsAppNotification({
    toPhoneE164: params.booking.client.phoneE164,
    bodyText,
    withinServiceWindow: false,
    settingsTimezone: params.settings.timezone,
    fallbackEmail: params.booking.client.email
      ? {
          to: params.booking.client.email,
          subject,
          booking: params.booking,
          settings: params.settings,
          appUrl: normalizedUrl,
          situation: 'pending_spei',
          idempotencyKey: `deposit-rejected-${params.booking.id}-${Date.now()}`,
        }
      : undefined,
  });
}

export async function dispatchTouchUpInviteNotification(params: {
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
  touchUpUrl: string;
}): Promise<{ whatsapp: NotificationDispatchResult; email: NotificationDispatchResult | null }> {
  const normalizedUrl = params.appUrl.replace(/\/+$/, '');
  const fullTouchUpUrl = params.touchUpUrl.startsWith('http')
    ? params.touchUpUrl
    : `${normalizedUrl}${params.touchUpUrl.startsWith('/') ? '' : '/'}${params.touchUpUrl}`;
  const bodyText = `Hola ${params.booking.client.fullName}, ya casi cumplen 3 semanas tus uñas de ${params.booking.service.name} con ${params.booking.staff.name}. Aparta tu retoque con fecha sugerida en un toque aquí: ${fullTouchUpUrl}`;
  const subject = `¿Lista para tu retoque en ${params.settings.name}?`;

  const whatsapp = await dispatchWhatsAppNotification({
    toPhoneE164: params.booking.client.phoneE164,
    bodyText,
    withinServiceWindow: false,
    settingsTimezone: params.settings.timezone,
    fallbackEmail: params.booking.client.email
      ? {
          to: params.booking.client.email,
          subject,
          booking: params.booking,
          settings: params.settings,
          appUrl: normalizedUrl,
          situation: 'touchup',
          idempotencyKey: `touchup-wa-fb-${params.booking.id}`,
        }
      : undefined,
  });

  let email: NotificationDispatchResult | null = null;
  if (params.booking.client.email) {
    email = await dispatchEmailNotification({
      to: params.booking.client.email,
      subject,
      bodyText,
      booking: params.booking,
      settings: params.settings,
      appUrl: normalizedUrl,
      situation: 'touchup',
      touchUpUrl: fullTouchUpUrl,
      idempotencyKey: `touchup-email-${params.booking.id}`,
    });
  }

  return { whatsapp, email };
}
