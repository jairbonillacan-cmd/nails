import { NextRequest, NextResponse } from 'next/server';
import {
  fetchMercadoPagoPayment,
  verifyMercadoPagoWebhookSignature,
} from '@/lib/integrations/payments';
import { confirmBookingDepositFromWebhook } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'MERCADOPAGO_WEBHOOK_SECRET no configurado' },
      { status: 503 },
    );
  }

  let body: {
    type?: string;
    action?: string;
    id?: string | number;
    data?: { id?: string | number };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Payload JSON inválido' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const queryDataId =
    searchParams.get('data.id')?.trim() || searchParams.get('id')?.trim() || null;
  const bodyDataId =
    body.data?.id !== undefined
      ? String(body.data.id).trim()
      : body.id !== undefined
        ? String(body.id).trim()
        : null;
  const dataId = queryDataId || bodyDataId;

  const signatureHeader = request.headers.get('x-signature');
  const requestId = request.headers.get('x-request-id');

  if (
    !verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestId,
      dataId,
      secret: webhookSecret,
    })
  ) {
    return NextResponse.json(
      { error: 'Firma de webhook de Mercado Pago inválida' },
      { status: 401 },
    );
  }

  if (!dataId) {
    return NextResponse.json({ error: 'data.id faltante' }, { status: 400 });
  }

  const payment = await fetchMercadoPagoPayment({ paymentId: dataId });
  if (!payment) {
    return NextResponse.json(
      { error: 'No se pudo verificar el estado del pago con Mercado Pago' },
      { status: 502 },
    );
  }

  if (payment.status !== 'approved') {
    return NextResponse.json({
      ok: true,
      ignored: true,
      status: payment.status,
    });
  }

  if (!payment.externalReference) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: 'missing_external_reference',
    });
  }

  const result = await confirmBookingDepositFromWebhook({
    provider: 'mercadopago',
    providerPaymentId: payment.providerPaymentId,
    bookingReference: payment.externalReference,
    amountCents: payment.amountCents,
    currency: payment.currency === 'USD' ? 'USD' : 'MXN',
  });

  if (result.status === 'not_found') {
    return NextResponse.json({
      ok: true,
      ignored: true,
      reason: 'booking_not_found',
    });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result.idempotent,
    bookingId: result.bookingId,
  });
}
