import { NextRequest, NextResponse } from 'next/server';
import {
  constantTimeEqual,
  consumeGoogleOAuthNonce,
  getGoogleOAuthCookieOptions,
  GOOGLE_OAUTH_STATE_COOKIE,
  readRequestCookie,
  requireAdmin,
  verifyGoogleOAuthState,
} from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getSnapshot, updateCalendarConnection } from '@/lib/repositories/db';

function clearOAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, '', {
    ...getGoogleOAuthCookieOptions(),
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim();
  const stateParam = searchParams.get('state')?.trim();

  if (!code || !stateParam) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'Faltan parámetros OAuth requeridos (code o state).' },
        { status: 400 },
      ),
    );
  }

  const nonceCookie = readRequestCookie(request, GOOGLE_OAUTH_STATE_COOKIE);
  if (!nonceCookie) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'Cookie CSRF de OAuth ausente o expirada.' },
        { status: 403 },
      ),
    );
  }

  const statePayload = verifyGoogleOAuthState(stateParam);
  if (!statePayload) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'Estado OAuth inválido o expirado.' },
        { status: 403 },
      ),
    );
  }

  if (!constantTimeEqual(nonceCookie, statePayload.nonce)) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'Estado OAuth no coincide con la sesión CSRF.' },
        { status: 403 },
      ),
    );
  }

  if (statePayload.adminId !== session.user.id) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'El estado OAuth pertenece a otro administrador.' },
        { status: 403 },
      ),
    );
  }

  if (
    session.user.role === 'specialist' &&
    (!session.user.staffMemberId || statePayload.staffId !== session.user.staffMemberId)
  ) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'No tienes permiso para conectar el calendario de otra especialista.' },
        { status: 403 },
      ),
    );
  }

  const staffExists = getSnapshot().staff.some((s) => s.id === statePayload.staffId);
  if (!staffExists) {
    return clearOAuthCookie(
      NextResponse.json({ error: 'Especialista no encontrada.' }, { status: 400 }),
    );
  }

  if (!consumeGoogleOAuthNonce(statePayload.nonce, statePayload.exp)) {
    return clearOAuthCookie(
      NextResponse.json(
        { error: 'Estado OAuth ya utilizado.' },
        { status: 403 },
      ),
    );
  }

  await updateCalendarConnection(statePayload.staffId, {
    isConnected: true,
    lastSyncedAt: new Date().toISOString(),
  });

  const { appUrl } = getRuntimeIntegrationStatus();
  return clearOAuthCookie(
    NextResponse.redirect(`${appUrl}/admin/integraciones?google=connected`),
  );
}
