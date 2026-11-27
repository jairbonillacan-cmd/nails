import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOrCreateClientSession,
  readClientSessionToken,
} from '@/lib/auth/client-session';
import { CreateSlotHoldSchema } from '@/lib/contracts';
import { logError } from '@/lib/logger';
import {
  createOrRefreshSlotHoldWithExtras,
  getRepository,
  PolicyError,
  SlotConflictError,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:slot-holds',
    key: getRequestIp(request),
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiados apartados de horario en poco tiempo. Espera unos segundos e intenta de nuevo.',
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
    const body = CreateSlotHoldSchema.parse(await request.json());
    const clientSession = await getOrCreateClientSession(request);
    const hold = await createOrRefreshSlotHoldWithExtras({
      serviceId: body.serviceId,
      extraServiceIds: body.extraServiceIds,
      addonIds: body.addonIds,
      staffId: body.staffId,
      startAt: body.startAt,
      sessionToken: clientSession.token,
    });
    const publicHold = {
      id: hold.id,
      holdId: hold.holdId,
      staffId: hold.staffId,
      serviceId: hold.serviceId,
      startAt: hold.startAt,
      endAt: hold.endAt,
      expiresAt: hold.expiresAt,
      createdAt: hold.createdAt,
    };
    const response = NextResponse.json(
      { hold: publicHold, holdId: hold.holdId },
      { headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
    if (clientSession.setCookieHeader) {
      response.headers.append('Set-Cookie', clientSession.setCookieHeader);
    }
    return response;
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
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos para apartar horario' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    logError('slot_hold_create_failed', { error: err });
    return NextResponse.json(
      { error: 'No se pudo apartar el horario' },
      { status: 500, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const sessionToken = await readClientSessionToken(request);
  if (sessionToken) {
    await getRepository().releaseSlotHold(sessionToken);
  }
  return NextResponse.json({ ok: true });
}
