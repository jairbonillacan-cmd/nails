import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from '@/app/robots';
import {
  EnvSchema,
  assertProductionEnvValid,
  isPublicAppUrl,
  getConfiguredRetentionNoticeEmail,
  getConfiguredWhatsAppMonthlyQuota,
  getEnv,
  getRuntimeIntegrationStatus,
  getWhatsAppTemplateNameOverrides,
  isR2S3Configured,
  isSiteNoIndexEnabled,
  isWhatsAppCoexistenceEnabled,
  parseEnv,
} from './env';

const BASE_PROD_SECRETS = {
  NODE_ENV: 'production',
  ADMIN_SESSION_SECRET: 'admin-session-secret-prod-32bytes',
  CLIENT_SESSION_SECRET: 'client-session-secret-prod-32bytes',
  CRON_SECRET: 'cron-secret-prod-32bytes',
  NEXT_PUBLIC_APP_URL: 'https://laikonanails.mx',
};

describe('Strict Environment Validation (M5 + Wave 6 Production Hardening)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('supports SITE_NOINDEX flag and blocks crawlers in robots() when enabled', () => {
    expect(isSiteNoIndexEnabled({})).toBe(false);
    expect(isSiteNoIndexEnabled({ SITE_NOINDEX: 'false' })).toBe(false);
    expect(isSiteNoIndexEnabled({ SITE_NOINDEX: '0' })).toBe(false);
    expect(isSiteNoIndexEnabled({ SITE_NOINDEX: 'true' })).toBe(true);
    expect(isSiteNoIndexEnabled({ SITE_NOINDEX: '1' })).toBe(true);

    vi.stubEnv('SITE_NOINDEX', 'true');
    const stagingRobots = robots();
    expect(stagingRobots.rules).toEqual({ userAgent: '*', disallow: '/' });
    expect(stagingRobots.sitemap).toBeUndefined();

    vi.stubEnv('SITE_NOINDEX', 'false');
    const prodRobots = robots();
    expect(prodRobots.sitemap).toContain('/sitemap.xml');
  });

  it('parses clean env objects, normalizes empty strings, and validates URLs/emails/quotas', () => {
    const parsed = parseEnv({
      NODE_ENV: 'test',
      NEXT_PUBLIC_APP_URL: 'https://laikonanails.mx',
      STRIPE_SECRET_KEY: '   ',
      NEXT_PUBLIC_SUPABASE_URL: '',
      RETENTION_NOTICE_EMAIL: 'karla@laikonanails.mx',
      WHATSAPP_MONTHLY_QUOTA: '500',
      WHATSAPP_COEXISTENCE_ENABLED: 'true',
      R2_PUBLIC_BASE_URL: 'https://media.laikonanails.mx',
    });

    expect(parsed.NODE_ENV).toBe('test');
    expect(parsed.NEXT_PUBLIC_APP_URL).toBe('https://laikonanails.mx');
    expect(parsed.STRIPE_SECRET_KEY).toBeUndefined();
    expect(parsed.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(parsed.RETENTION_NOTICE_EMAIL).toBe('karla@laikonanails.mx');
    expect(parsed.WHATSAPP_MONTHLY_QUOTA).toBe(500);
    expect(parsed.WHATSAPP_COEXISTENCE_ENABLED).toBe('true');

    expect(EnvSchema.safeParse({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }).success).toBe(
      false,
    );
    expect(EnvSchema.safeParse({ RETENTION_NOTICE_EMAIL: 'not-an-email' }).success).toBe(
      false,
    );
    expect(EnvSchema.safeParse({ WHATSAPP_MONTHLY_QUOTA: '0' }).success).toBe(false);
    expect(getEnv().NODE_ENV).toBe('test');
  });

  it('computes RuntimeIntegrationStatus and helper accessors accurately for demo, R2, and supabase modes', () => {
    const demo = getRuntimeIntegrationStatus({ NODE_ENV: 'development' });
    expect(demo.mode).toBe('demo');
    expect(demo.supabaseConfigured).toBe(false);
    expect(demo.r2Configured).toBe(false);
    expect(demo.appUrl).toBe('http://localhost:3000');

    const fullEnv = {
      ...BASE_PROD_SECRETS,
      NEXT_PUBLIC_APP_URL: 'https://laikonanails.mx',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      R2_ACCOUNT_ID: 'acc-123',
      R2_ACCESS_KEY_ID: 'r2-key-id',
      R2_SECRET_ACCESS_KEY: 'r2-secret-key',
      R2_BUCKET_NAME: 'laikona-nails-media',
      RETENTION_NOTICE_EMAIL: 'contabilidad@laikonanails.mx',
      GOOGLE_CLIENT_ID: 'gc-id',
      GOOGLE_CLIENT_SECRET: 'gc-secret',
      RESEND_API_KEY: 're_123',
      RESEND_FROM_EMAIL: 'Laikona Nails <citas@laikonanails.mx>',
      WHATSAPP_ACCESS_TOKEN: 'wa-tok',
      WHATSAPP_PHONE_NUMBER_ID: '123456',
      WHATSAPP_MONTHLY_QUOTA: '600',
      WHATSAPP_COEXISTENCE_ENABLED: 'true',
      WHATSAPP_TEMPLATE_BOOKING_CONFIRMED: 'custom_confirmada',
      WHATSAPP_TEMPLATE_WAITLIST_OFFER: 'custom_waitlist',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'tw-tok',
      TWILIO_FROM_NUMBER: '+525512345678',
      STRIPE_SECRET_KEY: 'sk_live_123',
      MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-123',
    };

    const status = getRuntimeIntegrationStatus(fullEnv);
    expect(status.mode).toBe('supabase');
    expect(status.supabaseConfigured).toBe(true);
    expect(status.r2Configured).toBe(true);
    expect(status.googleCalendarConfigured).toBe(true);
    expect(status.resendConfigured).toBe(true);
    expect(status.whatsappCloudConfigured).toBe(true);
    expect(status.twilioSmsConfigured).toBe(true);
    expect(status.stripeConfigured).toBe(true);
    expect(status.mercadoPagoConfigured).toBe(true);
    expect(status.appUrl).toBe('https://laikonanails.mx');

    expect(isR2S3Configured(fullEnv)).toBe(true);
    expect(isR2S3Configured({ R2_ACCOUNT_ID: 'acc-only' })).toBe(false);
    expect(isWhatsAppCoexistenceEnabled(fullEnv)).toBe(true);
    expect(isWhatsAppCoexistenceEnabled({ WHATSAPP_COEXISTENCE_ENABLED: 'false' })).toBe(
      false,
    );
    expect(getConfiguredWhatsAppMonthlyQuota(fullEnv)).toBe(600);
    expect(getConfiguredRetentionNoticeEmail(fullEnv)).toBe('contabilidad@laikonanails.mx');
    expect(getWhatsAppTemplateNameOverrides(fullEnv)).toEqual({
      booking_confirmed: 'custom_confirmada',
      waitlist_offer: 'custom_waitlist',
    });
  });

  it('requires core secrets in production by default and whenever Supabase or R2 is configured', () => {
    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'production',
      }),
    ).toThrow(/ADMIN_SESSION_SECRET.*CLIENT_SESSION_SECRET.*CRON_SECRET/);

    expect(() =>
      assertProductionEnvValid(
        {
          NODE_ENV: 'production',
        },
        { requireCoreSecrets: false },
      ),
    ).not.toThrow();

    expect(() =>
      assertProductionEnvValid(
        {
          NODE_ENV: 'production',
          NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
          SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
        },
        { requireCoreSecrets: false },
      ),
    ).toThrow(/secretos obligatorios/i);

    expect(() =>
      assertProductionEnvValid(
        {
          NODE_ENV: 'production',
          R2_ACCOUNT_ID: 'acc-123',
          R2_ACCESS_KEY_ID: 'key-id',
          R2_SECRET_ACCESS_KEY: 'secret-key',
          R2_BUCKET_NAME: 'laikona-nails-media',
        },
        { requireCoreSecrets: false },
      ),
    ).toThrow(/secretos obligatorios/i);
  });

  it('rejects a missing or local NEXT_PUBLIC_APP_URL in production so client links never point to localhost', () => {
    for (const bad of [undefined, 'http://localhost:3000', 'https://127.0.0.1', 'http://laikonanails.mx', 'https://nails.localhost']) {
      expect(() =>
        assertProductionEnvValid({ ...BASE_PROD_SECRETS, NEXT_PUBLIC_APP_URL: bad }),
      ).toThrow(/NEXT_PUBLIC_APP_URL/);
    }
    expect(isPublicAppUrl('https://laikona.devand.net')).toBe(true);
    expect(isPublicAppUrl('https://localhost')).toBe(false);
  });

  it('allows partial configs outside production and fails fast on partial integrations in production', () => {
    expect(() =>
      assertProductionEnvValid({
        NODE_ENV: 'development',
        STRIPE_SECRET_KEY: 'sk_test_only',
        R2_ACCOUNT_ID: 'acc-only',
      }),
    ).not.toThrow();

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      }),
    ).toThrow(/Supabase/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        R2_ACCOUNT_ID: 'acc-123',
        R2_BUCKET_NAME: 'laikona-nails-media',
      }),
    ).toThrow(/Cloudflare R2/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        RESEND_API_KEY: 're_live_123',
      }),
    ).toThrow(/RESEND_FROM_EMAIL/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        RESEND_API_KEY: 're_live_123',
        RESEND_FROM_EMAIL: 'invalid-email-format',
      }),
    ).toThrow(/RESEND_FROM_EMAIL/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        STRIPE_SECRET_KEY: 'sk_live_only',
      }),
    ).toThrow(/Stripe/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-only',
      }),
    ).toThrow(/Mercado Pago/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        GOOGLE_CLIENT_ID: 'google-client-only',
      }),
    ).toThrow(/Google Calendar/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        WHATSAPP_ACCESS_TOKEN: 'wa-token-only',
        WHATSAPP_PHONE_NUMBER_ID: '999',
      }),
    ).toThrow(/WhatsApp/i);

    expect(() =>
      assertProductionEnvValid({
        ...BASE_PROD_SECRETS,
        TWILIO_ACCOUNT_SID: 'AC-only',
      }),
    ).toThrow(/Twilio/i);

    const validProd = assertProductionEnvValid({
      ...BASE_PROD_SECRETS,
      NEXT_PUBLIC_APP_URL: 'https://laikonanails.mx',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      R2_ACCOUNT_ID: 'acc-123',
      R2_ACCESS_KEY_ID: 'r2-access',
      R2_SECRET_ACCESS_KEY: 'r2-secret',
      R2_BUCKET_NAME: 'laikona-nails-media',
      RESEND_API_KEY: 're_live_123',
      RESEND_FROM_EMAIL: 'Laikona Nails <citas@laikonanails.mx>',
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
