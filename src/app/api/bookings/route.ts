import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readClientSessionToken } from '@/lib/auth/client-session';
import {
  createBookingWithExtras,
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
  extraServiceIds: z.array(z.string().min(1)).max(8).default([]),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().nullable().optional(),
  startAt: z.string().min(1),
  clientName: z.string().min(2, 'Escribe tu nombre completo'),
  clientPhone: z.string().min(8, 'Escribe un WhatsApp válido de 10 dígitos'),
  clientEmail: z.string().email('Correo inválido').optional().or(z.literal('')).nullable(),
  clientInstagram: z.string().max(120).optional().nullable(),
  clientBirthday: z.string().optional().nullable(),
  clientNotes: z.string().max(1000).optional(),
  inspoPhotoUrl: z.string().max(4_000_000).optional().nullable(),
  paymentProofUrl: z.string().max(4_000_000).optional().nullable(),
  proofDeliveryMethod: z.enum(['web_upload', 'instagram_dm', 'none']).optional(),
  couponCode: z.string().max(40).optional().nullable(),
  sessionToken: z.string().optional().nullable(),
  holdId: z.string().min(1).optional().nullable(),
  privacyConsentAccepted: z.boolean(),
  marketingOptIn: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = createBookingSchema.parse(await request.json());
    if (!parsed.privacyConsentAccepted) {
      return NextResponse.json(
        {
          code: 'PRIVACY_CONSENT_REQUIRED',
          error: 'Debes aceptar el aviso de privacidad para completar tu reserva.',
        },
        { status: 400 },
      );
    }

    const idempotencyKey = request.headers.get('Idempotency-Key');
    const cookieSessionToken = await readClientSessionToken(request);
    const effectiveSessionToken = cookieSessionToken ?? parsed.sessionToken ?? null;

    const inspoPhotoUrl = await persistBookingMediaField(parsed.inspoPhotoUrl, 'inspo');
    const paymentProofUrl = await persistBookingMediaField(
      parsed.paymentProofUrl,
      'proofs',
    );
    const proofDeliveryMethod =
      parsed.proofDeliveryMethod ?? (paymentProofUrl ? 'web_upload' : 'none');

    const booking = await createBookingWithExtras({
      ...parsed,
      inspoPhotoUrl,
      paymentProofUrl,
      proofDeliveryMethod,
      clientEmail: parsed.clientEmail || null,
      sessionToken: effectiveSessionToken,
      holdId: parsed.holdId ?? null,
      idempotencyKey,
      source: 'web',
      forceConfirmed: false,
      privacyConsentAccepted: true,
      marketingOptIn: parsed.marketingOptIn,
      enforceMaxActiveBookings: true,
    });

    const manageUrl = `/cita/${booking.manageToken}`;
    const repo = getRepository();
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
      const status = err.code === 'MAX_ACTIVE_BOOKINGS' ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      const missingConsent = err.issues.some((i) =>
        i.path.includes('privacyConsentAccepted'),
      );
      if (missingConsent) {
        return NextResponse.json(
          {
            code: 'PRIVACY_CONSENT_REQUIRED',
            error: 'Debes aceptar el aviso de privacidad para completar tu reserva.',
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo completar la cita' }, { status: 500 });
  }
}
