import crypto from 'node:crypto';
import { getRuntimeIntegrationStatus } from '../env';
import type { BookingWithRelations, CalendarConnection, SalonSettings } from '../types';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

declare global {
  var nailsGoogleEphemeralEncKey: Buffer | undefined;
}

function getTokenEncryptionKey(): Buffer {
  const configured =
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) {
    return crypto.createHash('sha256').update(configured, 'utf8').digest();
  }
  const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  if (process.env.NODE_ENV === 'production' || hasSupabase) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY o ADMIN_SESSION_SECRET es obligatorio para cifrar tokens OAuth.',
    );
  }
  if (!globalThis.nailsGoogleEphemeralEncKey) {
    globalThis.nailsGoogleEphemeralEncKey = crypto.randomBytes(32);
  }
  return globalThis.nailsGoogleEphemeralEncKey;
}

export function encryptOAuthToken(plaintext: string): string {
  const key = getTokenEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptOAuthToken(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Formato de token cifrado inválido.');
  }
  const iv = Buffer.from(parts[1] ?? '', 'base64url');
  const authTag = Buffer.from(parts[2] ?? '', 'base64url');
  const ciphertext = Buffer.from(parts[3] ?? '', 'base64url');
  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error('Parámetros AES-GCM inválidos.');
  }
  const key = getTokenEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function buildGoogleOAuthUrl(staffId: string): string | null {
  const env = getRuntimeIntegrationStatus();
  if (!env.googleCalendarConfigured) return null;

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return null;

  const redirectUri = `${env.appUrl}/api/integrations/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state: staffId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(params: {
  code: string;
  redirectUri?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAtIso: string;
  accountEmail: string | null;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET no están configurados.');
  }

  const env = getRuntimeIntegrationStatus();
  const redirectUri = params.redirectUri ?? `${env.appUrl}/api/integrations/google/callback`;
  const fetcher = params.fetchImpl ?? globalThis.fetch;

  const tokenRes = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(8_000),
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenRes.ok) {
    throw new Error(`Google OAuth token exchange falló (${tokenRes.status}).`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokenJson.access_token) {
    throw new Error('Google OAuth no devolvió access_token.');
  }

  const expiresInSec =
    typeof tokenJson.expires_in === 'number' && tokenJson.expires_in > 0
      ? tokenJson.expires_in
      : 3600;
  const expiresAtIso = new Date(Date.now() + expiresInSec * 1000).toISOString();

  let accountEmail: string | null = null;
  try {
    const profileRes = await fetcher(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );
    if (profileRes.ok) {
      const profileJson = (await profileRes.json()) as { email?: string };
      if (typeof profileJson.email === 'string' && profileJson.email.trim()) {
        accountEmail = profileJson.email.trim();
      }
    }
  } catch {
    accountEmail = null;
  }

  return {
    accessToken: tokenJson.access_token,
    refreshToken: tokenJson.refresh_token ?? null,
    expiresAtIso,
    accountEmail,
  };
}

async function refreshGoogleAccessToken(params: {
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; expiresAtIso: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET no están configurados.');
  }

  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const res = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Google OAuth refresh falló (${res.status}).`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('Google OAuth refresh no devolvió access_token.');
  }

  const expiresInSec =
    typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 3600;
  return {
    accessToken: json.access_token,
    expiresAtIso: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
}

async function resolveConnectionAccessToken(
  connection: CalendarConnection,
  fetchImpl: typeof fetch,
): Promise<{
  accessToken: string;
  refreshedAccessTokenEncrypted?: string;
  refreshedTokenExpiresAt?: string;
} | null> {
  if (!connection.accessTokenEncrypted) return null;

  const expiresMs = connection.tokenExpiresAt
    ? new Date(connection.tokenExpiresAt).getTime()
    : Number.POSITIVE_INFINITY;
  const needsRefresh =
    !Number.isNaN(expiresMs) && expiresMs <= Date.now() + 60_000;

  if (needsRefresh && connection.refreshTokenEncrypted) {
    const refreshPlain = decryptOAuthToken(connection.refreshTokenEncrypted);
    const refreshed = await refreshGoogleAccessToken({
      refreshToken: refreshPlain,
      fetchImpl,
    });
    return {
      accessToken: refreshed.accessToken,
      refreshedAccessTokenEncrypted: encryptOAuthToken(refreshed.accessToken),
      refreshedTokenExpiresAt: refreshed.expiresAtIso,
    };
  }

  return {
    accessToken: decryptOAuthToken(connection.accessTokenEncrypted),
  };
}

export async function syncBookingToGoogleCalendar(params: {
  booking: BookingWithRelations;
  connection: CalendarConnection | undefined;
  settings: SalonSettings;
  action: 'create' | 'update' | 'delete';
  fetchImpl?: typeof fetch;
}): Promise<{
  googleEventId: string | null;
  synced: boolean;
  refreshedAccessTokenEncrypted?: string;
  refreshedTokenExpiresAt?: string;
}> {
  if (!params.connection?.isConnected) {
    return { googleEventId: params.booking.googleEventId, synced: false };
  }

  const env = getRuntimeIntegrationStatus();
  if (!env.googleCalendarConfigured || !params.connection.accessTokenEncrypted) {
    if (params.action === 'delete') {
      return { googleEventId: null, synced: true };
    }
    return {
      googleEventId:
        params.booking.googleEventId ?? `gcal-evt-demo-${params.booking.bookingCode}`,
      synced: true,
    };
  }

  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const resolved = await resolveConnectionAccessToken(params.connection, fetcher);
  if (!resolved) {
    return { googleEventId: params.booking.googleEventId, synced: false };
  }

  const calendarId = encodeURIComponent(
    params.connection.destinationCalendarId || 'primary',
  );
  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  const headers = {
    Authorization: `Bearer ${resolved.accessToken}`,
    'Content-Type': 'application/json',
  };

  if (params.action === 'delete') {
    if (params.booking.googleEventId) {
      await fetcher(
        `${baseUrl}/${encodeURIComponent(params.booking.googleEventId)}`,
        {
          method: 'DELETE',
          headers,
        },
      );
    }
    return {
      googleEventId: null,
      synced: true,
      refreshedAccessTokenEncrypted: resolved.refreshedAccessTokenEncrypted,
      refreshedTokenExpiresAt: resolved.refreshedTokenExpiresAt,
    };
  }

  const eventBody = {
    summary: `${params.booking.service.name} — ${params.booking.client.fullName} (${params.booking.bookingCode})`,
    description: `Especialista: ${params.booking.staff.name}\nTeléfono: ${params.booking.client.phoneE164}\nCódigo: ${params.booking.bookingCode}`,
    location: params.settings.address,
    start: {
      dateTime: params.booking.startAt,
      timeZone: params.settings.timezone,
    },
    end: {
      dateTime: params.booking.endAt,
      timeZone: params.settings.timezone,
    },
  };

  const isUpdate = params.action === 'update' && Boolean(params.booking.googleEventId);
  const targetUrl = isUpdate
    ? `${baseUrl}/${encodeURIComponent(params.booking.googleEventId ?? '')}`
    : baseUrl;

  const res = await fetcher(targetUrl, {
    method: isUpdate ? 'PATCH' : 'POST',
    headers,
    body: JSON.stringify(eventBody),
  });

  if (!res.ok) {
    return {
      googleEventId: params.booking.googleEventId,
      synced: false,
      refreshedAccessTokenEncrypted: resolved.refreshedAccessTokenEncrypted,
      refreshedTokenExpiresAt: resolved.refreshedTokenExpiresAt,
    };
  }

  const createdJson = (await res.json().catch(() => null)) as { id?: string } | null;
  return {
    googleEventId:
      createdJson?.id ??
      params.booking.googleEventId ??
      `gcal-evt-${params.booking.bookingCode}`,
    synced: true,
    refreshedAccessTokenEncrypted: resolved.refreshedAccessTokenEncrypted,
    refreshedTokenExpiresAt: resolved.refreshedTokenExpiresAt,
  };
}

export async function fetchGoogleFreeBusy(params: {
  connection: CalendarConnection;
  timeMinIso?: string;
  timeMaxIso?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  busyBlocks: Array<{ startAt: string; endAt: string; summary?: string }>;
  synced: boolean;
  refreshedAccessTokenEncrypted?: string;
  refreshedTokenExpiresAt?: string;
}> {
  if (!params.connection.isConnected || !params.connection.accessTokenEncrypted) {
    return {
      busyBlocks: params.connection.externalBusyBlocks ?? [],
      synced: false,
    };
  }

  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const resolved = await resolveConnectionAccessToken(params.connection, fetcher);
  if (!resolved) {
    return {
      busyBlocks: params.connection.externalBusyBlocks ?? [],
      synced: false,
    };
  }

  const now = new Date();
  const timeMin = params.timeMinIso ?? now.toISOString();
  const timeMax =
    params.timeMaxIso ?? new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const calendarIds =
    params.connection.conflictCalendarIds.length > 0
      ? params.connection.conflictCalendarIds
      : ['primary'];

  const res = await fetcher('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  if (!res.ok) {
    return {
      busyBlocks: params.connection.externalBusyBlocks ?? [],
      synced: false,
      refreshedAccessTokenEncrypted: resolved.refreshedAccessTokenEncrypted,
      refreshedTokenExpiresAt: resolved.refreshedTokenExpiresAt,
    };
  }

  const json = (await res.json().catch(() => null)) as {
    calendars?: Record<
      string,
      { busy?: Array<{ start?: string; end?: string }> }
    >;
  } | null;

  const busyBlocks: Array<{ startAt: string; endAt: string; summary?: string }> = [];
  if (json?.calendars) {
    for (const cal of Object.values(json.calendars)) {
      for (const slot of cal.busy ?? []) {
        if (slot.start && slot.end) {
          busyBlocks.push({
            startAt: slot.start,
            endAt: slot.end,
            summary: 'Ocupado en Google Calendar',
          });
        }
      }
    }
  }

  return {
    busyBlocks,
    synced: true,
    refreshedAccessTokenEncrypted: resolved.refreshedAccessTokenEncrypted,
    refreshedTokenExpiresAt: resolved.refreshedTokenExpiresAt,
  };
}

export async function registerGoogleCalendarWatch(params: {
  connection: CalendarConnection;
  webhookUrl: string;
  webhookToken: string;
  channelId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  watchChannelId: string;
  watchResourceId: string | null;
  watchExpiration: string | null;
} | null> {
  if (!params.connection.isConnected || !params.connection.accessTokenEncrypted) {
    return null;
  }
  const fetcher = params.fetchImpl ?? globalThis.fetch;
  const resolved = await resolveConnectionAccessToken(params.connection, fetcher);
  if (!resolved) return null;

  const channelId = params.channelId ?? `nails-gcal-${crypto.randomUUID()}`;
  const calendarId = encodeURIComponent(
    params.connection.destinationCalendarId || 'primary',
  );
  const res = await fetcher(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/watch`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: params.webhookUrl,
        token: params.webhookToken,
      }),
    },
  );

  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    resourceId?: string;
    expiration?: string;
  } | null;

  const expMs = json?.expiration ? Number(json.expiration) : Number.NaN;
  return {
    watchChannelId: json?.id ?? channelId,
    watchResourceId: json?.resourceId ?? null,
    watchExpiration: Number.isFinite(expMs) ? new Date(expMs).toISOString() : null,
  };
}
