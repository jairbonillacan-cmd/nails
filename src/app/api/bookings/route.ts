import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readClientSessionToken } from '@/lib/auth/client-session';
import {
  getRepository,
  persistBookingMediaField,
  PolicyError,
  SlotConflictError,
} from '@/lib/repositories/db';
import { createDepositCheckout } from '@/lib/integrations/payments';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { MediaValidationError } from '@/lib/storage/media';

const createBookingSchema = z.object({
  serviceId: z.string().min(1),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().nullable().optional(),
  startAt: z.string().min(1),
  clientName: z.string().min(2, 'Escribe tu nombre completo'),
  clientPhone: z.string().min(8, 'Escribe un WhatsApp válido de 10 dígitos'),
  clientEmail: z.string().email('Correo inválido').optional().or(z.literal('')).nullable(),
  clientBirthday: z.string().optional().nullable(),
  clientNotes: z.string().max(1000).optional(),
  inspoPhotoUrl: z.string().max(4_000_000).optional().nullable(),
  paymentProofUrl: z.string().max(4_000_000).optional().nullable(),
  couponCode: z.string().max(40).optional().nullable(),
  sessionToken: z.string().optional().nullable(),
  holdId: z.string().min(1).optional().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = createBookingSchema.parse(await request.json());
    const idempotencyKey = request.headers.get('Idempotency-Key');
    const cookieSessionToken = await readClientSessionToken(request);
    const effectiveSessionToken = cookieSessionToken ?? parsed.sessionToken ?? null;

    const inspoPhotoUrl = await persistBookingMediaField(parsed.inspoPhotoUrl, 'inspo');
    const paymentProofUrl = await persistBookingMediaField(
      parsed.paymentProofUrl,
      'proofs',
    );

    const repo = getRepository();
    const booking = await repo.createBookingAtomic({
      ...parsed,
      inspoPhotoUrl,
      paymentProofUrl,
      clientEmail: parsed.clientEmail || null,
      sessionToken: effectiveSessionToken,
      holdId: parsed.holdId ?? null,
      idempotencyKey,
      source: 'web',
      forceConfirmed: false,
    });

    const manageUrl = `/cita/${booking.manageToken}`;
    const bootstrap = await repo.getPublicBootstrap();
    const env = getRuntimeIntegrationStatus();
    const checkout = await createDepositCheckout({
      bookingCode: booking.bookingCode,
      amountCents: booking.depositAmountCents,
      currency: bootstrap.settings.currency,
      clientEmail: booking.client.email,
      mode: bootstrap.settings.paymentMode,
      manageUrl: `${env.appUrl}${manageUrl}`,
    });

    return NextResponse.json(
      {
        booking,
        manageUrl,
        checkout,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        {
          code: err.code,
          error: err.message,
          suggestedSlots: err.suggestedSlots,
        },
        { status: 409 },
      );
    }
    if (err instanceof MediaValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo completar la cita' }, { status: 500 });
  }
}
