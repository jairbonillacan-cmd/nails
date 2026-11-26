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
import {
  encryptOAuthToken,
  exchangeGoogleOAuthCode,
  fetchGoogleFreeBusy,
  registerGoogleCalendarWatch,
} from '@/lib/integrations/google-calendar';
import { getRepository, updateCalendarConnection } from '@/lib/repositories/db';
import type { CalendarConnection } from '@/lib/types';

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

  const snapshot = await getRepository().getSnapshot();
  const staffExists = snapshot.staff.some((s) => s.id === statePayload.staffId);
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

  const env = getRuntimeIntegrationStatus();
  const nowIso = new Date().toISOString();
  const basePatch: Partial<CalendarConnection> = {
    isConnected: true,
    lastSyncedAt: nowIso,
  };

  if (env.googleCalendarConfigured) {
    try {
      const exchanged = await exchangeGoogleOAuthCode({ code });
      const encryptedPatch: Partial<CalendarConnection> = {
        ...basePatch,
        accessTokenEncrypted: encryptOAuthToken(exchanged.accessToken),
        refreshTokenEncrypted: exchanged.refreshToken
          ? encryptOAuthToken(exchanged.refreshToken)
          : null,
        tokenExpiresAt: exchanged.expiresAtIso,
        ...(exchanged.accountEmail ? { accountEmail: exchanged.accountEmail } : {}),
      };
      const savedConn = await updateCalendarConnection(
        statePayload.staffId,
        encryptedPatch,
      );

      const postConnectPatch: Partial<CalendarConnection> = {};
      try {
        const freeBusy = await fetchGoogleFreeBusy({ connection: savedConn });
        if (freeBusy.synced) {
          postConnectPatch.externalBusyBlocks = freeBusy.busyBlocks;
        }
      } catch {
        postConnectPatch.lastSyncedAt = nowIso;
      }

      const webhookToken = process.env.GOOGLE_WEBHOOK_TOKEN?.trim();
      if (webhookToken) {
        try {
          const watch = await registerGoogleCalendarWatch({
            connection: savedConn,
            webhookUrl: `${env.appUrl}/api/webhooks/google-calendar`,
            webhookToken,
          });
          if (watch) {
            postConnectPatch.watchChannelId = watch.watchChannelId;
            postConnectPatch.watchResourceId = watch.watchResourceId;
            postConnectPatch.watchExpiration = watch.watchExpiration;
          }
        } catch {
          postConnectPatch.lastSyncedAt = nowIso;
        }
      }

      if (Object.keys(postConnectPatch).length > 0) {
        await updateCalendarConnection(statePayload.staffId, postConnectPatch);
      }

      return clearOAuthCookie(
        NextResponse.redirect(`${env.appUrl}/admin/integraciones?google=connected`),
      );
    } catch {
      if (process.env.NODE_ENV === 'production') {
        return clearOAuthCookie(
          NextResponse.json(
            { error: 'No se pudo completar el intercambio OAuth con Google.' },
            { status: 502 },
          ),
        );
      }
    }
  }

  await updateCalendarConnection(statePayload.staffId, basePatch);

  return clearOAuthCookie(
    NextResponse.redirect(`${env.appUrl}/admin/integraciones?google=connected`),
  );
}
