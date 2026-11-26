import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { AdminRoleSchema } from '@/lib/contracts';
import { getSnapshot } from '../repositories/db';
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
  isSupabaseEnabled,
} from '../repositories/supabase-client';
import type { AdminRole, AdminUser } from '../types';

export const ADMIN_SESSION_COOKIE = 'nails_admin_session';
export const GOOGLE_OAUTH_STATE_COOKIE = 'nails_google_oauth_state';

const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const GOOGLE_OAUTH_STATE_TTL_SECONDS = 60 * 10;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

declare global {
  var nailsEphemeralSessionSecret: string | undefined;
  var nailsConsumedGoogleOAuthNonces: Map<string, number> | undefined;
}

const adminSessionPayloadSchema = z.object({
  v: z.literal(1),
  sub: z.string().min(1),
  email: z.string().email(),
  role: AdminRoleSchema,
  exp: z.number().int().positive(),
});

const googleOAuthStatePayloadSchema = z.object({
  v: z.literal(1),
  staffId: z.string().min(1),
  adminId: z.string().min(1),
  nonce: z.string().min(16),
  exp: z.number().int().positive(),
});

const supabaseAdminUserRowSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  full_name: z.string(),
  role: AdminRoleSchema,
  staff_member_id: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
});

export interface AdminSession {
  user: AdminUser;
  isDemo: boolean;
}

export interface GoogleOAuthStatePayload {
  staffId: string;
  adminId: string;
  nonce: string;
  exp: number;
}

export function isLocalDemoAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

export function constantTimeEqual(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function getSigningSecret(): string | null {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (!isLocalDemoAuthEnabled()) {
    return null;
  }
  if (!globalThis.nailsEphemeralSessionSecret) {
    globalThis.nailsEphemeralSessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.nailsEphemeralSessionSecret;
}

function derivePurposeKey(secret: string, purpose: string): Buffer {
  return crypto.createHmac('sha256', secret).update(purpose, 'utf8').digest();
}

function signStructuredToken(payload: unknown, purpose: string): string | null {
  const secret = getSigningSecret();
  if (!secret) return null;
  const key = derivePurposeKey(secret, purpose);
  const payloadB64Url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64Url = crypto
    .createHmac('sha256', key)
    .update(payloadB64Url, 'utf8')
    .digest('base64url');
  return `${payloadB64Url}.${sigB64Url}`;
}

function verifyStructuredToken(token: string, purpose: string): unknown | null {
  const secret = getSigningSecret();
  if (!secret) return null;
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

  const key = derivePurposeKey(secret, purpose);
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
    const decoded = Buffer.from(payloadB64Url, 'base64url').toString('utf8');
    return JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
}

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!cookieHeader) return map;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    try {
      map.set(name, decodeURIComponent(rawValue));
    } catch {
      map.set(name, rawValue);
    }
  }
  return map;
}

export function readRequestCookie(request: Request, name: string): string | undefined {
  return parseCookieHeader(request.headers.get('cookie')).get(name);
}

async function readCookieValue(name: string, request?: Request): Promise<string | undefined> {
  if (request) {
    return readRequestCookie(request, name);
  }
  const cookieStore = await cookies();
  return cookieStore.get(name)?.value;
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

export function getGoogleOAuthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/google/callback',
    maxAge: GOOGLE_OAUTH_STATE_TTL_SECONDS,
  };
}

export function createAdminSessionToken(
  user: Pick<AdminUser, 'id' | 'email' | 'role'>,
  options?: { nowMs?: number; ttlSeconds?: number },
): string | null {
  const nowMs = options?.nowMs ?? Date.now();
  const ttlSeconds = options?.ttlSeconds ?? ADMIN_SESSION_TTL_SECONDS;
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  return signStructuredToken(
    {
      v: 1,
      sub: user.id,
      email: user.email.toLowerCase(),
      role: user.role,
      exp,
    },
    'admin-session:v1',
  );
}

function verifyAdminSessionToken(
  token: string,
  nowMs = Date.now(),
): z.infer<typeof adminSessionPayloadSchema> | null {
  const raw = verifyStructuredToken(token, 'admin-session:v1');
  if (!raw) return null;
  const parsed = adminSessionPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.exp * 1000 <= nowMs) return null;
  return parsed.data;
}

export function createGoogleOAuthState(params: {
  staffId: string;
  adminId: string;
  nowMs?: number;
  ttlSeconds?: number;
}): { state: string; nonce: string; exp: number } | null {
  const nowMs = params.nowMs ?? Date.now();
  const ttlSeconds = params.ttlSeconds ?? GOOGLE_OAUTH_STATE_TTL_SECONDS;
  const exp = Math.floor(nowMs / 1000) + ttlSeconds;
  const nonce = crypto.randomBytes(24).toString('base64url');
  const state = signStructuredToken(
    {
      v: 1,
      staffId: params.staffId,
      adminId: params.adminId,
      nonce,
      exp,
    },
    'google-oauth-state:v1',
  );
  if (!state) return null;
  return { state, nonce, exp };
}

export function verifyGoogleOAuthState(
  stateToken: string,
  nowMs = Date.now(),
): GoogleOAuthStatePayload | null {
  const raw = verifyStructuredToken(stateToken, 'google-oauth-state:v1');
  if (!raw) return null;
  const parsed = googleOAuthStatePayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.exp * 1000 <= nowMs) return null;
  return {
    staffId: parsed.data.staffId,
    adminId: parsed.data.adminId,
    nonce: parsed.data.nonce,
    exp: parsed.data.exp,
  };
}

export function consumeGoogleOAuthNonce(
  nonce: string,
  expSeconds: number,
  nowMs = Date.now(),
): boolean {
  if (!globalThis.nailsConsumedGoogleOAuthNonces) {
    globalThis.nailsConsumedGoogleOAuthNonces = new Map<string, number>();
  }
  const store = globalThis.nailsConsumedGoogleOAuthNonces;
  for (const [key, expiresAtMs] of store.entries()) {
    if (expiresAtMs <= nowMs) {
      store.delete(key);
    }
  }
  if (store.has(nonce)) {
    return false;
  }
  store.set(nonce, expSeconds * 1000);
  return true;
}

export async function findActiveSupabaseAdminByAuthUserId(
  authUserId: string,
): Promise<AdminUser | null> {
  try {
    const adminClient = createSupabaseAdminClient();
    const { data, error } = await adminClient
      .from('admin_users')
      .select('id, email, full_name, role, staff_member_id, is_active, created_at')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const parsed = supabaseAdminUserRowSchema.safeParse(data);
    if (!parsed.success || !parsed.data.is_active) {
      return null;
    }

    return {
      id: parsed.data.id,
      email: parsed.data.email,
      fullName: parsed.data.full_name,
      role: parsed.data.role,
      staffMemberId: parsed.data.staff_member_id,
      isActive: parsed.data.is_active,
      createdAt: parsed.data.created_at,
    };
  } catch {
    return null;
  }
}

export async function getAdminSession(
  request?: Request,
): Promise<AdminSession | null> {
  if (isSupabaseEnabled()) {
    try {
      const supabase = await createSupabaseServerClient(
        request ? { request } : undefined,
      );
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        return null;
      }
      const adminUser = await findActiveSupabaseAdminByAuthUserId(data.user.id);
      if (!adminUser) {
        return null;
      }
      return { user: adminUser, isDemo: false };
    } catch {
      return null;
    }
  }

  const token = await readCookieValue(ADMIN_SESSION_COOKIE, request);
  if (!token) {
    return null;
  }

  const payload = verifyAdminSessionToken(token);
  if (!payload) {
    return null;
  }

  const db = getSnapshot();
  const matched = db.adminUsers.find(
    (u) =>
      u.id === payload.sub &&
      u.email.toLowerCase() === payload.email.toLowerCase() &&
      u.role === payload.role &&
      u.isActive,
  );
  if (!matched) {
    return null;
  }

  return { user: matched, isDemo: isLocalDemoAuthEnabled() };
}

export async function requireAdmin(
  allowedRoles?: AdminRole[],
  request?: Request,
): Promise<AdminSession | null> {
  const session = await getAdminSession(request);
  if (!session) return null;
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return null;
  }
  return session;
}
