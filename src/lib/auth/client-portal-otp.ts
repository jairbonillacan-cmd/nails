import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { normalizePhoneE164 } from '../format';

export const CLIENT_PORTAL_COOKIE = 'nails_client_portal';

const CLIENT_PORTAL_TTL_SECONDS = 60 * 60 * 24 * 7;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_ACTIVE_CHALLENGES = 1000;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const OTP_CODE_RE = /^\d{6}$/;

interface StoredOtpChallenge {
  phoneE164: string;
  salt: string;
  digestHex: string;
  expiresAtMs: number;
  failedAttempts: number;
}

declare global {
  var nailsEphemeralClientPortalSecret: string | undefined;
  var nailsClientPortalOtpChallenges: Map<string, StoredOtpChallenge> | undefined;
}

const portalSessionPayloadSchema = z.object({
  v: z.literal(1),
  phoneE164: z.string().min(8).max(20),
  exp: z.number().int().positive(),
});

interface ClientPortalSession {
  phoneE164: string;
  exp: number;
}

type VerifyClientPortalOtpResult =
  | { ok: true; phoneE164: string; sessionToken: string }
  | {
      ok: false;
      reason: 'invalid_phone' | 'invalid_code' | 'not_found' | 'expired' | 'max_attempts' | 'unconfigured';
      attemptsRemaining: number;
    };

function getOtpStore(): Map<string, StoredOtpChallenge> {
  if (!globalThis.nailsClientPortalOtpChallenges) {
    globalThis.nailsClientPortalOtpChallenges = new Map<string, StoredOtpChallenge>();
  }
  return globalThis.nailsClientPortalOtpChallenges;
}

function pruneExpiredOtpChallenges(nowMs: number): void {
  const store = getOtpStore();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAtMs <= nowMs) {
      store.delete(key);
    }
  }
  if (store.size > OTP_MAX_ACTIVE_CHALLENGES) {
    const excess = store.size - OTP_MAX_ACTIVE_CHALLENGES;
    let removed = 0;
    for (const key of store.keys()) {
      store.delete(key);
      removed += 1;
      if (removed >= excess) break;
    }
  }
}

function hashOtpCode(phoneE164: string, code: string, salt: string): string {
  return crypto
    .createHmac('sha256', salt)
    .update(`${phoneE164}:${code}`, 'utf8')
    .digest('hex');
}

function getClientPortalSigningSecret(): string | null {
  const configured =
    process.env.CLIENT_PORTAL_SECRET?.trim() ||
    process.env.CLIENT_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  if (!globalThis.nailsEphemeralClientPortalSecret) {
    globalThis.nailsEphemeralClientPortalSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.nailsEphemeralClientPortalSecret;
}

function derivePortalKey(secret: string): Buffer {
  return crypto
    .createHmac('sha256', secret)
    .update('client-portal-session:v1', 'utf8')
    .digest();
}

function isValidPortalPhoneE164(phoneE164: string): boolean {
  const digits = phoneE164.replace(/\D/g, '');
  return phoneE164.startsWith('+') && digits.length >= 10 && digits.length <= 15;
}

export function createClientPortalOtpChallenge(
  rawPhone: string,
  options?: { nowMs?: number; ttlMs?: number },
): { phoneE164: string; code: string; expiresAtMs: number } | null {
  const phoneE164 = normalizePhoneE164(rawPhone);
  if (!isValidPortalPhoneE164(phoneE164)) {
    return null;
  }
  const nowMs = options?.nowMs ?? Date.now();
  const ttlMs = options?.ttlMs ?? OTP_TTL_MS;
  pruneExpiredOtpChallenges(nowMs);

  const code = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(16).toString('hex');
  const digestHex = hashOtpCode(phoneE164, code, salt);
  const expiresAtMs = nowMs + ttlMs;

  getOtpStore().set(phoneE164, {
    phoneE164,
    salt,
    digestHex,
    expiresAtMs,
    failedAttempts: 0,
  });

  return { phoneE164, code, expiresAtMs };
}

export function createClientPortalSessionToken(
  phoneE164: string,
  options?: { nowMs?: number; ttlSeconds?: number },
): string | null {
  const normalized = normalizePhoneE164(phoneE164);
  if (!isValidPortalPhoneE164(normalized)) {
    return null;
  }
  const secret = getClientPortalSigningSecret();
  if (!secret) {
    return null;
  }
  const nowMs = options?.nowMs ?? Date.now();
  const ttlSeconds = options?.ttlSeconds ?? CLIENT_PORTAL_TTL_SECONDS;
  const payload = {
    v: 1 as const,
    phoneE164: normalized,
    exp: Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const payloadB64Url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64Url = crypto
    .createHmac('sha256', derivePortalKey(secret))
    .update(payloadB64Url, 'utf8')
    .digest('base64url');
  return `${payloadB64Url}.${sigB64Url}`;
}

export function verifyClientPortalSessionToken(
  token: string,
  nowMs = Date.now(),
): ClientPortalSession | null {
  const secret = getClientPortalSigningSecret();
  if (!secret) {
    return null;
  }
  const parts = token.split('.');
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

  const expectedSig = crypto
    .createHmac('sha256', derivePortalKey(secret))
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
    const parsed = portalSessionPayloadSchema.safeParse(decoded);
    if (!parsed.success) return null;
    if (parsed.data.exp * 1000 <= nowMs) return null;
    if (!isValidPortalPhoneE164(parsed.data.phoneE164)) return null;
    return {
      phoneE164: parsed.data.phoneE164,
      exp: parsed.data.exp,
    };
  } catch {
    return null;
  }
}

export function verifyClientPortalOtp(
  rawPhone: string,
  rawCode: string,
  options?: { nowMs?: number },
): VerifyClientPortalOtpResult {
  const phoneE164 = normalizePhoneE164(rawPhone);
  if (!isValidPortalPhoneE164(phoneE164)) {
    return { ok: false, reason: 'invalid_phone', attemptsRemaining: 0 };
  }

  const code = rawCode.trim();
  const nowMs = options?.nowMs ?? Date.now();
  const store = getOtpStore();
  const entry = store.get(phoneE164);

  if (!entry) {
    return { ok: false, reason: 'not_found', attemptsRemaining: 0 };
  }
  if (entry.expiresAtMs <= nowMs) {
    store.delete(phoneE164);
    return { ok: false, reason: 'expired', attemptsRemaining: 0 };
  }
  if (entry.failedAttempts >= OTP_MAX_ATTEMPTS) {
    store.delete(phoneE164);
    return { ok: false, reason: 'max_attempts', attemptsRemaining: 0 };
  }

  if (!OTP_CODE_RE.test(code)) {
    const nextFailed = entry.failedAttempts + 1;
    if (nextFailed >= OTP_MAX_ATTEMPTS) {
      store.delete(phoneE164);
      return { ok: false, reason: 'max_attempts', attemptsRemaining: 0 };
    }
    store.set(phoneE164, { ...entry, failedAttempts: nextFailed });
    return {
      ok: false,
      reason: 'invalid_code',
      attemptsRemaining: OTP_MAX_ATTEMPTS - nextFailed,
    };
  }

  const candidateDigest = Buffer.from(
    hashOtpCode(phoneE164, code, entry.salt),
    'hex',
  );
  const expectedDigest = Buffer.from(entry.digestHex, 'hex');
  const matches =
    candidateDigest.length === expectedDigest.length &&
    crypto.timingSafeEqual(candidateDigest, expectedDigest);

  if (!matches) {
    const nextFailed = entry.failedAttempts + 1;
    if (nextFailed >= OTP_MAX_ATTEMPTS) {
      store.delete(phoneE164);
      return { ok: false, reason: 'max_attempts', attemptsRemaining: 0 };
    }
    store.set(phoneE164, { ...entry, failedAttempts: nextFailed });
    return {
      ok: false,
      reason: 'invalid_code',
      attemptsRemaining: OTP_MAX_ATTEMPTS - nextFailed,
    };
  }

  const sessionToken = createClientPortalSessionToken(phoneE164, { nowMs });
  if (!sessionToken) {
    return { ok: false, reason: 'unconfigured', attemptsRemaining: 0 };
  }

  store.delete(phoneE164);
  return { ok: true, phoneE164, sessionToken };
}

function parseCookieHeaderValue(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    if (trimmed.slice(0, eqIndex).trim() !== name) continue;
    const raw = trimmed.slice(eqIndex + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

export async function readClientPortalSession(
  request?: Request,
): Promise<ClientPortalSession | null> {
  let rawValue: string | undefined;
  if (request) {
    rawValue = parseCookieHeaderValue(
      request.headers.get('cookie'),
      CLIENT_PORTAL_COOKIE,
    );
  } else {
    const cookieStore = await cookies();
    rawValue = cookieStore.get(CLIENT_PORTAL_COOKIE)?.value;
  }
  if (!rawValue) return null;
  return verifyClientPortalSessionToken(rawValue);
}

export function getClientPortalCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CLIENT_PORTAL_TTL_SECONDS,
  };
}

export function clearClientPortalOtpStoreForTests(): void {
  globalThis.nailsClientPortalOtpChallenges?.clear();
}
