export type WhatsAppTemplateTriggerKey =
  | 'booking_confirmed'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'booking_rescheduled'
  | 'booking_canceled'
  | 'waitlist_offer';

export type WhatsAppQuotaAlertLevel = 'ok' | 'warning_80' | 'limit_100';

export type WhatsAppDeliveryMode = 'template' | 'text' | 'fallback_email_wame';

export interface OfficialWhatsAppTemplateSpec {
  triggerKey: WhatsAppTemplateTriggerKey;
  defaultTemplateName: string;
  category: 'UTILITY';
  languageCode: 'es_MX';
  friendlyTitle: string;
  description: string;
  parameterLabels: readonly string[];
}

export interface BuildWhatsAppTemplatePayloadInput {
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName?: string;
  languageCode?: 'es_MX';
  toPhoneDigits: string;
  parameters: readonly string[];
}

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
    components: Array<{
      type: 'body';
      parameters: Array<{
        type: 'text';
        text: string;
      }>;
    }>;
  };
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
  description: 'Confirma horario, servicio, manicurista y enlace para agregar al calendario.',
  parameterLabels: ['Clienta', 'Servicio', 'Fecha', 'Hora', 'Manicurista', 'Enlace'],
};

export const OFFICIAL_WHATSAPP_TEMPLATES: readonly OfficialWhatsAppTemplateSpec[] = [
  DEFAULT_CONFIRMATION_TEMPLATE_SPEC,
  {
    triggerKey: 'reminder_24h',
    defaultTemplateName: 'laikona_recordatorio_24h',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Recordatorio 24 horas antes',
    description: 'Recuerda la cita un día antes con opción de confirmar o reagendar.',
    parameterLabels: ['Clienta', 'Servicio', 'Hora', 'Manicurista', 'Enlace'],
  },
  {
    triggerKey: 'reminder_2h',
    defaultTemplateName: 'laikona_recordatorio_2h',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Recordatorio 2 horas antes',
    description: 'Avisa 2 horas antes con la dirección del estudio y tiempo de tolerancia.',
    parameterLabels: ['Clienta', 'Hora', 'Dirección'],
  },
  {
    triggerKey: 'booking_rescheduled',
    defaultTemplateName: 'laikona_cita_reagendada',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Cita reagendada',
    description: 'Confirma el nuevo día y hora cuando la clienta o el estudio cambian la cita.',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha', 'Hora', 'Enlace'],
  },
  {
    triggerKey: 'booking_canceled',
    defaultTemplateName: 'laikona_cita_cancelada',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Cita cancelada',
    description: 'Notifica la cancelación y confirma que el espacio quedó liberado.',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha'],
  },
  {
    triggerKey: 'waitlist_offer',
    defaultTemplateName: 'laikona_lista_espera',
    category: 'UTILITY',
    languageCode: 'es_MX',
    friendlyTitle: 'Espacio libre en lista de espera',
    description: 'Ofrece prioridad temporal a la siguiente clienta en espera al liberarse un turno.',
    parameterLabels: ['Clienta', 'Servicio', 'Fecha', 'Hora', 'Enlace'],
  },
] as const;

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

function sanitizeWhatsAppTemplateName(
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
  const cleanTo = input.toPhoneDigits.replace(/\D/g, '');
  const cleanTemplateName = sanitizeWhatsAppTemplateName(
    input.templateName,
    input.triggerKey,
  );
  const sanitizedParameters = input.parameters.map((param) =>
    sanitizeWhatsAppTemplateParameter(param),
  );

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
      components:
        sanitizedParameters.length > 0
          ? [
              {
                type: 'body',
                parameters: sanitizedParameters.map((text) => ({
                  type: 'text',
                  text,
                })),
              },
            ]
          : [],
    },
  };
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
