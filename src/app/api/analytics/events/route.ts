import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RecordFunnelEventSchema } from '@/lib/contracts';
import { recordFunnelEvent } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:analytics-events',
    key: getRequestIp(request),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiados eventos en poco tiempo.' },
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
    const parsed = RecordFunnelEventSchema.parse(await request.json());
    await recordFunnelEvent({
      sessionId: parsed.sessionId,
      eventType: parsed.eventType,
      serviceSlug: parsed.serviceSlug ?? null,
      staffSlug: parsed.staffSlug ?? null,
    });
    return NextResponse.json(
      { ok: true },
      {
        status: 202,
        headers: { 'X-RateLimit-Remaining': String(rate.remaining) },
      },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Evento inválido.' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo registrar el evento.' },
      { status: 500, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}
