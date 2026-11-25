import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getOrCreateClientSession,
  readClientSessionToken,
} from '@/lib/auth/client-session';
import {
  createOrRefreshSlotHoldWithExtras,
  getRepository,
  PolicyError,
  SlotConflictError,
} from '@/lib/repositories/db';

const holdSchema = z.object({
  serviceId: z.string().min(1),
  extraServiceIds: z.array(z.string().min(1)).max(8).default([]),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().min(1),
  startAt: z.string().min(1),
  sessionToken: z.string().min(4).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = holdSchema.parse(await request.json());
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
    const response = NextResponse.json({ hold: publicHold, holdId: hold.holdId });
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
        { status: 409 },
      );
    }
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Datos inválidos para apartar horario' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo apartar el horario' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cookieToken = await readClientSessionToken(request);
  const sessionToken = cookieToken ?? searchParams.get('sessionToken');
  if (sessionToken) {
    await getRepository().releaseSlotHold(sessionToken);
  }
  return NextResponse.json({ ok: true });
}
