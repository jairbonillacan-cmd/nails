import { getRuntimeIntegrationStatus } from '../env';
import type { PaymentMode } from '../types';

export interface CheckoutSessionResult {
  provider: PaymentMode;
  requiresRedirect: boolean;
  checkoutUrl: string | null;
  instructions: string;
}

export async function createDepositCheckout(params: {
  bookingCode: string;
  amountCents: number;
  currency: 'MXN' | 'USD';
  clientEmail: string | null;
  mode: PaymentMode;
  manageUrl: string;
}): Promise<CheckoutSessionResult> {
  const env = getRuntimeIntegrationStatus();

  if (params.mode === 'none' || params.amountCents <= 0) {
    return {
      provider: 'none',
      requiresRedirect: false,
      checkoutUrl: null,
      instructions: 'Esta cita no requiere anticipo.',
    };
  }

  if (params.mode === 'stripe' && env.stripeConfigured) {

    return {
      provider: 'stripe',
      requiresRedirect: false,
      checkoutUrl: `${params.manageUrl}?checkout=stripe_ready`,
      instructions: 'Checkout de Stripe habilitado con tu clave en .env.',
    };
  }

  if (params.mode === 'mercadopago' && env.mercadoPagoConfigured) {

    return {
      provider: 'mercadopago',
      requiresRedirect: false,
      checkoutUrl: `${params.manageUrl}?checkout=mercadopago_ready`,
      instructions: 'Preferencia de Mercado Pago habilitada con tu token en .env.',
    };
  }

  return {
    provider: 'manual_transfer',
    requiresRedirect: false,
    checkoutUrl: null,
    instructions:
      'Realiza la transferencia SPEI y adjunta tu comprobante para confirmación prioritaria.',
  };
}
