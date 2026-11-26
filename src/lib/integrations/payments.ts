import crypto from 'node:crypto';
import { getRuntimeIntegrationStatus } from '../env';
import { logWarn } from '../logger';
import type { PaymentMode } from '../types';

export interface CheckoutSessionResult {
  provider: PaymentMode;
  requiresRedirect: boolean;
  checkoutUrl: string | null;
  preferenceId?: string | null;
  instructions: string;
}

export interface MercadoPagoPaymentInfo {
  providerPaymentId: string;
  status: string;
  amountCents: number;
  currency: string;
  externalReference: string | null;
}

const HEX_64_RE = /^[0-9a-f]{64}$/i;

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), 'utf8');
  const bufB = Buffer.from(b.toLowerCase(), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyMercadoPagoWebhookSignature(params: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret?: string | null;
}): boolean {
  const effectiveSecret = (
    params.secret !== undefined
      ? params.secret
      : process.env.MERCADOPAGO_WEBHOOK_SECRET
  )?.trim();
  if (!effectiveSecret) return false;

  const rawSig = params.signatureHeader?.trim();
  const requestId = params.requestId?.trim();
  const dataId = params.dataId?.trim();
  if (!rawSig || !requestId || !dataId) return false;

  let ts = '';
  let v1 = '';
  for (const part of rawSig.split(',')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim().toLowerCase();
    const val = part.slice(eqIndex + 1).trim();
    if (key === 'ts') ts = val;
    if (key === 'v1') v1 = val;
  }

  if (!ts || !v1 || !HEX_64_RE.test(v1)) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', effectiveSecret)
    .update(manifest, 'utf8')
    .digest('hex');

  return timingSafeHexEqual(v1, expected);
}

export async function fetchMercadoPagoPayment(params: {
  paymentId: string;
  accessToken?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<MercadoPagoPaymentInfo | null> {
  const token = (
    params.accessToken !== undefined
      ? params.accessToken
      : process.env.MERCADOPAGO_ACCESS_TOKEN
  )?.trim();
  if (!token || !params.paymentId.trim()) return null;

  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const res = await fetcher(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(params.paymentId.trim())}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!res.ok) {
    logWarn('mercadopago_fetch_payment_failed', {
      paymentId: params.paymentId,
      status: res.status,
    });
    return null;
  }

  const payload = (await res.json().catch((err) => {
    logWarn('mercadopago_fetch_payment_json_failed', { error: err });
    return null;
  })) as {
    id?: string | number;
    status?: string;
    transaction_amount?: number;
    currency_id?: string;
    external_reference?: string | null;
  } | null;

  if (!payload || payload.id === undefined || typeof payload.status !== 'string') {
    return null;
  }

  const amountCents =
    typeof payload.transaction_amount === 'number' &&
    Number.isFinite(payload.transaction_amount)
      ? Math.max(0, Math.round(payload.transaction_amount * 100))
      : 0;

  return {
    providerPaymentId: String(payload.id),
    status: payload.status,
    amountCents,
    currency: typeof payload.currency_id === 'string' ? payload.currency_id : 'MXN',
    externalReference:
      typeof payload.external_reference === 'string'
        ? payload.external_reference.trim() || null
        : null,
  };
}

export async function createDepositCheckoutSession(params: {
  bookingCode: string;
  amountCents: number;
  currency: 'MXN' | 'USD';
  clientEmail: string | null;
  mode: PaymentMode;
  manageUrl: string;
  title?: string;
  fetchImpl?: typeof fetch;
}): Promise<CheckoutSessionResult> {
  const env = getRuntimeIntegrationStatus();

  if (params.mode === 'none' || params.amountCents <= 0) {
    return {
      provider: 'none',
      requiresRedirect: false,
      checkoutUrl: null,
      preferenceId: null,
      instructions: 'Esta cita no requiere anticipo.',
    };
  }

  if (params.mode === 'stripe' && env.stripeConfigured) {
    return {
      provider: 'stripe',
      requiresRedirect: false,
      checkoutUrl: `${params.manageUrl}?checkout=stripe_ready`,
      preferenceId: null,
      instructions: 'Checkout de Stripe habilitado con tu clave en .env.',
    };
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (params.mode === 'mercadopago' && mpToken) {
    const fetcher = params.fetchImpl ?? globalThis.fetch;
    const unitPrice = Number((params.amountCents / 100).toFixed(2));
    const res = await fetcher('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            id: params.bookingCode,
            title: params.title ?? `Anticipo cita ${params.bookingCode}`,
            quantity: 1,
            currency_id: params.currency,
            unit_price: unitPrice,
          },
        ],
        ...(params.clientEmail ? { payer: { email: params.clientEmail } } : {}),
        external_reference: params.bookingCode,
        notification_url: `${env.appUrl}/api/webhooks/mercadopago`,
        back_urls: {
          success: `${params.manageUrl}?payment=approved`,
          pending: `${params.manageUrl}?payment=pending`,
          failure: `${params.manageUrl}?payment=failure`,
        },
        auto_return: 'approved',
      }),
    });

    if (res.ok) {
      const json = (await res.json().catch((err) => {
        logWarn('mercadopago_preference_json_failed', {
          bookingCode: params.bookingCode,
          error: err,
        });
        return null;
      })) as {
        id?: string;
        init_point?: string;
        sandbox_init_point?: string;
      } | null;
      const checkoutUrl = json?.init_point ?? json?.sandbox_init_point ?? null;
      if (checkoutUrl) {
        return {
          provider: 'mercadopago',
          requiresRedirect: true,
          checkoutUrl,
          preferenceId: json?.id ?? null,
          instructions:
            'Completa tu anticipo en Mercado Pago para confirmar tu cita automáticamente.',
        };
      }
      logWarn('mercadopago_preference_missing_url', {
        bookingCode: params.bookingCode,
      });
    } else {
      logWarn('mercadopago_preference_http_error', {
        bookingCode: params.bookingCode,
        status: res.status,
      });
    }

    return {
      provider: 'mercadopago',
      requiresRedirect: false,
      checkoutUrl: null,
      preferenceId: null,
      instructions:
        'No se pudo inicializar Mercado Pago en este momento. Puedes enviar comprobante SPEI o reintentar desde tu enlace de cita.',
    };
  }

  return {
    provider: 'manual_transfer',
    requiresRedirect: false,
    checkoutUrl: null,
    preferenceId: null,
    instructions:
      'Realiza la transferencia SPEI y adjunta tu comprobante para confirmación prioritaria.',
  };
}

export async function createDepositCheckout(params: {
  bookingCode: string;
  amountCents: number;
  currency: 'MXN' | 'USD';
  clientEmail: string | null;
  mode: PaymentMode;
  manageUrl: string;
}): Promise<CheckoutSessionResult> {
  return createDepositCheckoutSession(params);
}
