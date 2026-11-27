import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWhatsAppTemplates } from '../demo-seed';
import {
  fetchMetaWhatsAppStatus,
  getWhatsAppReadinessReport,
  sendWhatsAppLiveTestMessage,
  syncOfficialTemplatesToMeta,
} from './whatsapp-cloud';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('WhatsApp Cloud API readiness, Meta sync, and test dispatch', () => {
  it('computes honest readiness booleans without exposing secret values', () => {
    const empty = getWhatsAppReadinessReport('https://laikona.devand.net/', {});
    expect(empty.cloudReady).toBe(false);
    expect(empty.webhookReady).toBe(false);
    expect(empty.managementReady).toBe(false);
    expect(empty.webhookUrl).toBe('https://laikona.devand.net/api/webhooks/whatsapp');
    expect(empty.requiredWebhookFields).toEqual([
      'messages',
      'statuses',
      'smb_message_echoes',
    ]);
    expect(empty.missingVars).toContain('WHATSAPP_ACCESS_TOKEN');
    expect(empty.missingVars).toContain('WHATSAPP_APP_SECRET');

    const full = getWhatsAppReadinessReport('https://laikona.devand.net', {
      WHATSAPP_ACCESS_TOKEN: 'secret-tok',
      WHATSAPP_PHONE_NUMBER_ID: '1001',
      WHATSAPP_BUSINESS_ACCOUNT_ID: '2002',
      WHATSAPP_APP_SECRET: 'app-sec',
      WHATSAPP_VERIFY_TOKEN: 'ver-tok',
      WHATSAPP_COEXISTENCE_ENABLED: 'true',
    });
    expect(full.cloudReady).toBe(true);
    expect(full.webhookReady).toBe(true);
    expect(full.managementReady).toBe(true);
    expect(full.coexistenceEnabled).toBe(true);
    expect(full.missingVars).toEqual([]);
    expect(JSON.stringify(full)).not.toContain('secret-tok');
    expect(JSON.stringify(full)).not.toContain('app-sec');
    expect(JSON.stringify(full)).not.toContain('ver-tok');
  });

  it('fetches live phone health and template approval statuses from Meta Graph API', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'meta-tok');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '1001');
    vi.stubEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', '2002');

    const mockFetch: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/1001?')) {
        return new Response(
          JSON.stringify({
            display_phone_number: '+52 221 349 3545',
            verified_name: 'LAIKONA NAILS',
            quality_rating: 'GREEN',
            status: 'CONNECTED',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'tpl-meta-1',
              name: 'laikona_cita_confirmada',
              status: 'APPROVED',
              category: 'UTILITY',
              language: 'es_MX',
            },
            {
              id: 'tpl-meta-2',
              name: 'laikona_codigo_acceso',
              status: 'PENDING',
              category: 'AUTHENTICATION',
              language: 'es_MX',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const status = await fetchMetaWhatsAppStatus({
      configuredTemplates: createDefaultWhatsAppTemplates(),
      fetchImpl: mockFetch,
    });
    expect(status.ok).toBe(true);
    expect(status.phone?.verifiedName).toBe('LAIKONA NAILS');
    expect(status.phone?.qualityRating).toBe('GREEN');
    expect(status.templates).toHaveLength(9);
    expect(
      status.templates.find((t) => t.triggerKey === 'booking_confirmed')?.status,
    ).toBe('APPROVED');
    expect(status.templates.find((t) => t.triggerKey === 'client_otp')?.status).toBe(
      'PENDING',
    );
    expect(status.templates.find((t) => t.triggerKey === 'reminder_24h')?.status).toBe(
      'MISSING',
    );
  });

  it('idempotently creates only missing templates on Meta WABA', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'meta-tok');
    vi.stubEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', '2002');

    const createdPayloads: Array<Record<string, unknown>> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (init?.method === 'POST' && url.includes('/2002/message_templates')) {
        const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        createdPayloads.push(body);
        return new Response(JSON.stringify({ id: `meta-${createdPayloads.length}` }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'existing-1',
              name: 'laikona_cita_confirmada',
              status: 'APPROVED',
              language: 'es_MX',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const report = await syncOfficialTemplatesToMeta({
      configuredTemplates: createDefaultWhatsAppTemplates(),
      fetchImpl: mockFetch,
    });
    expect(report.ok).toBe(true);
    expect(report.existing).toHaveLength(1);
    expect(report.created).toHaveLength(8);
    expect(report.failed).toHaveLength(0);
    expect(createdPayloads.some((p) => p.name === 'laikona_codigo_acceso' && p.category === 'AUTHENTICATION')).toBe(true);
    expect(createdPayloads.some((p) => p.name === 'laikona_recordatorio_24h')).toBe(true);
  });

  it('sends a live test message gracefully in demo fallback mode when Meta credentials are not configured', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '');
    const res = await sendWhatsAppLiveTestMessage({
      toPhone: '2221234567',
      salonName: 'LAIKONA NAILS',
      salonAddress: 'Puebla, México',
      appUrl: 'https://laikona.devand.net',
      timezone: 'America/Mexico_City',
    });
    expect(res.status).toBe('sent');
    expect(res.normalizedPhone).toBe('+522221234567');
    expect(res.deliveryMode).toBe('fallback_email_wame');
    expect(res.fallbackWaMeUrl).toContain('https://wa.me/522221234567');
  });
});
