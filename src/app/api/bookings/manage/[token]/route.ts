import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ManageBookingPatchSchema, SubmitReviewSchema } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { buildCalendarAddLinks } from '@/lib/ics';
import { buildBookingWhatsAppFallbackUrl } from '@/lib/integrations/notifications';
import { logError } from '@/lib/logger';
import { toPublicBookingDTO, toPublicSettingsDTO } from '@/lib/public-dto';
import {
  getClientLoyaltySummaryAsync,
  getRepository,
  getServicesByIdsAsync,
  manageClientBookingAction,
  PolicyError,
  SlotConflictError,
  submitBookingReview,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = 'private, no-store';

function isPlausibleManageToken(token: string): boolean {
  return token.length >= 8 && token.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(token);
}

function privateRateHeaders(remaining: number): Record<string, string> {
  return {
    'Cache-Control': PRIVATE_NO_STORE,
    'X-RateLimit-Remaining': String(remaining),
  };
}

function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      code: 'RATE_LIMITED',
      error: 'Demasiadas solicitudes en poco tiempo. Espera unos segundos e intenta de nuevo.',
    },
    {
      status: 429,
      headers: {
        'Cache-Control': PRIVATE_NO_STORE,
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

  const headers = privateRateHeaders(rate.remaining);
  const { token } = await context.params;
  if (!isPlausibleManageToken(token)) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404, headers });
  }
  const repo = getRepository();
  const booking = await repo.getBookingByToken(token);
  if (!booking) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404, headers });
  }
  const extraIds = (booking.extraServiceIds ?? []).filter((id) => id !== booking.serviceId);
  const [settings, extraServices, loyaltySummary] = await Promise.all([
    repo.getSalonSettings(),
    getServicesByIdsAsync(extraIds),
    getClientLoyaltySummaryAsync(booking.clientId),
  ]);
  const env = getRuntimeIntegrationStatus();
  const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;

  return NextResponse.json(
    {
      booking: toPublicBookingDTO(booking, [booking.service, ...extraServices]),
      settings: toPublicSettingsDTO(settings),
      calendarLinks: buildCalendarAddLinks(booking, settings, manageUrl),
      whatsappUrl: buildBookingWhatsAppFallbackUrl(booking, settings, env.appUrl),
      manageUrl,
      loyaltySummary,
    },
    { headers },
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

  const headers = privateRateHeaders(rate.remaining);
  try {
    const { token } = await context.params;
    if (!isPlausibleManageToken(token)) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404, headers });
    }
    const body = ManageBookingPatchSchema.parse(await request.json());
    const booking = await manageClientBookingAction({ token, ...body });
    const repo = getRepository();
    const extraIds = (booking.extraServiceIds ?? []).filter(
      (id) => id !== booking.serviceId,
    );
    const [settings, extraServices] = await Promise.all([
      repo.getSalonSettings(),
      getServicesByIdsAsync(extraIds),
    ]);
    const env = getRuntimeIntegrationStatus();
    const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;
    return NextResponse.json(
      {
        booking: toPublicBookingDTO(booking, [booking.service, ...extraServices]),
        calendarLinks: buildCalendarAddLinks(booking, settings, manageUrl),
        whatsappUrl: buildBookingWhatsAppFallbackUrl(booking, settings, env.appUrl),
        manageUrl,
      },
      { headers },
    );
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        { code: err.code, error: err.message, suggestedSlots: err.suggestedSlots },
        { status: 409, headers },
      );
    }
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { code: err.code, error: err.message },
        { status: 400, headers },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos para actualizar la cita' },
        { status: 400, headers },
      );
    }
    logError('manage_booking_patch_failed', { error: err });
    return NextResponse.json(
      { error: 'No se pudo actualizar la cita' },
      { status: 500, headers },
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

  const headers = privateRateHeaders(rate.remaining);
  try {
    const { token } = await context.params;
    if (!isPlausibleManageToken(token)) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404, headers });
    }
    const body = SubmitReviewSchema.parse(await request.json());
    const review = await submitBookingReview({
      manageToken: token,
      ...body,
    });
    return NextResponse.json({ review }, { headers });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message }, { status: 400, headers });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos de tu reseña' },
        { status: 400, headers },
      );
    }
    logError('manage_booking_review_failed', { error: err });
    return NextResponse.json(
      { error: 'No se pudo guardar tu reseña' },
      { status: 500, headers },
    );
  }
}
