export type WhatsAppTemplateTriggerKey =
  | 'booking_confirmed'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'booking_rescheduled'
  | 'booking_canceled'
  | 'waitlist_offer'
  | 'deposit_rejected'
  | 'client_otp'
  | 'touchup_invite';

type WhatsAppTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export type WhatsAppQuotaAlertLevel = 'ok' | 'warning_80' | 'limit_100';

export type WhatsAppDeliveryMode = 'template' | 'text' | 'fallback_email_wame';

export interface OfficialWhatsAppTemplateSpec {
  triggerKey: WhatsAppTemplateTriggerKey;
  defaultTemplateName: string;
  category: WhatsAppTemplateCategory;
  languageCode: 'es_MX';
  friendlyTitle: string;
  description: string;
  bodyText: string;
  parameterLabels: readonly string[];
  exampleParameters: readonly string[];
  quickReplyButtons?: readonly string[];
  otpExpirationMinutes?: number;
  otpButtonText?: string;
}

export interface BuildWhatsAppTemplatePayloadInput {
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName?: string;
  languageCode?: 'es_MX';
  toPhoneDigits: string;
  parameters: readonly string[];
  quickReplyPayloads?: readonly string[];
  authOtpCode?: string;
}

type MetaWhatsAppTemplateComponent =
  | {
      type: 'body';
      parameters: Array<{
        type: 'text';
        text: string;
      }>;
    }
  | {
      type: 'button';
      sub_type: 'quick_reply';
      index: string;
      parameters: Array<{
        type: 'payload';
        payload: string;
      }>;
    }
  | {
      type: 'button';
      sub_type: 'url';
      index: string;
      parameters: Array<{
        type: 'text';
        text: string;
      }>;
    };

export interface MetaWhatsAppTemplatePayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: 'es_MX';
    };
    components: MetaWhatsAppTemplateComponent[];
  };
}

export interface MetaTemplateCreationPayload {
  name: string;
  language: 'es_MX';
  category: WhatsAppTemplateCategory;
  components: Array<Record<string, unknown>>;
}

export interface SelectWhatsAppDeliveryModeInput {
  hasTemplate: boolean;
  withinServiceWindow: boolean;
  quotaAlertLevel: WhatsAppQuotaAlertLevel;
  whatsappCloudConfigured: boolean;
}

export interface WhatsAppQuotaEvaluation {
  sentCount: number;
  quotaLimit: number;
  remaining: number;
  percentUsed: number;
  alertLevel: WhatsAppQuotaAlertLevel;
}

export const WHATSAPP_GRAPH_API_VERSION = 'v21.0';
export const DEFAULT_WHATSAPP_MONTHLY_QUOTA = 500;
const WHATSAPP_WARNING_THRESHOLD_PERCENT = 80;
const MAX_WHATSAPP_TEMPLATE_PARAM_LENGTH = 1024;

const DEFAULT_CONFIRMATION_TEMPLATE_SPEC: OfficialWhatsAppTemplateSpec = {
  triggerKey: 'booking_confirmed',
  defaultTemplateName: 'laikona_cita_confirmada',
  category: 'UTILITY',
  languageCode: 'es_MX',
  friendlyTitle: 'Confirmación de cita',
  description: 'Confirma horario, servicio, profesional y enlace para ver detalles o agregar al calendario.',
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
};

export const OFFICIAL_WHATSAPP_TEMPLATES: readonly OfficialWhatsAppTemplateSpec[] = [
  DEFAULT_CONFIRMATION_TEMPLATE_SPEC,
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
      'Blvd. Héroes del 5 de Mayo, Puebla, Pue.',
    ],
  },
  {
    triggerKey: 'booking_rescheduled',
    defaultTemplateName: 'laikona_cita_reagendada',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Cita reagendada',
    description: 'Confirma el nuevo día y hora cuando la clienta o el estudio cambian la cita.',
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
    description: 'Ofrece prioridad temporal a la siguiente clienta en espera al liberarse un turno.',
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
    description: 'Avisa a la clienta si el comprobante de transferencia no pudo validarse para que suba otro.',
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
    otpExpirationMinutes: 5,
    otpButtonText: 'Copiar código',
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

export const ALL_WHATSAPP_TEMPLATE_TRIGGERS: readonly WhatsAppTemplateTriggerKey[] =
  OFFICIAL_WHATSAPP_TEMPLATES.map((spec) => spec.triggerKey);

const TEMPLATE_SPEC_BY_TRIGGER = new Map<
  WhatsAppTemplateTriggerKey,
  OfficialWhatsAppTemplateSpec
>(OFFICIAL_WHATSAPP_TEMPLATES.map((spec) => [spec.triggerKey, spec]));

export function getOfficialWhatsAppTemplateSpec(
  triggerKey: WhatsAppTemplateTriggerKey,
): OfficialWhatsAppTemplateSpec {
  return TEMPLATE_SPEC_BY_TRIGGER.get(triggerKey) ?? DEFAULT_CONFIRMATION_TEMPLATE_SPEC;
}

function replaceControlCharactersWithSpace(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code <= 31 || code === 127) {
      out += ' ';
    } else {
      out += input[i] ?? '';
    }
  }
  return out;
}

export function sanitizeWhatsAppTemplateParameter(raw: string): string {
  const cleaned = replaceControlCharactersWithSpace(raw)
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, MAX_WHATSAPP_TEMPLATE_PARAM_LENGTH);
  return cleaned.length > 0 ? cleaned : '-';
}

export function sanitizeWhatsAppTemplateName(
  rawName: string | undefined,
  triggerKey: WhatsAppTemplateTriggerKey,
): string {
  const candidate = (rawName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (candidate.length > 0) {
    return candidate;
  }
  return getOfficialWhatsAppTemplateSpec(triggerKey).defaultTemplateName;
}

export function buildWhatsAppTemplatePayload(
  input: BuildWhatsAppTemplatePayloadInput,
): MetaWhatsAppTemplatePayload {
  const spec = getOfficialWhatsAppTemplateSpec(input.triggerKey);
  const cleanTo = input.toPhoneDigits.replace(/\D/g, '');
  const cleanTemplateName = sanitizeWhatsAppTemplateName(
    input.templateName,
    input.triggerKey,
  );
  const sanitizedParameters = input.parameters.map((param) =>
    sanitizeWhatsAppTemplateParameter(param),
  );

  const components: MetaWhatsAppTemplateComponent[] = [];
  if (sanitizedParameters.length > 0) {
    components.push({
      type: 'body',
      parameters: sanitizedParameters.map((text) => ({
        type: 'text',
        text,
      })),
    });
  }

  if (spec.category === 'AUTHENTICATION') {
    const otpCode = sanitizeWhatsAppTemplateParameter(
      input.authOtpCode ?? sanitizedParameters[0] ?? '',
    );
    if (otpCode !== '-') {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: otpCode }],
      });
    }
  } else if (
    spec.quickReplyButtons &&
    spec.quickReplyButtons.length > 0 &&
    input.quickReplyPayloads &&
    input.quickReplyPayloads.length > 0
  ) {
    const limit = Math.min(spec.quickReplyButtons.length, input.quickReplyPayloads.length, 3);
    for (let idx = 0; idx < limit; idx += 1) {
      const payload = sanitizeWhatsAppTemplateParameter(input.quickReplyPayloads[idx] ?? '');
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(idx),
        parameters: [{ type: 'payload', payload }],
      });
    }
  }

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanTo,
    type: 'template',
    template: {
      name: cleanTemplateName,
      language: {
        code: input.languageCode ?? 'es_MX',
      },
      components,
    },
  };
}

export function buildMetaTemplateCreationPayload(
  spec: OfficialWhatsAppTemplateSpec,
  overrideName?: string,
): MetaTemplateCreationPayload {
  const name = sanitizeWhatsAppTemplateName(overrideName ?? spec.defaultTemplateName, spec.triggerKey);

  if (spec.category === 'AUTHENTICATION') {
    return {
      name,
      language: spec.languageCode,
      category: 'AUTHENTICATION',
      components: [
        {
          type: 'BODY',
          add_security_recommendation: true,
        },
        {
          type: 'FOOTER',
          code_expiration_minutes: spec.otpExpirationMinutes ?? 5,
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'OTP',
              otp_type: 'COPY_CODE',
              text: (spec.otpButtonText ?? 'Copiar código').slice(0, 25),
            },
          ],
        },
      ],
    };
  }

  const components: Array<Record<string, unknown>> = [
    {
      type: 'BODY',
      text: spec.bodyText,
      example: {
        body_text: [[...spec.exampleParameters]],
      },
    },
  ];

  if (spec.quickReplyButtons && spec.quickReplyButtons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: spec.quickReplyButtons.slice(0, 3).map((text) => ({
        type: 'QUICK_REPLY',
        text: text.slice(0, 25),
      })),
    });
  }

  return {
    name,
    language: spec.languageCode,
    category: spec.category,
    components,
  };
}

const CONFIRM_TEXT_INTENTS = new Set([
  'si',
  'confirmo',
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

const RESCHEDULE_TEXT_INTENTS = new Set([
  'reagendar',
  'necesito reagendar',
  'quiero reagendar',
  'cambiar cita',
  'cambiar horario',
  'mover cita',
]);

export function parseInboundAttendanceIntent(
  rawText: string,
): 'confirm' | 'reschedule' | null {
  const normalized = rawText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized || normalized.length > 32) {
    return null;
  }
  if (CONFIRM_TEXT_INTENTS.has(normalized)) {
    return 'confirm';
  }
  if (RESCHEDULE_TEXT_INTENTS.has(normalized)) {
    return 'reschedule';
  }
  return null;
}

export function evaluateWhatsAppQuota(
  sentCount: number,
  quotaLimit = DEFAULT_WHATSAPP_MONTHLY_QUOTA,
): WhatsAppQuotaEvaluation {
  const safeLimit =
    Number.isFinite(quotaLimit) && quotaLimit >= 1
      ? Math.floor(quotaLimit)
      : DEFAULT_WHATSAPP_MONTHLY_QUOTA;
  const safeSent =
    Number.isFinite(sentCount) && sentCount >= 0 ? Math.floor(sentCount) : 0;
  const remaining = Math.max(0, safeLimit - safeSent);
  const percentUsed = Math.min(100, Math.round((safeSent / safeLimit) * 100));
  const alertLevel: WhatsAppQuotaAlertLevel =
    safeSent >= safeLimit
      ? 'limit_100'
      : safeSent * 100 >= safeLimit * WHATSAPP_WARNING_THRESHOLD_PERCENT
        ? 'warning_80'
        : 'ok';

  return {
    sentCount: safeSent,
    quotaLimit: safeLimit,
    remaining,
    percentUsed,
    alertLevel,
  };
}

export function selectWhatsAppDeliveryMode(
  input: SelectWhatsAppDeliveryModeInput,
): WhatsAppDeliveryMode {
  if (!input.whatsappCloudConfigured) {
    return 'fallback_email_wame';
  }
  if (input.quotaAlertLevel === 'limit_100') {
    return 'fallback_email_wame';
  }
  if (input.hasTemplate) {
    return 'template';
  }
  if (input.withinServiceWindow) {
    return 'text';
  }
  return 'fallback_email_wame';
}

export function getWhatsAppMonthKey(
  date: Date = new Date(),
  timeZone = 'America/Mexico_City',
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? String(date.getUTCFullYear());
  const month =
    parts.find((p) => p.type === 'month')?.value ??
    String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
