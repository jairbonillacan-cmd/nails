import crypto from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDepositCheckoutSession,
  fetchMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from './payments';

function signMercadoPago(params: {
  dataId: string;
  requestId: string;
  ts: string;
  secret: string;
}): string {
  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${params.ts};`;
  const v1 = crypto
    .createHmac('sha256', params.secret)
    .update(manifest, 'utf8')
    .digest('hex');
  return `ts=${params.ts},v1=${v1}`;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Mercado Pago Checkout & Webhook Signature Security', () => {
  it('verifies valid Mercado Pago ts/v1 HMAC signatures, enforces ±5m replay window, and fails closed on missing secret, stale ts, or tamper', () => {
    const secret = 'mp-webhook-secret-prod-999';
    const dataId = '987654321';
    const requestId = 'req-mp-abc-123';
    const nowMs = 1_732_550_000_000;
    const ts = '1732550000';
    const validHeader = signMercadoPago({ dataId, requestId, ts, secret });

    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', '');
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: validHeader,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(false);

    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', secret);
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: validHeader,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(true);

    const msHeader = signMercadoPago({
      dataId,
      requestId,
      ts: String(nowMs - 120_000),
      secret,
    });
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: msHeader,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(true);

    const expiredHeader = signMercadoPago({
      dataId,
      requestId,
      ts: String(Math.floor(nowMs / 1000) - 301),
      secret,
    });
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: expiredHeader,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(false);

    const futureHeader = signMercadoPago({
      dataId,
      requestId,
      ts: String(Math.floor(nowMs / 1000) + 301),
      secret,
    });
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: futureHeader,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(false);

    for (const badTs of ['not-a-number', '0', '-100', '12345', '1732550000.5']) {
      const malformedHeader = signMercadoPago({ dataId, requestId, ts: badTs, secret });
      expect(
        verifyMercadoPagoWebhookSignature({
          signatureHeader: malformedHeader,
          requestId,
          dataId,
          nowMs,
        }),
      ).toBe(false);
    }

    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: validHeader,
        requestId,
        dataId: '987654322',
        nowMs,
      }),
    ).toBe(false);

    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: validHeader,
        requestId: 'req-tampered',
        dataId,
        nowMs,
      }),
    ).toBe(false);

    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: `ts=${ts},v1=${'0'.repeat(64)}`,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(false);

    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: null,
        requestId,
        dataId,
        nowMs,
      }),
    ).toBe(false);
  });

  it('creates a real Mercado Pago checkout preference when MERCADOPAGO_ACCESS_TOKEN is set and falls back cleanly in demo mode', async () => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '');
    const demoSession = await createDepositCheckoutSession({
      bookingCode: 'NL-DEMO01',
      amountCents: 20000,
      currency: 'MXN',
      clientEmail: 'sofia@ejemplo.mx',
      mode: 'mercadopago',
      manageUrl: 'https://laikona.mx/cita/token-123',
    });
    expect(demoSession.provider).toBe('manual_transfer');
    expect(demoSession.requiresRedirect).toBe(false);
    expect(demoSession.checkoutUrl).toBeNull();

    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-live-token-xyz');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://laikona.mx');

    const capturedRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      capturedRequests.push({ url, body });
      return new Response(
        JSON.stringify({
          id: 'pref-mp-1001',
          init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-mp-1001',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const liveSession = await createDepositCheckoutSession({
      bookingCode: 'NL-LIVE01',
      amountCents: 20000,
      currency: 'MXN',
      clientEmail: 'sofia@ejemplo.mx',
      mode: 'mercadopago',
      manageUrl: 'https://laikona.mx/cita/token-123',
      fetchImpl: mockFetch,
    });

    expect(liveSession.provider).toBe('mercadopago');
    expect(liveSession.requiresRedirect).toBe(true);
    expect(liveSession.preferenceId).toBe('pref-mp-1001');
    expect(liveSession.checkoutUrl).toContain('mercadopago.com.mx');
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0]?.url).toBe(
      'https://api.mercadopago.com/checkout/preferences',
    );
    expect(capturedRequests[0]?.body.external_reference).toBe('NL-LIVE01');
    expect(capturedRequests[0]?.body.notification_url).toBe(
      'https://laikona.mx/api/webhooks/mercadopago',
    );
  });

  it('fetches and normalizes payment status from Mercado Pago API', async () => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-fetch-token');
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: 555001122,
          status: 'approved',
          transaction_amount: 200,
          currency_id: 'MXN',
          external_reference: 'NL-1044',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const payment = await fetchMercadoPagoPayment({
      paymentId: '555001122',
      fetchImpl: mockFetch,
    });
    expect(payment).toEqual({
      providerPaymentId: '555001122',
      status: 'approved',
      amountCents: 20000,
      currency: 'MXN',
      externalReference: 'NL-1044',
    });
  });
});
