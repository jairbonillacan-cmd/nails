import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createOrRefreshSlotHold,
  PolicyError,
  releaseSlotHold,
  SlotConflictError,
} from '@/lib/repositories/db';

const holdSchema = z.object({
  serviceId: z.string().min(1),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().min(1),
  startAt: z.string().min(1),
  sessionToken: z.string().min(4),
});

export async function POST(request: NextRequest) {
  try {
    const body = holdSchema.parse(await request.json());
    const hold = await createOrRefreshSlotHold(body);
    return NextResponse.json({ hold });
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
  const sessionToken = searchParams.get('sessionToken');
  if (sessionToken) {
    await releaseSlotHold(sessionToken);
  }
  return NextResponse.json({ ok: true });
}
