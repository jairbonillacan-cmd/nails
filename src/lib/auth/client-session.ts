import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';

export const CLIENT_SESSION_COOKIE = 'nails_client_session';

const CLIENT_SESSION_TTL_SECONDS = 60 * 60 * 24;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

declare global {
  var nailsEphemeralClientSessionSecret: string | undefined;
}

const clientSessionPayloadSchema = z.object({
  v: z.literal(1),
  sid: z.string().uuid(),
  exp: z.number().int().positive(),
});

function getClientSessionSecret(): string | null {
  const configured =
    process.env.CLIENT_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  if (!globalThis.nailsEphemeralClientSessionSecret) {
    globalThis.nailsEphemeralClientSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.nailsEphemeralClientSessionSecret;
}

function deriveClientSessionKey(secret: string): Buffer {
  return crypto
    .createHmac('sha256', secret)
    .update('client-session:v1', 'utf8')
    .digest();
}

function signClientSessionToken(
  sessionId: string,
  nowMs = Date.now(),
  ttlSeconds = CLIENT_SESSION_TTL_SECONDS,
): string | null {
  const secret = getClientSessionSecret();
  if (!secret) return null;
  const key = deriveClientSessionKey(secret);
  const payload = {
    v: 1 as const,
    sid: sessionId,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const payloadB64Url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64Url = crypto
    .createHmac('sha256', key)
    .update(payloadB64Url, 'utf8')
    .digest('base64url');
  return `${payloadB64Url}.${sigB64Url}`;
}

function verifyClientSessionCookieValue(
  rawValue: string,
  nowMs = Date.now(),
): string | null {
  const secret = getClientSessionSecret();
  if (!secret) return null;
  const parts = rawValue.split('.');
  if (parts.length !== 2) return null;
  const payloadB64Url = parts[0];
  const sigB64Url = parts[1];
  if (
    !payloadB64Url ||
    !sigB64Url ||
    !BASE64URL_RE.test(payloadB64Url) ||
    !BASE64URL_RE.test(sigB64Url)
  ) {
    return null;
  }

  const key = deriveClientSessionKey(secret);
  const expectedSig = crypto
    .createHmac('sha256', key)
    .update(payloadB64Url, 'utf8')
    .digest();
  const providedSig = Buffer.from(sigB64Url, 'base64url');
  if (
    providedSig.length !== expectedSig.length ||
    providedSig.toString('base64url') !== sigB64Url ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64Url, 'base64url').toString('utf8'),
    ) as unknown;
    const parsed = clientSessionPayloadSchema.safeParse(decoded);
    if (!parsed.success) return null;
    if (parsed.data.exp * 1000 <= nowMs) return null;
    return parsed.data.sid;
  } catch {
    return null;
  }
}

function parseCookieFromHeader(
  cookieHeader: string | null,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key !== name) continue;
    const rawVal = trimmed.slice(eqIndex + 1).trim();
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return undefined;
}

function serializeClientSessionCookie(signedValue: string): string {
  const segments = [
    `${CLIENT_SESSION_COOKIE}=${signedValue}`,
    'Path=/',
    `Max-Age=${CLIENT_SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') {
    segments.push('Secure');
  }
  return segments.join('; ');
}

export async function readClientSessionToken(
  request?: Request,
): Promise<string | null> {
  let rawValue: string | undefined;
  if (request) {
    rawValue = parseCookieFromHeader(
      request.headers.get('cookie'),
      CLIENT_SESSION_COOKIE,
    );
  } else {
    const cookieStore = await cookies();
    rawValue = cookieStore.get(CLIENT_SESSION_COOKIE)?.value;
  }
  if (!rawValue) return null;
  return verifyClientSessionCookieValue(rawValue);
}

export async function getOrCreateClientSession(
  request?: Request,
): Promise<{ token: string; setCookieHeader?: string }> {
  const existing = await readClientSessionToken(request);
  if (existing) {
    return { token: existing };
  }

  const token = crypto.randomUUID();
  const signed = signClientSessionToken(token);
  if (!signed) {
    throw new Error('Client session signing secret is not configured.');
  }

  return {
    token,
    setCookieHeader: serializeClientSessionCookie(signed),
  };
}
