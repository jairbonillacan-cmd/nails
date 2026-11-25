import { describe, expect, it } from 'vitest';
import {
  EnvSchema,
  assertProductionEnvValid,
  getEnv,
  getRuntimeIntegrationStatus,
  parseEnv,
} from './env';

describe('Strict Environment Validation (M5)', () => {
  it('parses clean env objects, normalizes empty strings, and validates URLs', () => {
    const parsed = parseEnv({
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_URL: 'https://nails.studio',
      STRIPE_SECRET_KEY: '   ',
      NEXT_PUBLIC_SUPABASE_URL: '',
    });

    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.NEXT_PUBLIC_APP_URL).toBe('https://nails.studio');
    expect(parsed.STRIPE_SECRET_KEY).toBeUndefined();
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();

    expect(EnvSchema.safeParse({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }).success).toBe(
      false,
    );
    expect(getEnv().NODE_ENV).toBe('test');
  });

  it('computes RuntimeIntegrationStatus accurately for demo and supabase modes', () => {
    const demo = getRuntimeIntegrationStatus({ NODE_ENV: 'development' });
    expect(demo.mode).toBe('demo');
    expect(demo.supabaseConfigured).toBe(false);
    expect(demo.appUrl).toBe('http://localhost:3000');

    const supa = getRuntimeIntegrationStatus({
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: 'https://app.nails.studio',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      GOOGLE_CLIENT_ID: 'gc-id',
      GOOGLE_CLIENT_SECRET: 'gc-secret',
      RESEND_API_KEY: 're_123',
      WHATSAPP_ACCESS_TOKEN: 'wa-tok',
      WHATSAPP_PHONE_NUMBER_ID: '123456',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tw-tok',
      TWILIO_FROM_NUMBER: '+525512345678',
      STRIPE_SECRET_KEY: 'sk_live_123',
      MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-123',
    });
    expect(supa.mode).toBe('supabase');
    expect(supa.supabaseConfigured).toBe(true);
    expect(supa.googleCalendarConfigured).toBe(true);
    expect(supa.resendConfigured).toBe(true);
    expect(supa.whatsappCloudConfigured).toBe(true);
    expect(supa.twilioSmsConfigured).toBe(true);
    expect(supa.stripeConfigured).toBe(true);
    expect(supa.mercadoPagoConfigured).toBe(true);
    expect(supa.appUrl).toBe('https://app.nails.studio');
  });

  it('assertProductionEnvValid allows partial configs outside production and fails fast in production', () => {
    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_test_only',
      }),
    ).not.toThrow();

    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      }),
    ).toThrow(/Supabase/i);

    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
        STRIPE_SECRET_KEY: 'sk_live_only',
      }),
    ).toThrow(/Stripe/i);

    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
        MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-only',
      }),
    ).toThrow(/Mercado Pago/i);

    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
        GOOGLE_CLIENT_ID: 'google-client-only',
      }),
    ).toThrow(/Google Calendar/i);

    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
        WHATSAPP_ACCESS_TOKEN: 'wa-token-only',
        WHATSAPP_PHONE_NUMBER_ID: '999',
      }),
    ).toThrow(/WhatsApp/i);

    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
        TWILIO_ACCOUNT_SID: 'AC-only',
      }),
    ).toThrow(/Twilio/i);

    const validProd = assertProductionEnvValid({
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      STRIPE_SECRET_KEY: 'sk_live_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-123',
      MERCADOPAGO_WEBHOOK_SECRET: 'mp_wh_123',
      GOOGLE_CLIENT_ID: 'gc-id',
      GOOGLE_CLIENT_SECRET: 'gc-secret',
      WHATSAPP_ACCESS_TOKEN: 'wa-token',
      WHATSAPP_PHONE_NUMBER_ID: '123456',
      WHATSAPP_APP_SECRET: 'wa-app-secret',
      WHATSAPP_VERIFY_TOKEN: 'wa-verify',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tw-auth',
      TWILIO_FROM_NUMBER: '+525512345678',
    });
    expect(validProd.NODE_ENV).toBe('production');
  });
});
