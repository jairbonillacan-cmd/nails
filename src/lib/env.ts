import { z } from 'zod';
import type { WhatsAppTemplateTriggerKey } from './types';

const emptyToUndefined = (val: unknown): unknown => {
  if (typeof val === 'string' && val.trim() === '') {
    return undefined;
  }
  return val;
};

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().trim().url().optional(),
);

const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().email().optional(),
);

const optionalPositiveInt = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().max(100_000).optional(),
);

const optionalBooleanFlag = z.preprocess(
  emptyToUndefined,
  z.enum(['true', 'false', '1', '0']).optional(),
);

const RESEND_FROM_RE =
  /^(?:[^<>\r\n]+<\s*[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+\s*>|[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/;

export const EnvSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_NAME: optionalString,
  R2_PUBLIC_BASE_URL: optionalUrl,
  RETENTION_NOTICE_EMAIL: optionalEmail,
  ADMIN_SESSION_SECRET: optionalString,
  CLIENT_SESSION_SECRET: optionalString,
  CRON_SECRET: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_WEBHOOK_TOKEN: optionalString,
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_BUSINESS_ACCOUNT_ID: optionalString,
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
  WHATSAPP_FLOW_ID: optionalString,
  WHATSAPP_MONTHLY_QUOTA: optionalPositiveInt,
  WHATSAPP_COEXISTENCE_ENABLED: optionalBooleanFlag,
  WHATSAPP_TEMPLATE_BOOKING_CONFIRMED: optionalString,
  WHATSAPP_TEMPLATE_REMINDER_24H: optionalString,
  WHATSAPP_TEMPLATE_REMINDER_2H: optionalString,
  WHATSAPP_TEMPLATE_BOOKING_RESCHEDULED: optionalString,
  WHATSAPP_TEMPLATE_BOOKING_CANCELED: optionalString,
  WHATSAPP_TEMPLATE_WAITLIST_OFFER: optionalString,
  TWILIO_ACCOUNT_SID: optionalString,
  TWILIO_AUTH_TOKEN: optionalString,
  TWILIO_FROM_NUMBER: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  MERCADOPAGO_ACCESS_TOKEN: optionalString,
  MERCADOPAGO_WEBHOOK_SECRET: optionalString,
  NAILS_DEMO_DB_PATH: optionalString,
  NAILS_DEMO_UPLOADS_DIR: optionalString,
});

export type AppEnv = z.infer<typeof EnvSchema>;

export interface ProductionEnvValidationOptions {
  requireCoreSecrets?: boolean;
}

export interface RuntimeIntegrationStatus {
  mode: 'demo' | 'supabase';
  supabaseConfigured: boolean;
  r2Configured: boolean;
  googleCalendarConfigured: boolean;
  resendConfigured: boolean;
  whatsappCloudConfigured: boolean;
  twilioSmsConfigured: boolean;
  stripeConfigured: boolean;
  mercadoPagoConfigured: boolean;
  appUrl: string;
}

export function parseEnv(
  raw: Record<string, string | undefined> = process.env,
): AppEnv {
  return EnvSchema.parse(raw);
}

export function getEnv(): AppEnv {
  return parseEnv(process.env);
}

export function isR2S3Configured(
  raw: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    raw.R2_ACCOUNT_ID?.trim() &&
      raw.R2_ACCESS_KEY_ID?.trim() &&
      raw.R2_SECRET_ACCESS_KEY?.trim() &&
      raw.R2_BUCKET_NAME?.trim(),
  );
}

export function isWhatsAppCoexistenceEnabled(
  raw: Record<string, string | undefined> = process.env,
): boolean {
  const value = raw.WHATSAPP_COEXISTENCE_ENABLED?.trim().toLowerCase();
  return value === 'true' || value === '1';
}

export function getConfiguredWhatsAppMonthlyQuota(
  raw: Record<string, string | undefined> = process.env,
): number | undefined {
  const parsed = EnvSchema.shape.WHATSAPP_MONTHLY_QUOTA.safeParse(
    raw.WHATSAPP_MONTHLY_QUOTA,
  );
  return parsed.success ? parsed.data : undefined;
}

export function getConfiguredRetentionNoticeEmail(
  raw: Record<string, string | undefined> = process.env,
): string | undefined {
  const parsed = EnvSchema.shape.RETENTION_NOTICE_EMAIL.safeParse(
    raw.RETENTION_NOTICE_EMAIL,
  );
  return parsed.success ? parsed.data : undefined;
}

export function getWhatsAppTemplateNameOverrides(
  raw: Record<string, string | undefined> = process.env,
): Partial<Record<WhatsAppTemplateTriggerKey, string>> {
  const overrides: Partial<Record<WhatsAppTemplateTriggerKey, string>> = {};
  const entries: Array<[WhatsAppTemplateTriggerKey, string | undefined]> = [
    ['booking_confirmed', raw.WHATSAPP_TEMPLATE_BOOKING_CONFIRMED?.trim()],
    ['reminder_24h', raw.WHATSAPP_TEMPLATE_REMINDER_24H?.trim()],
    ['reminder_2h', raw.WHATSAPP_TEMPLATE_REMINDER_2H?.trim()],
    ['booking_rescheduled', raw.WHATSAPP_TEMPLATE_BOOKING_RESCHEDULED?.trim()],
    ['booking_canceled', raw.WHATSAPP_TEMPLATE_BOOKING_CANCELED?.trim()],
    ['waitlist_offer', raw.WHATSAPP_TEMPLATE_WAITLIST_OFFER?.trim()],
  ];
  for (const [key, value] of entries) {
    if (value) {
      overrides[key] = value;
    }
  }
  return overrides;
}

export function assertProductionEnvValid(
  raw: Record<string, string | undefined> = process.env,
  options?: ProductionEnvValidationOptions,
): AppEnv {
  const env = parseEnv(raw);
  if (env.NODE_ENV !== 'production') {
    return env;
  }

  const errors: string[] = [];

  const supabaseVars = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ];
  const supabaseCount = supabaseVars.filter(Boolean).length;
  if (supabaseCount > 0 && supabaseCount < supabaseVars.length) {
    errors.push(
      'Configuración parcial de Supabase: se requieren NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const r2Vars = [
    env.R2_ACCOUNT_ID,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
    env.R2_BUCKET_NAME,
  ];
  const r2Count = r2Vars.filter(Boolean).length;
  if (r2Count > 0 && r2Count < r2Vars.length) {
    errors.push(
      'Configuración parcial de Cloudflare R2: se requieren R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET_NAME.',
    );
  }

  const requireCoreSecrets =
    options?.requireCoreSecrets !== false || supabaseCount > 0 || r2Count > 0;
  if (requireCoreSecrets) {
    const missingCoreSecrets: string[] = [];
    if (!env.ADMIN_SESSION_SECRET) missingCoreSecrets.push('ADMIN_SESSION_SECRET');
    if (!env.CLIENT_SESSION_SECRET) missingCoreSecrets.push('CLIENT_SESSION_SECRET');
    if (!env.CRON_SECRET) missingCoreSecrets.push('CRON_SECRET');
    if (missingCoreSecrets.length > 0) {
      errors.push(
        `Faltan secretos obligatorios en producción: ${missingCoreSecrets.join(', ')}.`,
      );
    }
  }

  if (env.RESEND_API_KEY) {
    const fromEmail = env.RESEND_FROM_EMAIL?.trim();
    if (!fromEmail || !RESEND_FROM_RE.test(fromEmail)) {
      errors.push(
        'Configuración inválida de Resend: al definir RESEND_API_KEY debes configurar un RESEND_FROM_EMAIL válido (ej. Laikona Nails <citas@tudominio.mx>).',
      );
    }
  }

  if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) {
    errors.push(
      'Configuración parcial de Stripe: se requieren STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET.',
    );
  }

  if (
    Boolean(env.MERCADOPAGO_ACCESS_TOKEN) !== Boolean(env.MERCADOPAGO_WEBHOOK_SECRET)
  ) {
    errors.push(
      'Configuración parcial de Mercado Pago: se requieren MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET.',
    );
  }

  if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
    errors.push(
      'Configuración parcial de Google Calendar: se requieren GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.',
    );
  }

  const whatsappVars = [
    env.WHATSAPP_ACCESS_TOKEN,
    env.WHATSAPP_PHONE_NUMBER_ID,
    env.WHATSAPP_APP_SECRET,
    env.WHATSAPP_VERIFY_TOKEN,
  ];
  const whatsappCount = whatsappVars.filter(Boolean).length;
  if (whatsappCount > 0 && whatsappCount < whatsappVars.length) {
    errors.push(
      'Configuración parcial de WhatsApp Cloud: se requieren WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN.',
    );
  }

  const twilioVars = [
    env.TWILIO_ACCOUNT_SID,
    env.TWILIO_AUTH_TOKEN,
    env.TWILIO_FROM_NUMBER,
  ];
  const twilioCount = twilioVars.filter(Boolean).length;
  if (twilioCount > 0 && twilioCount < twilioVars.length) {
    errors.push(
      'Configuración parcial de Twilio SMS: se requieren TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_FROM_NUMBER.',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuración de entorno inválida para producción:\n- ${errors.join('\n- ')}`,
    );
  }

  return env;
}

export function getRuntimeIntegrationStatus(
  raw: Record<string, string | undefined> = process.env,
): RuntimeIntegrationStatus {
  const parsed = EnvSchema.safeParse(raw);
  const env = parsed.success ? parsed.data : null;

  const supabaseUrl = env?.NEXT_PUBLIC_SUPABASE_URL ?? raw.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? raw.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseService = env?.SUPABASE_SERVICE_ROLE_KEY ?? raw.SUPABASE_SERVICE_ROLE_KEY;
  const r2AccountId = env?.R2_ACCOUNT_ID ?? raw.R2_ACCOUNT_ID;
  const r2AccessKeyId = env?.R2_ACCESS_KEY_ID ?? raw.R2_ACCESS_KEY_ID;
  const r2SecretAccessKey = env?.R2_SECRET_ACCESS_KEY ?? raw.R2_SECRET_ACCESS_KEY;
  const r2BucketName = env?.R2_BUCKET_NAME ?? raw.R2_BUCKET_NAME;
  const googleClientId = env?.GOOGLE_CLIENT_ID ?? raw.GOOGLE_CLIENT_ID;
  const googleClientSecret = env?.GOOGLE_CLIENT_SECRET ?? raw.GOOGLE_CLIENT_SECRET;
  const resendApiKey = env?.RESEND_API_KEY ?? raw.RESEND_API_KEY;
  const whatsappToken = env?.WHATSAPP_ACCESS_TOKEN ?? raw.WHATSAPP_ACCESS_TOKEN;
  const whatsappPhoneId = env?.WHATSAPP_PHONE_NUMBER_ID ?? raw.WHATSAPP_PHONE_NUMBER_ID;
  const twilioSid = env?.TWILIO_ACCOUNT_SID ?? raw.TWILIO_ACCOUNT_SID;
  const twilioAuth = env?.TWILIO_AUTH_TOKEN ?? raw.TWILIO_AUTH_TOKEN;
  const twilioFrom = env?.TWILIO_FROM_NUMBER ?? raw.TWILIO_FROM_NUMBER;
  const stripeKey = env?.STRIPE_SECRET_KEY ?? raw.STRIPE_SECRET_KEY;
  const mpToken = env?.MERCADOPAGO_ACCESS_TOKEN ?? raw.MERCADOPAGO_ACCESS_TOKEN;
  const appUrl = env?.NEXT_PUBLIC_APP_URL ?? raw.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnon && supabaseService);
  const r2Configured = Boolean(
    r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2BucketName,
  );

  return {
    mode: supabaseConfigured ? 'supabase' : 'demo',
    supabaseConfigured,
    r2Configured,
    googleCalendarConfigured: Boolean(googleClientId && googleClientSecret),
    resendConfigured: Boolean(resendApiKey),
    whatsappCloudConfigured: Boolean(whatsappToken && whatsappPhoneId),
    twilioSmsConfigured: Boolean(twilioSid && twilioAuth && twilioFrom),
    stripeConfigured: Boolean(stripeKey),
    mercadoPagoConfigured: Boolean(mpToken),
    appUrl,
  };
}
