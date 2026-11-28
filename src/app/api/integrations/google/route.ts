import { NextRequest, NextResponse } from 'next/server';
import {
  createGoogleOAuthState,
  getGoogleOAuthCookieOptions,
  GOOGLE_OAUTH_STATE_COOKIE,
  requireAdmin,
} from '@/lib/auth/admin-session';
import { buildGoogleOAuthUrl } from '@/lib/integrations/google-calendar';
import { getRepository } from '@/lib/repositories/db';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedStaffId = searchParams.get('staffId')?.trim() || '';

  let staffId: string;
  if (session.user.role === 'specialist') {
    if (!session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Tu usuario no tiene profesional vinculada.' },
        { status: 403, headers: PRIVATE_HEADERS },
      );
    }
    if (requestedStaffId && requestedStaffId !== session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'No puedes conectar el calendario de otra profesional.' },
        { status: 403, headers: PRIVATE_HEADERS },
      );
    }
    staffId = session.user.staffMemberId;
  } else {
    staffId = requestedStaffId || session.user.staffMemberId || '';
  }

  if (!staffId) {
    return NextResponse.json(
      { error: 'Falta especificar staffId.' },
      { status: 400, headers: PRIVATE_HEADERS },
    );
  }

  const staffExists = await getRepository().staffMemberExists(staffId);
  if (!staffExists) {
    return NextResponse.json(
      { error: 'Profesional no encontrada.' },
      { status: 404, headers: PRIVATE_HEADERS },
    );
  }

  const signedState = createGoogleOAuthState({
    staffId,
    adminId: session.user.id,
  });
  if (!signedState) {
    return NextResponse.json(
      { error: 'Secreto de firma OAuth no configurado.' },
      { status: 503, headers: PRIVATE_HEADERS },
    );
  }

  const oauthUrl = buildGoogleOAuthUrl(signedState.state);
  const response = NextResponse.json(
    {
      configured: Boolean(oauthUrl),
      oauthUrl,
    },
    { headers: PRIVATE_HEADERS },
  );

  if (oauthUrl) {
    response.cookies.set(
      GOOGLE_OAUTH_STATE_COOKIE,
      signedState.nonce,
      getGoogleOAuthCookieOptions(),
    );
  }

  return response;
}
