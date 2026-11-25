import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT_SESSION_COOKIE,
  getOrCreateClientSession,
  readClientSessionToken,
} from './client-session';
import { createAdminSessionToken } from './admin-session';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractCookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(';')[0] ?? '';
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('HttpOnly Signed Client Session Cookie (S7)', () => {
  it('issues a signed httpOnly cookie with opaque UUID and reuses it on subsequent requests', async () => {
    vi.stubEnv('CLIENT_SESSION_SECRET', 'test-client-session-secret');

    const created = await getOrCreateClientSession(
      new Request('http://localhost:3000/api/slot-holds'),
    );
    expect(UUID_RE.test(created.token)).toBe(true);
    expect(created.setCookieHeader).toBeDefined();
    expect(created.setCookieHeader).toContain(`${CLIENT_SESSION_COOKIE}=`);
    expect(created.setCookieHeader).toContain('HttpOnly');
    expect(created.setCookieHeader).toContain('SameSite=Lax');
    expect(created.setCookieHeader).toContain('Path=/');
    expect(created.setCookieHeader).toContain('Max-Age=86400');

    const cookiePair = extractCookiePair(created.setCookieHeader ?? '');
    const authedReq = new Request('http://localhost:3000/api/slot-holds', {
      headers: { cookie: cookiePair },
    });

    const parsed = await readClientSessionToken(authedReq);
    expect(parsed).toBe(created.token);

    const reused = await getOrCreateClientSession(authedReq);
    expect(reused.token).toBe(created.token);
    expect(reused.setCookieHeader).toBeUndefined();
  });

  it('rejects tampered, unsigned, malformed, expired, and cross-purpose admin tokens', async () => {
    vi.stubEnv('CLIENT_SESSION_SECRET', 'shared-test-secret');
    vi.stubEnv('ADMIN_SESSION_SECRET', 'shared-test-secret');

    const created = await getOrCreateClientSession(
      new Request('http://localhost:3000/api/bookings'),
    );
    const cookiePair = extractCookiePair(created.setCookieHeader ?? '');
    const rawValue = cookiePair.slice(`${CLIENT_SESSION_COOKIE}=`.length);
    const [payloadPart, sigPart] = rawValue.split('.');
    if (!payloadPart || !sigPart) throw new Error('Expected signed cookie value');

    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        sid: '11111111-1111-4111-8111-111111111111',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      'utf8',
    ).toString('base64url');

    const tampered = await readClientSessionToken(
      new Request('http://localhost:3000/api/bookings', {
        headers: { cookie: `${CLIENT_SESSION_COOKIE}=${forgedPayload}.${sigPart}` },
      }),
    );
    expect(tampered).toBeNull();

    const unsigned = await readClientSessionToken(
      new Request('http://localhost:3000/api/bookings', {
        headers: {
          cookie: `${CLIENT_SESSION_COOKIE}=11111111-1111-4111-8111-111111111111`,
        },
      }),
    );
    expect(unsigned).toBeNull();

    const adminToken = createAdminSessionToken({
      id: 'adm-owner',
      email: 'duena@nails.studio',
      role: 'owner',
    });
    const crossPurpose = await readClientSessionToken(
      new Request('http://localhost:3000/api/bookings', {
        headers: { cookie: `${CLIENT_SESSION_COOKIE}=${adminToken ?? ''}` },
      }),
    );
    expect(crossPurpose).toBeNull();

    const rotated = await getOrCreateClientSession(
      new Request('http://localhost:3000/api/bookings', {
        headers: { cookie: `${CLIENT_SESSION_COOKIE}=${forgedPayload}.${sigPart}` },
      }),
    );
    expect(rotated.token).not.toBe(created.token);
    expect(rotated.setCookieHeader).toBeDefined();
  });

  it('adds Secure flag in production and fails closed when signing secrets are missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_SESSION_SECRET', '');
    vi.stubEnv('ADMIN_SESSION_SECRET', '');

    await expect(
      getOrCreateClientSession(new Request('https://nails.example/api/slot-holds')),
    ).rejects.toThrow();

    vi.stubEnv('CLIENT_SESSION_SECRET', 'prod-client-secret-32-bytes-ok');
    const prodSession = await getOrCreateClientSession(
      new Request('https://nails.example/api/slot-holds'),
    );
    expect(prodSession.setCookieHeader).toContain('Secure');
    expect(prodSession.setCookieHeader).toContain('HttpOnly');
  });
});
