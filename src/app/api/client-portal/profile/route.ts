import { NextRequest, NextResponse } from 'next/server';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import { selectClientPortalProfile } from '@/lib/client-account';
import { ClientPortalProfileResponseSchema } from '@/lib/contracts';
import { getRepository } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const PROFILE_RATE_LIMIT = 60;
const PROFILE_RATE_WINDOW_MS = 60_000;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'client-portal-profile',
    key: getRequestIp(request),
    limit: PROFILE_RATE_LIMIT,
    windowMs: PROFILE_RATE_WINDOW_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiados intentos. Espera un momento.' },
      {
        status: 429,
        headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  const session = await readClientPortalSession(request);
  if (!session) {
    return NextResponse.json(
      ClientPortalProfileResponseSchema.parse({ authenticated: false }),
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  const db = await getRepository().getSnapshot();
  const body = ClientPortalProfileResponseSchema.parse({
    authenticated: true,
    authMethod: 'whatsapp_otp',
    profile: selectClientPortalProfile(db.clients, session.phoneE164),
  });

  return NextResponse.json(body, { status: 200, headers: PRIVATE_HEADERS });
}
