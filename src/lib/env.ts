import { z } from 'zod';

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

export const EnvSchema = z.object({
  NODE_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
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
  WHATSAPP_APP_SECRET: optionalString,
  WHATSAPP_VERIFY_TOKEN: optionalString,
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

export interface RuntimeIntegrationStatus {
  mode: 'demo' | 'supabase';
  supabaseConfigured: boolean;
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

export function assertProductionEnvValid(
  raw: Record<string, string | undefined> = process.env,
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

  return {
    mode: supabaseConfigured ? 'supabase' : 'demo',
    supabaseConfigured,
    googleCalendarConfigured: Boolean(googleClientId && googleClientSecret),
    resendConfigured: Boolean(resendApiKey),
    whatsappCloudConfigured: Boolean(whatsappToken && whatsappPhoneId),
    twilioSmsConfigured: Boolean(twilioSid && twilioAuth && twilioFrom),
    stripeConfigured: Boolean(stripeKey),
    mercadoPagoConfigured: Boolean(mpToken),
    appUrl,
  };
}
