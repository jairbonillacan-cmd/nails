import { NextRequest, NextResponse } from 'next/server';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import { ClientPortalSnapshotDTOSchema } from '@/lib/public-dto';
import { getClientPortalSnapshotByPhoneAsync } from '@/lib/repositories/db';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: NextRequest) {
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
