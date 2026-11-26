import { NextRequest, NextResponse } from 'next/server';
import {
  createGoogleOAuthState,
  getGoogleOAuthCookieOptions,
  GOOGLE_OAUTH_STATE_COOKIE,
  requireAdmin,
} from '@/lib/auth/admin-session';
import { buildGoogleOAuthUrl } from '@/lib/integrations/google-calendar';
import { getRepository } from '@/lib/repositories/db';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedStaffId = searchParams.get('staffId')?.trim() || '';

  let staffId: string;
  if (session.user.role === 'specialist') {
    if (!session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Tu usuario no tiene profesional vinculada.' },
        { status: 403 },
      );
    }
    if (requestedStaffId && requestedStaffId !== session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'No puedes conectar el calendario de otra profesional.' },
        { status: 403 },
      );
    }
    staffId = session.user.staffMemberId;
  } else {
    staffId = requestedStaffId || session.user.staffMemberId || '';
  }

  if (!staffId) {
    return NextResponse.json({ error: 'Falta especificar staffId.' }, { status: 400 });
  }

  const snapshot = await getRepository().getSnapshot();
  const staffExists = snapshot.staff.some((s) => s.id === staffId);
  if (!staffExists) {
    return NextResponse.json({ error: 'Profesional no encontrada.' }, { status: 404 });
  }

  const signedState = createGoogleOAuthState({
    staffId,
    adminId: session.user.id,
  });
  if (!signedState) {
    return NextResponse.json(
      { error: 'Secreto de firma OAuth no configurado.' },
      { status: 503 },
    );
  }

  const oauthUrl = buildGoogleOAuthUrl(signedState.state);
  const response = NextResponse.json({
    configured: Boolean(oauthUrl),
    oauthUrl,
  });

  if (oauthUrl) {
    response.cookies.set(
      GOOGLE_OAUTH_STATE_COOKIE,
      signedState.nonce,
      getGoogleOAuthCookieOptions(),
    );
  }

  return response;
}
