import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearClientPortalOtpStoreForTests,
  CLIENT_PORTAL_COOKIE,
  CLIENT_PORTAL_OTP_CHALLENGE_COOKIE,
  createClientPortalOtpChallenge,
  createClientPortalSessionToken,
  readClientPortalSession,
  verifyClientPortalOtp,
  verifyClientPortalSessionToken,
} from './client-portal-otp';
import {
  DELETE as deletePortalOtp,
  POST as postPortalOtp,
} from '@/app/api/client-portal/otp/route';
import { GET as getPortalBookings } from '@/app/api/client-portal/bookings/route';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';

describe('client-portal-otp auth', () => {
  afterEach(() => {
    clearClientPortalOtpStoreForTests();
    resetRateLimiterForTests();
    vi.unstubAllEnvs();
  });

  it('keeps the challenge cookie useless for offline guessing without the server secret', () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-offline');
    const challenge = createClientPortalOtpChallenge('222 123 4567');
    expect(challenge?.challengeToken).toBeTruthy();
    if (!challenge?.challengeToken) return;
    const payload = JSON.parse(
      Buffer.from(challenge.challengeToken.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { salt: string; digestHex: string; phoneE164: string };
    const saltOnlyDigest = crypto
      .createHmac('sha256', payload.salt)
      .update(`${payload.phoneE164}:${challenge.code}`, 'utf8')
      .digest('hex');
    expect(saltOnlyDigest).not.toBe(payload.digestHex);
  });

  it('does not grant fresh attempts by replaying the challenge cookie after lockout', () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-lockout');
    const nowMs = 1_760_000_000_000;
    const challenge = createClientPortalOtpChallenge('222 123 4567', { nowMs });
    if (!challenge?.challengeToken) throw new Error('missing challenge');
    const wrong = challenge.code === '000000' ? '111111' : '000000';
    let last = verifyClientPortalOtp('+522221234567', wrong, {
      nowMs,
      challengeToken: challenge.challengeToken,
    });
    for (let i = 0; i < 6; i += 1) {
      last = verifyClientPortalOtp('+522221234567', wrong, {
        nowMs,
        challengeToken: challenge.challengeToken,
      });
    }
    expect(last.ok).toBe(false);
    const afterLockout = verifyClientPortalOtp('+522221234567', challenge.code, {
      nowMs,
      challengeToken: challenge.challengeToken,
    });
    expect(afterLockout.ok).toBe(false);
  });

  it('limits code requests per phone even when the IP changes', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-phone-limit');
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const res = await postPortalOtp(
        new NextRequest('http://localhost:3000/api/client-portal/otp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': `203.0.113.${20 + i}`,
          },
          body: JSON.stringify({ action: 'request', phone: '+522224123987' }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(statuses[4]).toBe(429);
  });

  it('generates a 6-digit OTP, verifies once, and invalidates replay', () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-123');
    const nowMs = 1_760_000_000_000;
    const challenge = createClientPortalOtpChallenge('222 123 4567', { nowMs });
    expect(challenge).not.toBeNull();
    if (!challenge) return;

    expect(challenge.phoneE164).toBe('+522221234567');
    expect(challenge.code).toMatch(/^\d{6}$/);

    const verified = verifyClientPortalOtp('+522221234567', challenge.code, {
      nowMs: nowMs + 60_000,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const session = verifyClientPortalSessionToken(
      verified.sessionToken,
      nowMs + 60_000,
    );
    expect(session?.phoneE164).toBe('+522221234567');

    const replay = verifyClientPortalOtp('+522221234567', challenge.code, {
      nowMs: nowMs + 61_000,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.reason).toBe('not_found');
    }
  });

  it('enforces 5-minute TTL and 5 max failed attempts', () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-456');
    const nowMs = 1_760_000_000_000;
    const challenge = createClientPortalOtpChallenge('+522229876543', { nowMs });
    expect(challenge).not.toBeNull();
    if (!challenge) return;

    const expired = verifyClientPortalOtp('+522229876543', challenge.code, {
      nowMs: nowMs + 5 * 60 * 1000 + 1,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.reason).toBe('expired');
    }

    const second = createClientPortalOtpChallenge('+522229876543', { nowMs });
    expect(second).not.toBeNull();
    if (!second) return;
    const wrongCode = second.code === '000000' ? '999999' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = verifyClientPortalOtp('+522229876543', wrongCode, {
        nowMs: nowMs + attempt * 1000,
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe('invalid_code');
        expect(res.attemptsRemaining).toBe(5 - attempt);
      }
    }

    const fifth = verifyClientPortalOtp('+522229876543', wrongCode, {
      nowMs: nowMs + 10_000,
    });
    expect(fifth.ok).toBe(false);
    if (!fifth.ok) {
      expect(fifth.reason).toBe('max_attempts');
    }

    const afterLockout = verifyClientPortalOtp('+522229876543', second.code, {
      nowMs: nowMs + 11_000,
    });
    expect(afterLockout.ok).toBe(false);
    if (!afterLockout.ok) {
      expect(afterLockout.reason).toBe('not_found');
    }
  });

  it('rejects tampered or expired cookies and fails closed in production without secret', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-789');
    const nowMs = Date.now();
    const token = createClientPortalSessionToken('+522221112233', { nowMs });
    expect(token).toBeTruthy();
    if (!token) return;

    const req = new Request('http://localhost:3000/api/client-portal/bookings', {
      headers: { cookie: `${CLIENT_PORTAL_COOKIE}=${token}` },
    });
    const parsed = await readClientPortalSession(req);
    expect(parsed?.phoneE164).toBe('+522221112233');

    const [payloadPart, sigPart] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({
        v: 1,
        phoneE164: '+522229999999',
        exp: Math.floor(nowMs / 1000) + 3600,
      }),
      'utf8',
    ).toString('base64url');
    expect(verifyClientPortalSessionToken(`${forgedPayload}.${sigPart ?? ''}`, nowMs)).toBeNull();
    expect(payloadPart).toBeTruthy();

    const expiredToken = createClientPortalSessionToken('+522221112233', {
      nowMs,
      ttlSeconds: -10,
    });
    expect(verifyClientPortalSessionToken(expiredToken ?? '', nowMs)).toBeNull();

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_PORTAL_SECRET', '');
    vi.stubEnv('CLIENT_SESSION_SECRET', '');
    vi.stubEnv('ADMIN_SESSION_SECRET', '');

    expect(createClientPortalSessionToken('+522221112233', { nowMs })).toBeNull();
    expect(verifyClientPortalSessionToken(token, nowMs)).toBeNull();

    const prodChallenge = createClientPortalOtpChallenge('+522221112233', { nowMs });
    expect(prodChallenge).not.toBeNull();
    if (prodChallenge) {
      const prodVerify = verifyClientPortalOtp('+522221112233', prodChallenge.code, { nowMs });
      expect(prodVerify.ok).toBe(false);
      if (!prodVerify.ok) {
        expect(prodVerify.reason).toBe('unconfigured');
      }
    }
  });

  it('runs end-to-end OTP route flow, enforces client isolation, hides demoCode in production, and clears cookie on DELETE', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-route-secret');

    const unauthRes = await getPortalBookings(
      new NextRequest('http://localhost:3000/api/client-portal/bookings'),
    );
    expect(unauthRes.status).toBe(401);

    const requestRes = await postPortalOtp(
      new NextRequest('http://localhost:3000/api/client-portal/otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
          action: 'request',
          phone: '+522224123987',
        }),
      }),
    );
    expect(requestRes.status).toBe(200);
    const requestJson = (await requestRes.json()) as {
      ok: boolean;
      phoneE164: string;
      demoCode?: string;
    };
    expect(requestJson.ok).toBe(true);
    expect(requestJson.phoneE164).toBe('+522224123987');
    expect(requestJson.demoCode).toMatch(/^\d{6}$/);

    const verifyRes = await postPortalOtp(
      new NextRequest('http://localhost:3000/api/client-portal/otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.10',
        },
        body: JSON.stringify({
          action: 'verify',
          phone: '+522224123987',
          code: requestJson.demoCode,
        }),
      }),
    );
    expect(verifyRes.status).toBe(200);
    const setCookie = verifyRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${CLIENT_PORTAL_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');

    const cookieVal = verifyRes.cookies.get(CLIENT_PORTAL_COOKIE)?.value;
    expect(cookieVal).toBeTruthy();

    const bookingsRes = await getPortalBookings(
      new NextRequest('http://localhost:3000/api/client-portal/bookings', {
        headers: {
          cookie: `${CLIENT_PORTAL_COOKIE}=${cookieVal ?? ''}`,
        },
      }),
    );
    expect(bookingsRes.status).toBe(200);
    const bookingsText = await bookingsRes.text();
    expect(bookingsText).not.toContain('internalNotes');
    expect(bookingsText).not.toContain('commissionPercent');
    expect(bookingsText).not.toContain('ownerPinHash');
    const bookingsJson = JSON.parse(bookingsText) as {
      authenticated: boolean;
      phoneE164: string;
      clientName: string | null;
      bookings: Array<{ bookingCode: string }>;
      packages: Array<{ packageName: string }>;
    };
    expect(bookingsJson.authenticated).toBe(true);
    expect(bookingsJson.phoneE164).toBe('+522224123987');
    expect(bookingsJson.clientName).toBe('Sofía Ramírez');
    expect(bookingsJson.bookings.length).toBeGreaterThan(0);

    const logoutRes = await deletePortalOtp();
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie') ?? '').toContain('Max-Age=0');

    vi.stubEnv('NODE_ENV', 'production');
    const prodRequestRes = await postPortalOtp(
      new NextRequest('http://localhost:3000/api/client-portal/otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.11',
        },
        body: JSON.stringify({
          action: 'request',
          phone: '+522224123987',
        }),
      }),
    );
    expect(prodRequestRes.status).toBe(200);
    const prodJson = (await prodRequestRes.json()) as { demoCode?: string };
    expect(prodJson.demoCode).toBeUndefined();
  });

  it('falls back to email OTP via Resend when WhatsApp Cloud is unconfigured and client has an email', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-secret-email-fallback');
    vi.stubEnv('RESEND_API_KEY', 're_test_key_123');
    vi.stubEnv('RESEND_FROM_EMAIL', 'LAIKONA NAILS <citas@laikona.devand.net>');
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '');

    const notifModule = await import('@/lib/integrations/notifications');
    const spy = vi.spyOn(notifModule, 'dispatchWhatsAppNotification').mockResolvedValue({
      status: 'sent',
      providerMessageId: 'resend-fallback-test',
      errorMessage: null,
      deliveryMode: 'fallback_email_wame',
    });

    try {
      const res = await postPortalOtp(
        new NextRequest('http://localhost:3000/api/client-portal/otp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '203.0.113.44',
          },
          body: JSON.stringify({
            action: 'request',
            phone: '+522224123987',
          }),
        }),
      );
      expect(res.status).toBe(200);
      const rawText = await res.text();
      expect(rawText).not.toContain('sofia.ramirez@ejemplo.mx');
      const json = JSON.parse(rawText) as { ok: boolean; channel: string };
      expect(json.ok).toBe(true);
      expect(json.channel).toBe('email');
      expect(spy).toHaveBeenCalledTimes(1);
      const firstCall = spy.mock.calls[0]?.[0];
      expect(firstCall?.fallbackEmail?.to).toBe('sofia.ramirez@ejemplo.mx');
      expect(firstCall?.fallbackEmail?.template?.id).toBe('laikona-client-otp');
      expect(String(firstCall?.fallbackEmail?.template?.variables?.OTP_CODE)).toMatch(/^\d{6}$/);
    } finally {
      spy.mockRestore();
    }
  });

  it('verifies OTP across Cloudflare Worker isolates via signed httpOnly challenge cookie and rejects tampered or cross-phone cookies', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-portal-cross-isolate-secret');

    const reqRes = await postPortalOtp(
      new NextRequest('http://localhost:3000/api/client-portal/otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.88',
        },
        body: JSON.stringify({
          action: 'request',
          phone: '+522224123987',
        }),
      }),
    );
    expect(reqRes.status).toBe(200);
    const reqJson = (await reqRes.json()) as { demoCode?: string };
    const challengeCookie = reqRes.cookies.get(CLIENT_PORTAL_OTP_CHALLENGE_COOKIE)?.value;
    expect(reqJson.demoCode).toMatch(/^\d{6}$/);
    expect(challengeCookie).toBeTruthy();

    clearClientPortalOtpStoreForTests();

    const wrongPhoneRes = await postPortalOtp(
      new NextRequest('http://localhost:3000/api/client-portal/otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.88',
          cookie: `${CLIENT_PORTAL_OTP_CHALLENGE_COOKIE}=${challengeCookie ?? ''}`,
        },
        body: JSON.stringify({
          action: 'verify',
          phone: '+522229999999',
          code: reqJson.demoCode,
        }),
      }),
    );
    expect(wrongPhoneRes.status).toBe(401);

    const crossIsolateRes = await postPortalOtp(
      new NextRequest('http://localhost:3000/api/client-portal/otp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '203.0.113.88',
          cookie: `${CLIENT_PORTAL_OTP_CHALLENGE_COOKIE}=${challengeCookie ?? ''}`,
        },
        body: JSON.stringify({
          action: 'verify',
          phone: '+522224123987',
          code: reqJson.demoCode,
        }),
      }),
    );
    expect(crossIsolateRes.status).toBe(200);
    expect(crossIsolateRes.cookies.get(CLIENT_PORTAL_COOKIE)?.value).toBeTruthy();
  });
});
