import type {
  WhatsAppServiceWindowDTO,
  WhatsAppTemplateCatalogItemDTO,
  WhatsAppThreadBookingContextDTO,
} from '../contracts/whatsapp';
import {
  collapseDoublePeriods,
  formatDateLongInTimezone,
  formatTimeInTimezone,
} from '../format';
import type {
  Booking,
  NotificationWorkflow,
  ScheduledNotification,
  WhatsAppDeliveryStatus,
  WhatsAppTemplateTriggerKey,
} from '../types';

export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const RETRY_BACKOFF_MINUTES = [5, 15, 45] as const;

const DELIVERY_STATUS_RANK: Readonly<Record<WhatsAppDeliveryStatus, number>> = {
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 0,
  received: 5,
};

export const WHATSAPP_TEMPLATE_CATALOG: readonly WhatsAppTemplateCatalogItemDTO[] = [
  {
    triggerKey: 'booking_confirmed',
    defaultTemplateName: 'laikona_cita_confirmada',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Confirmación de cita',
    description:
      'Confirma horario, servicio, profesional y enlace para ver detalles o agregar al calendario.',
    bodyText:
      'Hola {{1}}, tu cita de {{2}} en LAIKONA NAILS quedó confirmada para el {{3}} a las {{4}} con {{5}}. Consulta detalles, ubicación o cambios aquí: {{6}}',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha', 'Hora', 'Profesional', 'Enlace'],
    exampleParameters: [
      'Sofía',
      'Rubber',
      'viernes 27 de noviembre',
      '10:00 a.m.',
      'Karla',
      'https://laikona.devand.net/cita/demo',
    ],
  },
  {
    triggerKey: 'reminder_24h',
    defaultTemplateName: 'laikona_recordatorio_24h',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Recordatorio 24 horas antes',
    description: 'Recuerda la cita un día antes con botones para confirmar o reagendar.',
    bodyText:
      'Hola {{1}}, te recordamos tu cita mañana en LAIKONA NAILS: {{2}} a las {{3}} con {{4}}. Si necesitas mover tu horario hazlo aquí: {{5}}',
    parameterLabels: ['Clienta', 'Servicio', 'Hora', 'Profesional', 'Enlace'],
    exampleParameters: [
      'Sofía',
      'Rubber',
      '10:00 a.m.',
      'Karla',
      'https://laikona.devand.net/cita/demo',
    ],
    quickReplyButtons: ['Confirmo', 'Necesito reagendar'],
  },
  {
    triggerKey: 'reminder_2h',
    defaultTemplateName: 'laikona_recordatorio_2h',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Recordatorio 2 horas antes',
    description: 'Avisa 2 horas antes con la dirección del estudio y tiempo de tolerancia.',
    bodyText:
      'Hola {{1}}, ¡nos vemos muy pronto! Tu cita es hoy a las {{2}} en {{3}}. Te esperamos con 15 minutos máximos de tolerancia.',
    parameterLabels: ['Clienta', 'Hora', 'Dirección'],
    exampleParameters: [
      'Sofía',
      '10:00 a.m.',
      'Calle 25 Sur 1904, Col. Volcanes, Puebla, Pue.',
    ],
  },
  {
    triggerKey: 'booking_rescheduled',
    defaultTemplateName: 'laikona_cita_reagendada',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Cita reagendada',
    description:
      'Confirma el nuevo día y hora cuando la clienta o el estudio cambian la cita.',
    bodyText:
      'Hola {{1}}, actualizamos tu cita de {{2}} en LAIKONA NAILS para el {{3}} a las {{4}}. Aquí tienes tu enlace actualizado: {{5}}',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha', 'Hora', 'Enlace'],
    exampleParameters: [
      'Sofía',
      'Rubber',
      'sábado 28 de noviembre',
      '1:30 p.m.',
      'https://laikona.devand.net/cita/demo',
    ],
  },
  {
    triggerKey: 'booking_canceled',
    defaultTemplateName: 'laikona_cita_cancelada',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Cita cancelada',
    description: 'Notifica la cancelación y confirma que el espacio quedó liberado.',
    bodyText:
      'Hola {{1}}, confirmamos la cancelación de tu cita de {{2}} del {{3}} en LAIKONA NAILS. Tu espacio quedó liberado y cuando gustes puedes volver a agendar.',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha'],
    exampleParameters: ['Sofía', 'Rubber', 'viernes 27 de noviembre'],
  },
  {
    triggerKey: 'waitlist_offer',
    defaultTemplateName: 'laikona_lista_espera',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Espacio libre en lista de espera',
    description:
      'Ofrece prioridad temporal a la siguiente clienta en espera al liberarse un turno.',
    bodyText:
      'Hola {{1}}, se liberó un espacio en LAIKONA NAILS para {{2}} el {{3}} a las {{4}}. Apártalo con prioridad antes de que se ocupe aquí: {{5}}',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha', 'Hora', 'Enlace'],
    exampleParameters: [
      'Sofía',
      'Rubber',
      'viernes 27 de noviembre',
      '1:30 p.m.',
      'https://laikona.devand.net/reservar/rubber',
    ],
  },
  {
    triggerKey: 'deposit_rejected',
    defaultTemplateName: 'laikona_comprobante_rechazado',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Comprobante de anticipo por corregir',
    description:
      'Avisa a la clienta si el comprobante de transferencia no pudo validarse para que suba otro.',
    bodyText:
      'Hola {{1}}, no pudimos validar el comprobante de anticipo de tu cita {{2}} ({{3}}) en LAIKONA NAILS. Tu horario sigue apartado mientras subes uno nuevo aquí: {{4}}',
    parameterLabels: ['Clienta', 'Código', 'Servicio', 'Enlace'],
    exampleParameters: [
      'Sofía',
      'NL-1042',
      'Rubber',
      'https://laikona.devand.net/cita/demo',
    ],
  },
  {
    triggerKey: 'client_otp',
    defaultTemplateName: 'laikona_codigo_acceso',
    category: 'AUTHENTICATION',
    languageCode: 'es_MX',
    friendlyTitle: 'Código de acceso al portal de clientas',
    description: 'Envía el código de 6 dígitos para entrar a Mis citas con botón de copiar.',
    bodyText: '{{1}} es tu código de verificación. Por tu seguridad, no lo compartas.',
    parameterLabels: ['Código'],
    exampleParameters: ['482910'],
  },
  {
    triggerKey: 'touchup_invite',
    defaultTemplateName: 'laikona_invitacion_retoque',
    category: 'MARKETING',
    languageCode: 'es_MX',
    friendlyTitle: 'Invitación de retoque (3 semanas)',
    description: 'Invita a agendar el retoque cuando se cumplen 3 semanas desde la última visita.',
    bodyText:
      'Hola {{1}}, ya casi cumplen 3 semanas tus uñas de {{2}} con {{3}} en LAIKONA NAILS. Aparta tu retoque en un toque aquí: {{4}}',
    parameterLabels: ['Clienta', 'Servicio', 'Profesional', 'Enlace'],
    exampleParameters: [
      'Sofía',
      'Rubber',
      'Karla',
      'https://laikona.devand.net/reservar/rubber',
    ],
  },
] as const;

const CATALOG_BY_TRIGGER = new Map<
  WhatsAppTemplateTriggerKey,
  WhatsAppTemplateCatalogItemDTO
>(WHATSAPP_TEMPLATE_CATALOG.map((item) => [item.triggerKey, item]));

export function getWhatsAppTemplateCatalogItem(
  triggerKey: WhatsAppTemplateTriggerKey,
): WhatsAppTemplateCatalogItemDTO {
  return CATALOG_BY_TRIGGER.get(triggerKey) ?? WHATSAPP_TEMPLATE_CATALOG[0]!;
}

export function canonicalizeWhatsAppPhoneE164(
  raw: string,
  defaultCountryCode = '+52',
): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return '';
  if (digits.startsWith('521') && digits.length === 13) {
    return `+52${digits.slice(3)}`;
  }
  if (digits.length === 10) {
    const cleanCc = defaultCountryCode.replace(/[^\d+]/g, '');
    const prefix = cleanCc.startsWith('+') ? cleanCc : `+${cleanCc}`;
    return `${prefix}${digits}`;
  }
  return `+${digits}`;
}

export function computeWhatsAppServiceWindow(
  lastInboundAt: string | null | undefined,
  nowMs = Date.now(),
): WhatsAppServiceWindowDTO {
  if (!lastInboundAt) {
    return {
      isOpen: false,
      lastInboundAt: null,
      expiresAt: null,
      remainingMinutes: 0,
    };
  }
  const parsedMs = Date.parse(lastInboundAt);
  if (!Number.isFinite(parsedMs)) {
    return {
      isOpen: false,
      lastInboundAt: null,
      expiresAt: null,
      remainingMinutes: 0,
    };
  }
  const expiresMs = parsedMs + WHATSAPP_SERVICE_WINDOW_MS;
  const remainingMs = expiresMs - nowMs;
  if (remainingMs <= 0) {
    return {
      isOpen: false,
      lastInboundAt,
      expiresAt: new Date(expiresMs).toISOString(),
      remainingMinutes: 0,
    };
  }
  return {
    isOpen: true,
    lastInboundAt,
    expiresAt: new Date(expiresMs).toISOString(),
    remainingMinutes: Math.max(1, Math.ceil(remainingMs / 60_000)),
  };
}

export function resolveNextDeliveryStatus(
  current: WhatsAppDeliveryStatus,
  incoming: WhatsAppDeliveryStatus,
): WhatsAppDeliveryStatus {
  if (current === 'received' || incoming === 'received') {
    return 'received';
  }
  if (incoming === 'failed') {
    if (current === 'delivered' || current === 'read') {
      return current;
    }
    return 'failed';
  }
  if (current === 'failed') {
    if (incoming === 'delivered' || incoming === 'read') {
      return incoming;
    }
    return 'failed';
  }
  return DELIVERY_STATUS_RANK[incoming] >= DELIVERY_STATUS_RANK[current]
    ? incoming
    : current;
}

const CONFIRM_INTENTS = new Set([
  'si',
  'confirmo',
  'confirmar',
  'si confirmo',
  'confirmado',
  'confirmada',
  'asisto',
  'ahi estare',
  'si ahi estare',
  'claro',
  'claro que si',
  'listo confirmo',
  'ok confirmo',
  'confirmo asistencia',
]);

const RESCHEDULE_INTENTS = new Set([
  'reagendar',
  'necesito reagendar',
  'quiero reagendar',
  'cambiar cita',
  'cambiar horario',
  'mover cita',
]);

const CANCEL_INTENTS = new Set([
  'cancelar',
  'cancelar cita',
  'quiero cancelar',
  'necesito cancelar',
  'no podre ir',
  'no puedo ir',
  'no voy a poder ir',
]);

export function parseInboundWhatsAppIntent(
  rawText: string,
): 'confirm' | 'reschedule' | 'cancel' | null {
  const normalized = rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.length > 40) {
    return null;
  }
  if (CONFIRM_INTENTS.has(normalized)) return 'confirm';
  if (RESCHEDULE_INTENTS.has(normalized)) return 'reschedule';
  if (CANCEL_INTENTS.has(normalized)) return 'cancel';
  return null;
}

export function computeNotificationRetryAt(
  attempts: number,
  nowMs = Date.now(),
): string {
  const safeIndex = Math.max(
    0,
    Math.min(RETRY_BACKOFF_MINUTES.length - 1, Math.floor(attempts) - 1),
  );
  const minutes = RETRY_BACKOFF_MINUTES[safeIndex] ?? 45;
  return new Date(nowMs + minutes * 60_000).toISOString();
}

export function inferReminderTriggerKey(
  workflow: Pick<NotificationWorkflow, 'triggerEvent' | 'offsetMinutes' | 'name'> | null | undefined,
  notification: Pick<ScheduledNotification, 'triggerKey' | 'subject' | 'scheduledFor'>,
  booking?: Pick<Booking, 'startAt' | 'endAt'> | null,
): WhatsAppTemplateTriggerKey | null {
  if (notification.triggerKey) {
    return notification.triggerKey;
  }
  if (workflow) {
    if (workflow.triggerEvent === 'booking_created' || workflow.triggerEvent === 'booking_confirmed') {
      return 'booking_confirmed';
    }
    if (workflow.triggerEvent === 'booking_rescheduled') {
      return 'booking_rescheduled';
    }
    if (workflow.triggerEvent === 'booking_canceled') {
      return 'booking_canceled';
    }
    if (workflow.triggerEvent === 'before_booking') {
      return workflow.offsetMinutes <= 240 ? 'reminder_2h' : 'reminder_24h';
    }
    if (workflow.triggerEvent === 'after_booking') {
      return workflow.offsetMinutes >= 1440 ? 'touchup_invite' : null;
    }
  }

  const subjectLower = notification.subject.toLowerCase();
  if (/retoque/i.test(subjectLower)) return 'touchup_invite';
  if (/comprobante/i.test(subjectLower)) return 'deposit_rejected';
  if (/lista de espera/i.test(subjectLower)) return 'waitlist_offer';
  if (/reagend|reprogram/i.test(subjectLower)) return 'booking_rescheduled';
  if (/cancel/i.test(subjectLower)) return 'booking_canceled';
  if (/encuesta|reseña|opinión/i.test(subjectLower)) return null;

  if (booking) {
    const scheduledMs = Date.parse(notification.scheduledFor);
    const startMs = Date.parse(booking.startAt);
    const endMs = Date.parse(booking.endAt);
    if (Number.isFinite(scheduledMs) && Number.isFinite(endMs) && scheduledMs > endMs) {
      return scheduledMs - endMs >= 24 * 60 * 60 * 1000 ? 'touchup_invite' : null;
    }
    if (Number.isFinite(scheduledMs) && Number.isFinite(startMs)) {
      return startMs - scheduledMs <= 4 * 60 * 60 * 1000 ? 'reminder_2h' : 'reminder_24h';
    }
  }
  return 'reminder_24h';
}

export function renderWhatsAppTemplatePreview(
  triggerKey: WhatsAppTemplateTriggerKey,
  parameters: readonly string[],
): string {
  const spec = getWhatsAppTemplateCatalogItem(triggerKey);
  let out = spec.bodyText;
  for (let i = 0; i < spec.parameterLabels.length; i += 1) {
    const rawVal = parameters[i]?.trim();
    const fallback = spec.exampleParameters[i] ?? '-';
    const val = rawVal && rawVal.length > 0 ? rawVal : fallback;
    out = out.split(`{{${i + 1}}}`).join(val);
  }
  return collapseDoublePeriods(out);
}

export function buildWhatsAppQuickReplies(context: {
  clientName?: string | null;
  salonName: string;
  address?: string | null;
  timezone?: string;
  nextBooking?: WhatsAppThreadBookingContextDTO | null;
  appUrl?: string;
}): Array<{ id: string; label: string; text: string }> {
  const firstName = (context.clientName ?? '').trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const tz = context.timezone || 'America/Mexico_City';
  const normalizedUrl = (context.appUrl ?? '').replace(/\/+$/, '');
  const manageUrl =
    context.nextBooking && normalizedUrl
      ? `${normalizedUrl}/cita/${context.nextBooking.manageToken}`
      : normalizedUrl
        ? `${normalizedUrl}/reservar`
        : '';

  const replies: Array<{ id: string; label: string; text: string }> = [];

  if (context.nextBooking) {
    const dateLabel = formatDateLongInTimezone(context.nextBooking.startAt, tz);
    const timeLabel = formatTimeInTimezone(context.nextBooking.startAt, tz, false);
    replies.push({
      id: 'qr-confirm-next',
      label: 'Confirmar próxima cita',
      text: collapseDoublePeriods(
        `${greeting}, te confirmamos tu cita de ${context.nextBooking.serviceName} con ${context.nextBooking.staffName} el ${dateLabel} a las ${timeLabel} en ${context.salonName}. ¡Te esperamos!`,
      ),
    });
    if (manageUrl) {
      replies.push({
        id: 'qr-reschedule-link',
        label: 'Enviar link de reagenda',
        text: `${greeting}, si necesitas ajustar el horario de tu cita (${context.nextBooking.bookingCode}), puedes elegir otro bloque aquí: ${manageUrl}?action=reschedule`,
      });
    }
  }

  if (context.address?.trim()) {
    replies.push({
      id: 'qr-location',
      label: 'Compartir ubicación',
      text: `${greeting}, nuestra dirección en ${context.salonName} es: ${context.address.trim()}. Recuerda que contamos con 15 minutos máximos de tolerancia.`,
    });
  }

  replies.push({
    id: 'qr-deposit-info',
    label: 'Recordar anticipo',
    text: manageUrl
      ? `${greeting}, recuerda subir tu comprobante de anticipo para dejar tu lugar confirmado aquí: ${manageUrl}`
      : `${greeting}, recuerda enviarnos tu comprobante de anticipo para dejar tu lugar confirmado en ${context.salonName}.`,
  });

  replies.push({
    id: 'qr-thanks',
    label: 'Agradecer visita',
    text: `${greeting}, gracias por escribirnos a ${context.salonName}. Con mucho gusto te ayudamos, ¿qué servicio o diseño tienes en mente?`,
  });

  return replies;
}
