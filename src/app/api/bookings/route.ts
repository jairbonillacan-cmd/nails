import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readClientSessionToken } from '@/lib/auth/client-session';
import { evaluateClientNoShowPolicy } from '@/lib/booking/no-show-policy';
import { PublicCreateBookingSchema } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { createDepositCheckout } from '@/lib/integrations/payments';
import { logError } from '@/lib/logger';
import { toPublicBookingDTO } from '@/lib/public-dto';
import {
  createBookingWithExtras,
  getRepository,
  MaxActiveBookingsError,
  persistBookingMediaField,
  PolicyError,
  SlotConflictError,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';
import { MediaValidationError } from '@/lib/storage/media';

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:bookings',
    key: getRequestIp(request),
    limit: 40,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiadas solicitudes de reserva en poco tiempo. Espera unos segundos e intenta de nuevo.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  try {
    const parsed = PublicCreateBookingSchema.parse(await request.json());
    if (!parsed.privacyConsentAccepted) {
      return NextResponse.json(
        {
          code: 'PRIVACY_CONSENT_REQUIRED',
          error: 'Debes aceptar el aviso de privacidad para completar tu reserva.',
        },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
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
      parsed.proofDeliveryMethod ??
      (paymentProofUrl
        ? paymentProofUrl.startsWith('https://')
          ? 'web_link'
          : 'web_upload'
        : 'none');

    const booking = await createBookingWithExtras({
      ...parsed,
      inspoPhotoUrl,
      paymentProofUrl,
      proofDeliveryMethod,
      clientEmail: parsed.clientEmail || null,
      sessionToken: effectiveSessionToken,
      holdId: parsed.holdId ?? null,
      waitlistOfferToken: parsed.waitlistOfferToken ?? null,
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

    const snapshot = await repo.getSnapshot();
    const snapshotSettings = snapshot.settings;
    const noShowPolicy = evaluateClientNoShowPolicy({
      noShowCount: booking.client.noShowCount,
      threshold: snapshotSettings.noShowDepositThreshold,
      baseDepositAmountCents:
        booking.depositAmountCents || (snapshotSettings.depositAmountCents ?? 20_000),
    });

    return NextResponse.json(
      {
        booking: toPublicBookingDTO(booking, snapshot.services),
        manageUrl,
        checkout,
        noShowPolicy,
      },
      {
        status: 201,
        headers: { 'X-RateLimit-Remaining': String(rate.remaining) },
      },
    );
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        {
          code: err.code,
          error: err.message,
          suggestedSlots: err.suggestedSlots,
        },
        { status: 409, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof MediaValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof MaxActiveBookingsError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          activeBookings: err.activeBookings,
        },
        { status: 409, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof PolicyError) {
      const status = err.code === 'MAX_ACTIVE_BOOKINGS' ? 409 : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
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
          { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
        );
      }
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    logError('public_booking_create_failed', { error: err });
    return NextResponse.json(
      { error: 'No se pudo completar la cita' },
      { status: 500, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}
