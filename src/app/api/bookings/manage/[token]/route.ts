import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ManageBookingPatchSchema, SubmitReviewSchema } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { buildCalendarAddLinks } from '@/lib/ics';
import { buildBookingWhatsAppFallbackUrl } from '@/lib/integrations/notifications';
import { toPublicBookingDTO, toPublicSettingsDTO } from '@/lib/public-dto';
import {
  getClientLoyaltySummaryAsync,
  getRepository,
  manageClientBookingAction,
  PolicyError,
  SlotConflictError,
  submitBookingReview,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      code: 'RATE_LIMITED',
      error: 'Demasiadas solicitudes en poco tiempo. Espera unos segundos e intenta de nuevo.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const rate = checkRateLimit({
    bucket: 'public:manage-read',
    key: getRequestIp(request),
    limit: 90,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return rateLimitedResponse(rate.retryAfterSeconds);
  }

  const { token } = await context.params;
  const repo = getRepository();
  const booking = await repo.getBookingByToken(token);
  if (!booking) {
    return NextResponse.json(
      { error: 'Cita no encontrada' },
      { status: 404, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
  const db = await repo.getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;
  const loyaltySummary = await getClientLoyaltySummaryAsync(booking.clientId);

  return NextResponse.json(
    {
      booking: toPublicBookingDTO(booking, db.services),
      settings: toPublicSettingsDTO(db.settings),
      calendarLinks: buildCalendarAddLinks(booking, db.settings, manageUrl),
      whatsappUrl: buildBookingWhatsAppFallbackUrl(booking, db.settings, env.appUrl),
      manageUrl,
      loyaltySummary,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    },
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const rate = checkRateLimit({
    bucket: 'public:manage-write',
    key: getRequestIp(request),
    limit: 40,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return rateLimitedResponse(rate.retryAfterSeconds);
  }

  try {
    const { token } = await context.params;
    const body = ManageBookingPatchSchema.parse(await request.json());
    const booking = await manageClientBookingAction({ token, ...body });
    const db = await getRepository().getSnapshot();
    const env = getRuntimeIntegrationStatus();
    const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;
    return NextResponse.json(
      {
        booking: toPublicBookingDTO(booking, db.services),
        calendarLinks: buildCalendarAddLinks(booking, db.settings, manageUrl),
        whatsappUrl: buildBookingWhatsAppFallbackUrl(booking, db.settings, env.appUrl),
        manageUrl,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      },
    );
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        { code: err.code, error: err.message, suggestedSlots: err.suggestedSlots },
        { status: 409, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { code: err.code, error: err.message },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos para actualizar la cita' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo actualizar la cita' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const rate = checkRateLimit({
    bucket: 'public:manage-review',
    key: getRequestIp(request),
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return rateLimitedResponse(rate.retryAfterSeconds);
  }

  try {
    const { token } = await context.params;
    const body = SubmitReviewSchema.parse(await request.json());
    const review = await submitBookingReview({
      manageToken: token,
      ...body,
    });
    return NextResponse.json(
      { review },
      { headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos de tu reseña' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo guardar tu reseña' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}
