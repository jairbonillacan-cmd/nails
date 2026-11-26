import { NextRequest, NextResponse } from 'next/server';
import { getRepository } from '@/lib/repositories/db';
import { generateBookingIcs } from '@/lib/ics';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

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
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  const { token } = await context.params;
  const repo = getRepository();
  const booking = await repo.getBookingByToken(token);
  if (!booking) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }
  const db = await repo.getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const ics = generateBookingIcs(
    booking,
    db.settings,
    `${env.appUrl}/cita/${booking.manageToken}`,
  );

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="cita-${booking.bookingCode}.ics"`,
    },
  });
}
