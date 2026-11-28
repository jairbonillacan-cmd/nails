import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RecordFunnelEventSchema } from '@/lib/contracts';
import { logError } from '@/lib/logger';
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
          'Cache-Control': 'no-store',
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const baseHeaders = {
    'Cache-Control': 'no-store',
    'X-RateLimit-Remaining': String(rate.remaining),
  };

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: baseHeaders },
    );
  }

  try {
    const parsed = RecordFunnelEventSchema.parse(rawBody);
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
        headers: baseHeaders,
      },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Evento inválido.' },
        { status: 400, headers: baseHeaders },
      );
    }
    logError('analytics_funnel_event_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo registrar el evento.' },
      { status: 500, headers: baseHeaders },
    );
  }
}
