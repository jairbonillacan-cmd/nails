import { NextRequest, NextResponse } from 'next/server';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import { ClientPortalSnapshotDTOSchema } from '@/lib/public-dto';
import { getClientPortalSnapshotByPhoneAsync } from '@/lib/repositories/db';

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
        headers: { 'Cache-Control': 'private, no-store' },
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
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
