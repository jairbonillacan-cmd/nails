import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '../format';
import type { BookingWithRelations, SalonSettings } from '../types';

export const RESEND_TEMPLATE_ALIASES = {
  bookingPendingSpei: 'laikona-booking-pending-spei',
  bookingConfirmed: 'laikona-booking-confirmed',
  bookingReminder24h: 'laikona-booking-reminder-24h',
  bookingReminder2h: 'laikona-booking-reminder-2h',
  bookingRescheduled: 'laikona-booking-rescheduled',
  bookingCanceled: 'laikona-booking-canceled',
  touchupReminder: 'laikona-touchup-reminder',
  waitlistOffer: 'laikona-waitlist-offer',
  clientOtp: 'laikona-client-otp',
  salonAlert: 'laikona-salon-alert',
  retentionWarning: 'laikona-retention-warning',
} as const;

type ResendTemplateAlias =
  (typeof RESEND_TEMPLATE_ALIASES)[keyof typeof RESEND_TEMPLATE_ALIASES];

export type EmailTemplateSituation =
  | 'pending_spei'
  | 'confirmed'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'rescheduled'
  | 'canceled'
  | 'touchup';

export interface ResendTemplateDispatchPayload {
  id: ResendTemplateAlias;
  variables: Record<string, string | number>;
}

export interface RetentionTemplateAsset {
  storagePath: string;
  folder: 'proofs' | 'inspo' | 'gallery';
  createdAt: string;
  sizeBytes: number;
}

const MAX_VAR_LENGTH = 1900;

function clampVar(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  const resolved = trimmed.length > 0 ? trimmed : fallback;
  return resolved.slice(0, MAX_VAR_LENGTH);
}

function normalizeBaseUrl(appUrl: string): string {
  return appUrl.replace(/\/+$/, '') || 'https://laikona.devand.net';
}

function buildFooterVars(
  settings: SalonSettings,
  appUrl: string,
): Record<string, string> {
  return {
    SALON_NAME: clampVar(settings.name, 'LAIKONA NAILS'),
    ADDRESS: clampVar(settings.address, 'Puebla, México'),
    INSTAGRAM_HANDLE: clampVar(settings.instagramHandle, '@laikona.nailsss'),
    SITE_URL: clampVar(normalizeBaseUrl(appUrl), 'https://laikona.devand.net'),
  };
}

function formatServiceLabel(booking: BookingWithRelations): string {
  const addonsText =
    booking.addons.length > 0
      ? ` + ${booking.addons.map((a) => a.name).join(', ')}`
      : '';
  return `${booking.service.name}${addonsText}`;
}

export function resolveBookingEmailSituation(params: {
  booking: BookingWithRelations;
  settings: SalonSettings;
  situation?: EmailTemplateSituation;
}): EmailTemplateSituation {
  if (params.situation) return params.situation;
  if (params.booking.status === 'canceled') return 'canceled';
  const needsSpei =
    (params.booking.status === 'pending_confirmation' ||
      params.booking.status === 'pending_payment') &&
    params.settings.paymentMode === 'manual_transfer' &&
    Boolean(params.settings.depositClabe.trim());
  if (needsSpei) return 'pending_spei';
  return 'confirmed';
}

export function shouldAttachBookingCalendarIcs(
  situation: EmailTemplateSituation,
): boolean {
  return (
    situation === 'pending_spei' ||
    situation === 'confirmed' ||
    situation === 'reminder_24h' ||
    situation === 'rescheduled'
  );
}

export function buildBookingTemplatePayload(params: {
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
  whatsappUrl: string;
  situation?: EmailTemplateSituation;
}): ResendTemplateDispatchPayload {
  const situation = resolveBookingEmailSituation(params);
  const baseUrl = normalizeBaseUrl(params.appUrl);
  const manageUrl = `${baseUrl}/cita/${params.booking.manageToken}`;
  const bookingUrl = `${baseUrl}/reservar`;
  const tz = params.settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(params.booking.startAt, tz);
  const timeLabel = formatTimeInTimezone(params.booking.startAt, tz, false);
  const serviceLabel = formatServiceLabel(params.booking);
  const totalLabel = formatCurrency(
    params.booking.totalPriceCents,
    params.settings.currency,
  );
  const footer = buildFooterVars(params.settings, baseUrl);
  const safeWhatsappUrl = clampVar(params.whatsappUrl, `${baseUrl}/links`);

  if (situation === 'pending_spei') {
    const depositCents =
      params.booking.depositAmountCents > 0
        ? params.booking.depositAmountCents
        : (params.settings.depositAmountCents ?? 20000);
    return {
      id: RESEND_TEMPLATE_ALIASES.bookingPendingSpei,
      variables: {
        CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
        BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
        SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
        STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
        DATE_LABEL: clampVar(dateLabel, 'Próxima fecha'),
        TIME_LABEL: clampVar(timeLabel, 'Horario confirmado'),
        TOTAL_LABEL: clampVar(totalLabel, '$350 MXN'),
        DEPOSIT_LABEL: clampVar(
          formatCurrency(depositCents, params.settings.currency),
          '$200 MXN',
        ),
        BANK_NAME: clampVar(params.settings.depositBankName, 'Mercado Pago'),
        BENEFICIARY: clampVar(
          params.settings.depositBeneficiary || params.settings.depositAccountHolder,
          params.settings.name,
        ),
        CLABE: clampVar(params.settings.depositClabe, 'Consultar en el enlace de tu cita'),
        MANAGE_URL: clampVar(manageUrl, `${baseUrl}/mis-citas`),
        WHATSAPP_URL: safeWhatsappUrl,
        ...footer,
      },
    };
  }

  if (situation === 'reminder_24h') {
    return {
      id: RESEND_TEMPLATE_ALIASES.bookingReminder24h,
      variables: {
        CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
        BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
        SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
        STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
        DATE_LABEL: clampVar(dateLabel, 'Mañana'),
        TIME_LABEL: clampVar(timeLabel, 'Horario confirmado'),
        MANAGE_URL: clampVar(manageUrl, `${baseUrl}/mis-citas`),
        WHATSAPP_URL: safeWhatsappUrl,
        ...footer,
      },
    };
  }

  if (situation === 'reminder_2h') {
    return {
      id: RESEND_TEMPLATE_ALIASES.bookingReminder2h,
      variables: {
        CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
        BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
        SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
        STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
        TIME_LABEL: clampVar(timeLabel, 'Hoy'),
        MANAGE_URL: clampVar(manageUrl, `${baseUrl}/mis-citas`),
        WHATSAPP_URL: safeWhatsappUrl,
        ...footer,
      },
    };
  }

  if (situation === 'rescheduled') {
    return {
      id: RESEND_TEMPLATE_ALIASES.bookingRescheduled,
      variables: {
        CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
        BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
        SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
        STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
        DATE_LABEL: clampVar(dateLabel, 'Nueva fecha'),
        TIME_LABEL: clampVar(timeLabel, 'Nuevo horario'),
        MANAGE_URL: clampVar(manageUrl, `${baseUrl}/mis-citas`),
        WHATSAPP_URL: safeWhatsappUrl,
        ...footer,
      },
    };
  }

  if (situation === 'canceled') {
    return {
      id: RESEND_TEMPLATE_ALIASES.bookingCanceled,
      variables: {
        CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
        BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
        SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
        STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
        DATE_LABEL: clampVar(dateLabel, 'Fecha original'),
        TIME_LABEL: clampVar(timeLabel, 'Horario original'),
        CANCELLATION_NOTE: clampVar(
          params.booking.cancellationReason,
          'Cancelación registrada desde la plataforma.',
        ),
        BOOKING_URL: clampVar(bookingUrl, `${baseUrl}/reservar`),
        WHATSAPP_URL: safeWhatsappUrl,
        ...footer,
      },
    };
  }

  if (situation === 'touchup') {
    return {
      id: RESEND_TEMPLATE_ALIASES.touchupReminder,
      variables: {
        CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
        SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
        STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
        BOOKING_URL: clampVar(bookingUrl, `${baseUrl}/reservar`),
        WHATSAPP_URL: safeWhatsappUrl,
        ...footer,
      },
    };
  }

  return {
    id: RESEND_TEMPLATE_ALIASES.bookingConfirmed,
    variables: {
      CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
      BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
      SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
      STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
      DATE_LABEL: clampVar(dateLabel, 'Fecha confirmada'),
      TIME_LABEL: clampVar(timeLabel, 'Horario confirmado'),
      TOTAL_LABEL: clampVar(totalLabel, '$350 MXN'),
      MANAGE_URL: clampVar(manageUrl, `${baseUrl}/mis-citas`),
      WHATSAPP_URL: safeWhatsappUrl,
      ...footer,
    },
  };
}

export function buildClientOtpTemplatePayload(params: {
  clientName: string;
  otpCode: string;
  expiresMinutes?: number;
  settings: SalonSettings;
  appUrl: string;
}): ResendTemplateDispatchPayload {
  const baseUrl = normalizeBaseUrl(params.appUrl);
  return {
    id: RESEND_TEMPLATE_ALIASES.clientOtp,
    variables: {
      CLIENT_NAME: clampVar(params.clientName, 'Clienta'),
      OTP_CODE: clampVar(params.otpCode, '000000'),
      EXPIRES_MINUTES: String(params.expiresMinutes ?? 5),
      PORTAL_URL: `${baseUrl}/mis-citas`,
      ...buildFooterVars(params.settings, baseUrl),
    },
  };
}

export function buildWaitlistOfferTemplatePayload(params: {
  clientName: string;
  serviceName: string;
  staffName: string;
  dateLabel: string;
  timeLabel: string;
  ttlMinutes: number;
  offerUrl: string;
  settings: SalonSettings;
  appUrl: string;
}): ResendTemplateDispatchPayload {
  const baseUrl = normalizeBaseUrl(params.appUrl);
  return {
    id: RESEND_TEMPLATE_ALIASES.waitlistOffer,
    variables: {
      CLIENT_NAME: clampVar(params.clientName, 'Clienta'),
      SERVICE_NAME: clampVar(params.serviceName, 'Servicio'),
      STAFF_NAME: clampVar(params.staffName, 'Profesional'),
      DATE_LABEL: clampVar(params.dateLabel, 'Próxima fecha'),
      TIME_LABEL: clampVar(params.timeLabel, 'Horario disponible'),
      TTL_MINUTES: String(Math.max(1, Math.round(params.ttlMinutes))),
      OFFER_URL: clampVar(params.offerUrl, `${baseUrl}/reservar`),
      ...buildFooterVars(params.settings, baseUrl),
    },
  };
}

export function buildSalonAlertTemplatePayload(params: {
  kind: 'canceled' | 'rescheduled';
  reason?: string;
  booking: BookingWithRelations;
  settings: SalonSettings;
  appUrl: string;
}): ResendTemplateDispatchPayload {
  const baseUrl = normalizeBaseUrl(params.appUrl);
  const tz = params.settings.timezone || 'America/Mexico_City';
  const dateLabel = formatDateLongInTimezone(params.booking.startAt, tz);
  const timeLabel = formatTimeInTimezone(params.booking.startAt, tz, false);
  const serviceLabel = formatServiceLabel(params.booking);
  const isCanceled = params.kind === 'canceled';

  return {
    id: RESEND_TEMPLATE_ALIASES.salonAlert,
    variables: {
      ALERT_BADGE: isCanceled ? 'Cita cancelada' : 'Cita reagendada',
      ALERT_HEADING: isCanceled
        ? 'Cancelación registrada por clienta'
        : 'Reagenda registrada por clienta',
      ALERT_DETAIL: isCanceled
        ? clampVar(
            `La clienta ${params.booking.client.fullName} canceló su cita ${params.booking.bookingCode}. Motivo: ${params.reason || 'Sin motivo especificado'}.`,
            'Cita cancelada desde el enlace personal.',
          )
        : clampVar(
            `La clienta ${params.booking.client.fullName} movió su cita ${params.booking.bookingCode} al ${dateLabel} a las ${timeLabel}.`,
            'Cita reagendada desde el enlace personal.',
          ),
      BOOKING_CODE: clampVar(params.booking.bookingCode, 'NL-CITA'),
      CLIENT_NAME: clampVar(params.booking.client.fullName, 'Clienta'),
      CLIENT_PHONE: clampVar(params.booking.client.phoneE164, 'Sin teléfono'),
      SERVICE_NAME: clampVar(serviceLabel, 'Servicio'),
      STAFF_NAME: clampVar(params.booking.staff.name, 'Profesional'),
      DATE_LABEL: clampVar(dateLabel, 'Fecha'),
      TIME_LABEL: clampVar(timeLabel, 'Hora'),
      ADMIN_URL: `${baseUrl}/admin/citas`,
      ...buildFooterVars(params.settings, baseUrl),
    },
  };
}

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function folderLabel(folder: RetentionTemplateAsset['folder']): string {
  if (folder === 'proofs') return 'Comprobante SPEI';
  if (folder === 'inspo') return 'Foto de referencia';
  return 'Galería';
}

export function buildRetentionWarningTemplatePayload(params: {
  stage: '30d' | '7d';
  assets: readonly RetentionTemplateAsset[];
  settings: SalonSettings;
  appUrl: string;
}): ResendTemplateDispatchPayload {
  const baseUrl = normalizeBaseUrl(params.appUrl);
  const tz = params.settings.timezone || 'America/Mexico_City';
  const stageLabel = params.stage === '7d' ? '7 días' : '30 días';
  const headingText =
    params.stage === '7d'
      ? 'Último aviso: respalda tus comprobantes en los próximos 7 días'
      : 'Aviso preventivo: respalda tus comprobantes antes de la limpieza anual';
  const introText =
    params.stage === '7d'
      ? `En 7 días se cumplirán 12 meses desde la carga de ${params.assets.length} archivo(s) de comprobantes o referencias y se eliminarán automáticamente del almacenamiento.`
      : `Dentro de 30 días se cumplirán 12 meses desde la carga de ${params.assets.length} archivo(s) de comprobantes o referencias y se eliminarán automáticamente del almacenamiento.`;

  const proofsCount = params.assets.filter((a) => a.folder === 'proofs').length;
  const inspoCount = params.assets.filter((a) => a.folder === 'inspo').length;
  const totalBytes = params.assets.reduce((sum, a) => sum + Math.max(0, a.sizeBytes), 0);

  const previewLines = params.assets.slice(0, 12).map((a) => {
    const dt = formatDateShortInTimezone(a.createdAt, tz);
    return `${folderLabel(a.folder)} · ${a.storagePath} (${dt}, ${formatByteSize(a.sizeBytes)})`;
  });
  if (params.assets.length > 12) {
    previewLines.push(`... y ${params.assets.length - 12} archivo(s) adicional(es).`);
  }

  return {
    id: RESEND_TEMPLATE_ALIASES.retentionWarning,
    variables: {
      STAGE_LABEL: stageLabel,
      HEADING_TEXT: headingText,
      INTRO_TEXT: introText,
      ASSETS_COUNT: String(params.assets.length),
      PROOFS_COUNT: String(proofsCount),
      INSPO_COUNT: String(inspoCount),
      TOTAL_SIZE: formatByteSize(totalBytes),
      ASSETS_PREVIEW: clampVar(
        previewLines.join('\n'),
        'Consulta el detalle completo en Caja.',
      ),
      CAJA_URL: `${baseUrl}/admin/caja?tab=anticipos`,
      ...buildFooterVars(params.settings, baseUrl),
    },
  };
}
