import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/repositories/db';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request?: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:bootstrap',
    key: request ? getRequestIp(request) : 'local',
    limit: 120,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiadas solicitudes. Intenta en unos segundos.' },
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

  const bootstrap = await getRepository().getPublicBootstrap();
  const integration = getRuntimeIntegrationStatus();

  return NextResponse.json(
    {
      ...bootstrap,
      integrationMode: integration.mode,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'X-RateLimit-Remaining': String(rate.remaining),
      },
    },
  );
}
