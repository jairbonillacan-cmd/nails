import { NextRequest, NextResponse } from 'next/server';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import { ClientPortalSnapshotDTOSchema } from '@/lib/public-dto';
import { getClientPortalSnapshotByPhoneAsync } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:client-portal-bookings',
    key: getRequestIp(request),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        authenticated: false,
        code: 'RATE_LIMITED',
        error: 'Demasiadas consultas en poco tiempo. Espera unos segundos.',
      },
      {
        status: 429,
        headers: {
          ...PRIVATE_HEADERS,
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  const session = await readClientPortalSession(request);
  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        error: 'Verifica tu WhatsApp para consultar tus citas.',
      },
      {
        status: 401,
        headers: PRIVATE_HEADERS,
      },
    );
  }

  const rawSnapshot = await getClientPortalSnapshotByPhoneAsync(session.phoneE164);
  const safeSnapshot = ClientPortalSnapshotDTOSchema.parse(rawSnapshot);

  return NextResponse.json(
    {
      authenticated: true,
      ...safeSnapshot,
    },
    {
      status: 200,
      headers: PRIVATE_HEADERS,
    },
  );
}
