import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CreateWaitlistSchema } from '@/lib/contracts';
import { addWaitlistEntry, PolicyError } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:waitlist',
    key: getRequestIp(request),
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiados registros en lista de espera en poco tiempo. Espera unos segundos e intenta de nuevo.',
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
    const body = CreateWaitlistSchema.parse(await request.json());
    const entry = await addWaitlistEntry({
      ...body,
      preferredStaffId: body.preferredStaffId ?? null,
      clientEmail: body.clientEmail || null,
    });
    return NextResponse.json(
      { entry },
      { status: 201, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados.' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo registrar en lista de espera' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}
