import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/repositories/db';
import { generateBookingIcs } from '@/lib/ics';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const PRIVATE_NO_STORE = 'private, no-store';

function isPlausibleManageToken(token: string): boolean {
  return token.length >= 8 && token.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(token);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const rate = checkRateLimit({
    bucket: 'public:manage-ics',
    key: getRequestIp(request),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiadas descargas en poco tiempo.' },
      {
        status: 429,
        headers: {
          'Cache-Control': PRIVATE_NO_STORE,
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  const { token } = await context.params;
  if (!isPlausibleManageToken(token)) {
    return NextResponse.json(
      { error: 'Cita no encontrada' },
      {
        status: 404,
        headers: {
          'Cache-Control': PRIVATE_NO_STORE,
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      },
    );
  }
  const repo = getRepository();
  const booking = await repo.getBookingByToken(token);
  if (!booking) {
    return NextResponse.json(
      { error: 'Cita no encontrada' },
      {
        status: 404,
        headers: {
          'Cache-Control': PRIVATE_NO_STORE,
          'X-RateLimit-Remaining': String(rate.remaining),
        },
      },
    );
  }
  const settings = await repo.getSalonSettings();
  const env = getRuntimeIntegrationStatus();
  const ics = generateBookingIcs(
    booking,
    settings,
    `${env.appUrl}/cita/${booking.manageToken}`,
  );

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Cache-Control': PRIVATE_NO_STORE,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="cita-${booking.bookingCode}.ics"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
