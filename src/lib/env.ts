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

export function getRuntimeIntegrationStatus(): RuntimeIntegrationStatus {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return {
    mode: supabaseConfigured ? 'supabase' : 'demo',
    supabaseConfigured,
    googleCalendarConfigured: Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    ),
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    whatsappCloudConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
    ),
    twilioSmsConfigured: Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER,
    ),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    mercadoPagoConfigured: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  };
}
