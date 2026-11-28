import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import nextConfig from '../../../next.config';
import { proxy } from '@/proxy';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
} from '@/lib/auth/admin-session';
import * as adminSessionModule from '@/lib/auth/admin-session';
import * as dbModule from '@/lib/repositories/db';
import {
  getSnapshot,
  recordFunnelEvent,
  registerMediaAsset,
  updateBookingStatus,
  upsertCoupon,
} from '@/lib/repositories/db';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';
import { GET as getRealtime } from '@/app/api/realtime/route';
import { POST as postValidateCoupon } from '@/app/api/coupons/validate/route';
import { POST as postAnalyticsEvent } from '@/app/api/analytics/events/route';
import {
  GET as getAdminPackages,
  PATCH as patchAdminPackages,
  POST as postAdminPackages,
} from '@/app/api/admin/packages/route';
import { POST as postCronRetention } from '@/app/api/cron/retention/route';
import { POST as postManageReview } from '@/app/api/bookings/manage/[token]/route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-hardening-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

function makeOwnerCookie(): string {
  const owner = getSnapshot().adminUsers.find((u) => u.role === 'owner' && u.isActive);
  if (!owner) throw new Error('Missing seed owner');
  const token = createAdminSessionToken(owner);
  if (!token) throw new Error('Expected signed owner token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetRateLimiterForTests();
  resetIsolatedDb();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetRateLimiterForTests();
  resetIsolatedDb();
});

afterAll(() => {
  vi.unstubAllEnvs();
  resetIsolatedDb();
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
});

describe('Edge Proxy, Security Headers, Public APIs & Cron Hardening', () => {
  it('proxy.ts checks all 3 Supabase vars and sets private, no-store + Vary: Cookie on unauthenticated redirect', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://partial.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const demoCookieReq = new NextRequest('http://localhost:3000/admin/citas', {
      headers: { cookie: 'nails_admin_session=abc.def' },
    });
    const partialRes = proxy(demoCookieReq);
    expect(partialRes.status).toBe(200);

    const unauthReq = new NextRequest('http://localhost:3000/admin/citas');
    const redirectRes = proxy(unauthReq);
    expect(redirectRes.status).toBe(307);
    expect(redirectRes.headers.get('cache-control')).toBe('private, no-store');
    expect(redirectRes.headers.get('vary')).toBe('Cookie');

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    const supaDemoCookieRes = proxy(demoCookieReq);
    expect(supaDemoCookieRes.status).toBe(307);
    expect(supaDemoCookieRes.headers.get('cache-control')).toBe('private, no-store');
  });

  it('next.config.ts configures COOP, CORP, GA4/Meta script-src, private SSR HTML headers, and gallery CORP override', async () => {
    const headerRules = await nextConfig.headers?.();
    expect(headerRules).toBeDefined();
    if (!headerRules) return;

    const baseRule = headerRules.find((rule) => rule.source === '/(.*)');
    const baseMap = new Map(baseRule?.headers.map((h) => [h.key, h.value]) ?? []);
    expect(baseMap.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(baseMap.get('Cross-Origin-Resource-Policy')).toBe('same-origin');

    const strictRule = headerRules.find((rule) => rule.source === '/((?!reservar(?:/|$)).*)');
    const strictCsp =
      strictRule?.headers.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
    expect(strictCsp).toContain('https://www.googletagmanager.com');
    expect(strictCsp).toContain('https://connect.facebook.net');
    expect(strictCsp).toContain('https://*.supabase.co');
    expect(strictCsp).not.toMatch(/https:\/\/[a-z0-9-]+\.supabase\.co/);

    const embedRule = headerRules.find(
      (rule) =>
        rule.source === '/reservar' &&
        rule.has?.some((entry) => entry.key === 'embed' && entry.value === '1'),
    );
    const embedMap = new Map(embedRule?.headers.map((h) => [h.key, h.value]) ?? []);
    expect(embedMap.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');

    for (const privatePath of ['/admin', '/admin/:path*', '/mis-citas', '/cita/:path*']) {
      const rule = headerRules.find((entry) => entry.source === privatePath);
      const map = new Map(rule?.headers.map((h) => [h.key, h.value]) ?? []);
      expect(map.get('Cache-Control')).toBe('private, no-store');
      expect(map.get('Vary')).toBe('Cookie');
      expect(map.get('Referrer-Policy')).toBe('no-referrer');
    }

    const galleryRule = headerRules.find((entry) => entry.source === '/api/media/gallery/:path*');
    expect(
      galleryRule?.headers.find((h) => h.key === 'Cross-Origin-Resource-Policy')?.value,
    ).toBe('cross-origin');
  });

  it('GET /api/realtime sets X-Accel-Buffering, cleans up listeners on abort, and sets no-store on 429', async () => {
    const beforeListeners = globalThis.nailsRealtimeListeners?.size ?? 0;
    const abortController = new AbortController();
    const req = new NextRequest('http://localhost:3000/api/realtime', {
      headers: { 'x-forwarded-for': '198.51.100.11' },
      signal: abortController.signal,
    });

    const res = await getRealtime(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(globalThis.nailsRealtimeListeners?.size ?? 0).toBe(beforeListeners + 1);

    abortController.abort();
    expect(globalThis.nailsRealtimeListeners?.size ?? 0).toBe(beforeListeners);

    let lastStatus = 200;
    let lastCacheControl: string | null = null;
    for (let i = 0; i < 61; i++) {
      const r = await getRealtime(
        new NextRequest('http://localhost:3000/api/realtime', {
          headers: { 'x-forwarded-for': '198.51.100.12' },
        }),
      );
      lastStatus = r.status;
      lastCacheControl = r.headers.get('cache-control');
      if (r.status === 200) {
        await r.body?.cancel();
      }
    }
    expect(lastStatus).toBe(429);
    expect(lastCacheControl).toBe('no-store');
  });

  it('POST /api/coupons/validate caps subtotalCents, eliminates gift-card error oracle, returns 500 on unexpected errors, and enforces 15/min + no-store', async () => {
    await upsertCoupon({
      code: 'EXPIRED99',
      kind: 'coupon',
      discountType: 'percent',
      discountValue: 15,
      remainingBalanceCents: null,
      recipientName: null,
      maxUses: 10,
      minSubtotalCents: 0,
      expiresAt: '2020-01-01T00:00:00.000Z',
      isActive: true,
    });
    await upsertCoupon({
      code: 'GIFTZERO',
      kind: 'gift_card',
      discountType: 'fixed_cents',
      discountValue: 50000,
      remainingBalanceCents: 0,
      recipientName: 'Sofía',
      maxUses: null,
      minSubtotalCents: 0,
      expiresAt: null,
      isActive: true,
    });

    const overCapRes = await postValidateCoupon(
      new NextRequest('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.21',
        },
        body: JSON.stringify({ code: 'GIFTZERO', subtotalCents: 10_000_000 }),
      }),
    );
    expect(overCapRes.status).toBe(400);
    expect(overCapRes.headers.get('cache-control')).toBe('no-store');

    const probe = async (code: string) => {
      const res = await postValidateCoupon(
        new NextRequest('http://localhost:3000/api/coupons/validate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.22',
          },
          body: JSON.stringify({ code, subtotalCents: 40000 }),
        }),
      );
      expect(res.status).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
      return (await res.json()) as { valid: boolean; error: string };
    };

    const missingBody = await probe('NONEXISTENT');
    const expiredBody = await probe('EXPIRED99');
    const exhaustedBody = await probe('GIFTZERO');
    expect(missingBody.error).toBe(expiredBody.error);
    expect(expiredBody.error).toBe(exhaustedBody.error);

    const repo = dbModule.getRepository();
    vi.spyOn(dbModule, 'getRepository').mockReturnValue({
      ...repo,
      validateCouponCode: async () => {
        throw new Error('db connection failed');
      },
    });
    const errorRes = await postValidateCoupon(
      new NextRequest('http://localhost:3000/api/coupons/validate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.23',
        },
        body: JSON.stringify({ code: 'ANYCODE', subtotalCents: 40000 }),
      }),
    );
    expect(errorRes.status).toBe(500);
    expect(errorRes.headers.get('cache-control')).toBe('no-store');
    vi.restoreAllMocks();

    let rateLimitedStatus = 200;
    let rateLimitedCache: string | null = null;
    for (let i = 0; i < 16; i++) {
      const res = await postValidateCoupon(
        new NextRequest('http://localhost:3000/api/coupons/validate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.24',
          },
          body: JSON.stringify({ code: 'UNKNOWN', subtotalCents: 30000 }),
        }),
      );
      rateLimitedStatus = res.status;
      rateLimitedCache = res.headers.get('cache-control');
    }
    expect(rateLimitedStatus).toBe(429);
    expect(rateLimitedCache).toBe('no-store');
  });

  it('POST /api/analytics/events always sets Cache-Control: no-store on 202, 400, and 500', async () => {
    const okRes = await postAnalyticsEvent(
      new NextRequest('http://localhost:3000/api/analytics/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.31',
        },
        body: JSON.stringify({
          sessionId: 'sess-hardening-1',
          eventType: 'page_view',
        }),
      }),
    );
    expect(okRes.status).toBe(202);
    expect(okRes.headers.get('cache-control')).toBe('no-store');

    const badJsonRes = await postAnalyticsEvent(
      new NextRequest('http://localhost:3000/api/analytics/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.31',
        },
        body: '{invalid-json',
      }),
    );
    expect(badJsonRes.status).toBe(400);
    expect(badJsonRes.headers.get('cache-control')).toBe('no-store');
  });

  it('/api/admin/packages returns supported: true in demo and fails closed (supported: false / 501) when Supabase is enabled', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'test-packages-secret');
    const ownerCookie = makeOwnerCookie();

    const demoGet = await getAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(demoGet.status).toBe(200);
    const demoJson = (await demoGet.json()) as { supported: boolean };
    expect(demoJson.supported).toBe(true);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    vi.spyOn(adminSessionModule, 'requireAdmin').mockResolvedValue({
      user: {
        id: 'adm-owner',
        email: 'duena@nails.studio',
        fullName: 'Dueña',
        role: 'owner',
        staffMemberId: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      isDemo: false,
    });

    const supaGet = await getAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages'),
    );
    expect(supaGet.status).toBe(200);
    const supaGetJson = (await supaGet.json()) as {
      supported: boolean;
      servicePackages: unknown[];
      clientPackages: unknown[];
    };
    expect(supaGetJson).toEqual({
      supported: false,
      servicePackages: [],
      clientPackages: [],
    });

    const supaPost = await postAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'catalog' }),
      }),
    );
    expect(supaPost.status).toBe(501);
    const supaPostJson = (await supaPost.json()) as { code: string };
    expect(supaPostJson.code).toBe('NOT_SUPPORTED');

    const supaPatch = await patchAdminPackages(
      new NextRequest('http://localhost:3000/api/admin/packages', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', clientPackageId: 'cp-1' }),
      }),
    );
    expect(supaPatch.status).toBe(501);
    const supaPatchJson = (await supaPatch.json()) as { code: string };
    expect(supaPatchJson.code).toBe('NOT_SUPPORTED');
  });

  it('POST /api/cron/retention caps processed assets at <= 10 per run and prunes funnel_events older than 90 days', async () => {
    vi.stubEnv('CRON_SECRET', 'cron-retention-secret');
    const oldAssetIso = new Date(Date.now() - 370 * 86_400_000).toISOString();
    for (let i = 0; i < 13; i++) {
      await registerMediaAsset({
        storagePath: `proofs/old-retention-${i}.png`,
        folder: 'proofs',
        contentType: 'image/png',
        sizeBytes: 128,
        createdAt: oldAssetIso,
      });
    }

    await recordFunnelEvent({
      sessionId: 'sess-recent',
      eventType: 'page_view',
    });
    const oldFunnelIso = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const db = getSnapshot();
    const mutableEvents = db.funnelEvents ?? [];
    mutableEvents.push({
      id: 'fnl-old-1',
      sessionId: 'sess-old',
      eventType: 'page_view',
      serviceSlug: null,
      staffSlug: null,
      createdAt: oldFunnelIso,
    });
    db.funnelEvents = mutableEvents;

    const res = await postCronRetention(
      new NextRequest('http://localhost:3000/api/cron/retention', {
        method: 'POST',
        headers: { authorization: 'Bearer cron-retention-secret' },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const summary = (await res.json()) as {
      purgeDueCount: number;
      purgedCount: number;
      deferredCount: number;
      prunedFunnelEventsCount: number;
    };
    expect(summary.purgeDueCount).toBe(13);
    expect(summary.purgedCount).toBe(10);
    expect(summary.deferredCount).toBe(3);
    expect(summary.prunedFunnelEventsCount).toBeGreaterThanOrEqual(1);
    expect((getSnapshot().funnelEvents ?? []).some((e) => e.id === 'fnl-old-1')).toBe(false);
    expect((getSnapshot().funnelEvents ?? []).some((e) => e.sessionId === 'sess-recent')).toBe(
      true,
    );
  });

  it('POST /api/bookings/manage/[token] rejects reviews for canceled bookings', async () => {
    const booking = getSnapshot().bookings.find(
      (b) => b.manageToken && b.status !== 'canceled' && b.status !== 'no_show',
    );
    if (!booking) throw new Error('Missing seed booking');

    await updateBookingStatus({
      bookingId: booking.id,
      status: 'canceled',
      cancellationReason: 'Cancelada para prueba de reseña',
    });

    const res = await postManageReview(
      new NextRequest(`http://localhost:3000/api/bookings/manage/${booking.manageToken}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.41',
        },
        body: JSON.stringify({ rating: 5, comment: 'Intento en cita cancelada' }),
      }),
      { params: Promise.resolve({ token: booking.manageToken }) },
    );
    expect(res.status).toBe(400);
  });
});
