import { NextRequest, NextResponse } from 'next/server';
import { getBookingByToken, getSnapshot } from '@/lib/repositories/db';
import { generateBookingIcs } from '@/lib/ics';
import { getRuntimeIntegrationStatus } from '@/lib/env';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const booking = getBookingByToken(token);
  if (!booking) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }
  const db = getSnapshot();
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
