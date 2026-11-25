import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
} from '@/lib/auth/admin-session';
import { verifyMetaWebhookSignature } from '@/lib/integrations/whatsapp-booking';
import { renderBookingEmailHtml } from '@/lib/integrations/notifications';
import { zonedDateTimeToUtc } from '@/lib/availability/engine';
import { getDateKeyInTimezone } from '@/lib/format';
import { addCashEntry, getSnapshot, queryAvailability } from '@/lib/repositories/db';
import {
  DELETE as deleteAdminSession,
  GET as getAdminSessionRoute,
  POST as postAdminSession,
} from '@/app/api/admin/session/route';
import {
  GET as getAdminBookings,
  PATCH as patchAdminBookings,
  POST as postAdminBookings,
} from '@/app/api/admin/bookings/route';
import { GET as getAdminOperations } from '@/app/api/admin/operations/route';
import { GET as getAdminOverview } from '@/app/api/admin/overview/route';
import { GET as getAdminAvailability } from '@/app/api/admin/availability/route';
import { GET as getPublicAvailability } from '@/app/api/availability/route';
import { POST as postWhatsAppSimulate } from '@/app/api/admin/integrations/whatsapp-simulate/route';
import { POST as postPublicBooking } from '@/app/api/bookings/route';
import { POST as postSlotHold } from '@/app/api/slot-holds/route';
import { GET as getMediaFile } from '@/app/api/media/[...path]/route';
import { CLIENT_SESSION_COOKIE } from '@/lib/auth/client-session';
import {
  GET as getWhatsAppWebhook,
  POST as postWhatsAppWebhook,
} from '@/app/api/webhooks/whatsapp/route';
import { GET as getGoogleOAuth } from '@/app/api/integrations/google/route';
import { GET as getGoogleOAuthCallback } from '@/app/api/integrations/google/callback/route';
import { POST as postCronReminders } from '@/app/api/cron/reminders/route';
import { GET as getManageBooking } from '@/app/api/bookings/manage/[token]/route';
import { GET as getRealtimeStream } from '@/app/api/realtime/route';
import {
  publishRealtimeEvent,
  subscribeRealtime,
  type PublicRealtimeEvent,
} from '@/lib/realtime';
import { isSupabaseEnabled } from '@/lib/repositories/supabase-client';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-security-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function makeRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): NextRequest {
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body,
  });
}

function getOwnerCookieHeader(): string {
  const owner = getSnapshot().adminUsers.find((u) => u.role === 'owner' && u.isActive);
  if (!owner) throw new Error('Missing seed owner');
  const token = createAdminSessionToken(owner);
  if (!token) throw new Error('Expected signed owner token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function getSpecialistCookieHeader(): string {
  const specialist = getSnapshot().adminUsers.find(
    (u) => u.role === 'specialist' && u.isActive,
  );
  if (!specialist) throw new Error('Missing seed specialist');
  const token = createAdminSessionToken(specialist);
  if (!token) throw new Error('Expected signed specialist token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function getAdminCookieHeader(): string {
  const admin = getSnapshot().adminUsers.find((u) => u.role === 'admin' && u.isActive);
  if (!admin) throw new Error('Missing seed admin');
  const token = createAdminSessionToken(admin);
  if (!token) throw new Error('Expected signed admin token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  resetIsolatedDb();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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

describe('Phase 0 Security Trust Boundaries (C2–C8)', () => {
  describe('C2 & C3: Signed admin session cookie and fail-closed demo login', () => {
    it('rejects unauthenticated requests, plain legacy email cookies, tampered cookies, and expired tokens', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-c2');

      const unauthRes = await getAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings'),
      );
      expect(unauthRes.status).toBe(401);

      const plainCookieRes = await getAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          headers: { cookie: 'nails_admin_email=duena@nails.studio' },
        }),
      );
      expect(plainCookieRes.status).toBe(401);

      const owner = getSnapshot().adminUsers.find((u) => u.role === 'owner');
      if (!owner) throw new Error('Missing seed owner');
      const validToken = createAdminSessionToken(owner);
      if (!validToken) throw new Error('Expected token');
      const [payloadPart, sigPart] = validToken.split('.');
      if (!payloadPart || !sigPart) throw new Error('Expected two-part token');

      const forgedPayload = Buffer.from(
        JSON.stringify({
          v: 1,
          sub: owner.id,
          email: owner.email,
          role: 'owner',
          exp: Math.floor(Date.now() / 1000) + 999999,
        }),
        'utf8',
      ).toString('base64url');
      const tamperedRes = await getAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          headers: { cookie: `${ADMIN_SESSION_COOKIE}=${forgedPayload}.${sigPart}` },
        }),
      );
      expect(tamperedRes.status).toBe(401);

      const expiredToken = createAdminSessionToken(owner, { ttlSeconds: -10 });
      const expiredRes = await getAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          headers: { cookie: `${ADMIN_SESSION_COOKIE}=${expiredToken ?? ''}` },
        }),
      );
      expect(expiredRes.status).toBe(401);
    });

    it('issues an httpOnly signed session cookie in local demo mode and clears it on DELETE', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-demo');

      const loginRes = await postAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'duena@nails.studio' }),
        }),
      );
      expect(loginRes.status).toBe(200);
      const setCookie = loginRes.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
      expect(setCookie.toLowerCase()).toContain('httponly');
      expect(setCookie.toLowerCase()).toContain('samesite=lax');

      const issuedCookie = loginRes.cookies.get(ADMIN_SESSION_COOKIE)?.value;
      expect(issuedCookie).toBeDefined();
      expect(issuedCookie?.split('.').length).toBe(2);

      const authedRes = await getAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          headers: { cookie: `${ADMIN_SESSION_COOKIE}=${issuedCookie ?? ''}` },
        }),
      );
      expect(authedRes.status).toBe(200);

      const logoutRes = await deleteAdminSession();
      expect(logoutRes.status).toBe(200);
      const clearHeader = logoutRes.headers.get('set-cookie') ?? '';
      expect(clearHeader).toContain(`${ADMIN_SESSION_COOKIE}=`);
      expect(clearHeader).toContain('Max-Age=0');
    });

    it('fails closed in production and when Supabase is configured', async () => {
      const demoCookie = getOwnerCookieHeader();

      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ADMIN_SESSION_SECRET', '');

      const getProdRes = await getAdminSessionRoute(
        makeRequest('http://localhost:3000/api/admin/session', {
          headers: { cookie: demoCookie },
        }),
      );
      expect(getProdRes.status).toBe(200);
      const getProdJson = (await getProdRes.json()) as {
        session: unknown;
        availableDemoUsers: unknown[];
      };
      expect(getProdJson.session).toBeNull();
      expect(getProdJson.availableDemoUsers).toEqual([]);

      const prodBookingsRes = await getAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          headers: { cookie: demoCookie },
        }),
      );
      expect(prodBookingsRes.status).toBe(401);

      const postProdRes = await postAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'duena@nails.studio' }),
        }),
      );
      expect(postProdRes.status).toBe(503);

      vi.unstubAllEnvs();
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo.supabase.co');

      const getSupaRes = await getAdminSessionRoute(
        makeRequest('http://localhost:3000/api/admin/session'),
      );
      const getSupaJson = (await getSupaRes.json()) as {
        availableDemoUsers: unknown[];
      };
      expect(getSupaJson.availableDemoUsers).toEqual([]);

      const postSupaRes = await postAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'duena@nails.studio' }),
        }),
      );
      expect(postSupaRes.status).toBe(503);
    });
  });

  describe('C4: WhatsApp webhook signature enforcement and admin-only simulator', () => {
    it('fails closed on GET verify when WHATSAPP_VERIFY_TOKEN is missing and ignores demo fallback', async () => {
      vi.stubEnv('WHATSAPP_VERIFY_TOKEN', '');

      const missingRes = await getWhatsAppWebhook(
        makeRequest(
          'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nails-demo-verify&hub.challenge=12345',
        ),
      );
      expect(missingRes.status).toBe(403);

      vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'real-verify-token-999');

      const wrongRes = await getWhatsAppWebhook(
        makeRequest(
          'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345',
        ),
      );
      expect(wrongRes.status).toBe(403);

      const validRes = await getWhatsAppWebhook(
        makeRequest(
          'http://localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=real-verify-token-999&hub.challenge=challenge-ok',
        ),
      );
      expect(validRes.status).toBe(200);
      expect(await validRes.text()).toBe('challenge-ok');
    });

    it('rejects unsigned or bypass-header POST webhook requests and accepts valid HMAC signatures', async () => {
      const payload = JSON.stringify({
        simulate: true,
        phone: '+525599887766',
        clientName: 'Atacante',
      });

      vi.stubEnv('WHATSAPP_APP_SECRET', '');
      expect(verifyMetaWebhookSignature(payload, null)).toBe(false);

      const bypassWithoutSecretRes = await postWhatsAppWebhook(
        makeRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-nails-demo-simulate': '1',
          },
          body: payload,
        }),
      );
      expect(bypassWithoutSecretRes.status).toBe(401);

      vi.stubEnv('WHATSAPP_APP_SECRET', 'meta-webhook-secret-xyz');

      const bypassWithSecretRes = await postWhatsAppWebhook(
        makeRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-nails-demo-simulate': '1',
            'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
          },
          body: payload,
        }),
      );
      expect(bypassWithSecretRes.status).toBe(401);

      const validBody = JSON.stringify({ entry: [] });
      const validSig = `sha256=${crypto
        .createHmac('sha256', 'meta-webhook-secret-xyz')
        .update(validBody, 'utf8')
        .digest('hex')}`;
      expect(verifyMetaWebhookSignature(validBody, validSig)).toBe(true);

      const validWebhookRes = await postWhatsAppWebhook(
        makeRequest('http://localhost:3000/api/webhooks/whatsapp', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-hub-signature-256': validSig,
          },
          body: validBody,
        }),
      );
      expect(validWebhookRes.status).toBe(200);
    });

    it('restricts /api/admin/integrations/whatsapp-simulate to owner in non-production only', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-c4');
      const body = JSON.stringify({
        clientName: 'Simulacion Segura',
        phone: '+525512340000',
        serviceId: 'srv-gelish-manicure',
      });

      const unauthRes = await postWhatsAppSimulate(
        makeRequest('http://localhost:3000/api/admin/integrations/whatsapp-simulate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }),
      );
      expect(unauthRes.status).toBe(401);

      const specialistRes = await postWhatsAppSimulate(
        makeRequest('http://localhost:3000/api/admin/integrations/whatsapp-simulate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: getSpecialistCookieHeader(),
          },
          body,
        }),
      );
      expect(specialistRes.status).toBe(403);

      const adminRes = await postWhatsAppSimulate(
        makeRequest('http://localhost:3000/api/admin/integrations/whatsapp-simulate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: getAdminCookieHeader(),
          },
          body,
        }),
      );
      expect(adminRes.status).toBe(403);

      const ownerCookie = getOwnerCookieHeader();
      const ownerDemoRes = await postWhatsAppSimulate(
        makeRequest('http://localhost:3000/api/admin/integrations/whatsapp-simulate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: ownerCookie,
          },
          body,
        }),
      );
      expect(ownerDemoRes.status).toBe(201);

      vi.stubEnv('NODE_ENV', 'production');
      const ownerProdRes = await postWhatsAppSimulate(
        makeRequest('http://localhost:3000/api/admin/integrations/whatsapp-simulate', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: ownerCookie,
          },
          body,
        }),
      );
      expect(ownerProdRes.status).toBe(403);
    });
  });

  describe('C5: Public booking route strips forceConfirmed and source', () => {
    it('ignores forceConfirmed=true and source=manual on services requiring confirmation', async () => {
      const db = getSnapshot();
      const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
      const avail = queryAvailability({
        serviceId: 'srv-acrilico-escultural',
        addonIds: [],
        staffId: 'staff-valeria',
        startDate: today,
        days: 14,
      });
      const openSlot = avail.days.flatMap((d) => d.slots)[0];
      expect(openSlot).toBeDefined();
      if (!openSlot) throw new Error('Expected open slot');

      const res = await postPublicBooking(
        makeRequest('http://localhost:3000/api/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': `sec-c5-${Date.now()}`,
          },
          body: JSON.stringify({
            serviceId: 'srv-acrilico-escultural',
            addonIds: [],
            staffId: openSlot.staffId,
            startAt: openSlot.startAt,
            clientName: 'Clienta Maliciosa',
            clientPhone: '+525577889900',
            forceConfirmed: true,
            source: 'manual',
            role: 'owner',
          }),
        }),
      );
      expect(res.status).toBe(201);
      const json = (await res.json()) as {
        booking: { status: string; source: string };
      };
      expect(json.booking.status).toBe('pending_confirmation');
      expect(json.booking.source).toBe('web');
    });
  });

  describe('C6: Specialist IDOR protection in PATCH /api/admin/bookings', () => {
    it('blocks a specialist from mutating another specialist booking while allowing own booking', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-c6');
      const specialistCookie = getSpecialistCookieHeader();

      const beforeOther = getSnapshot().bookings.find((b) => b.id === 'bk-1001');
      expect(beforeOther?.staffId).toBe('staff-valeria');
      expect(beforeOther?.status).toBe('confirmed');

      const idorRes = await patchAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            cookie: specialistCookie,
          },
          body: JSON.stringify({
            bookingId: 'bk-1001',
            status: 'canceled',
            cancellationReason: 'IDOR attempt',
          }),
        }),
      );
      expect(idorRes.status).toBe(403);

      const afterOther = getSnapshot().bookings.find((b) => b.id === 'bk-1001');
      expect(afterOther?.status).toBe('confirmed');
      expect(afterOther?.cancellationReason).toBeNull();

      const ownRes = await patchAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            cookie: specialistCookie,
          },
          body: JSON.stringify({
            bookingId: 'bk-1002',
            status: 'completed',
            tipCents: 5000,
          }),
        }),
      );
      expect(ownRes.status).toBe(200);
      const updatedOwn = getSnapshot().bookings.find((b) => b.id === 'bk-1002');
      expect(updatedOwn?.status).toBe('completed');
    });
  });

  describe('C7: Google OAuth auth, HMAC state, CSRF cookie, RBAC, and replay protection', () => {
    it('rejects unauthenticated, forged, mismatched, expired, cross-specialist, and replayed OAuth callbacks', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-c7');
      vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client-id');
      vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-google-client-secret');

      const ownerCookie = getOwnerCookieHeader();
      const specialistCookie = getSpecialistCookieHeader();

      const unauthInit = await getGoogleOAuth(
        makeRequest('http://localhost:3000/api/integrations/google?staffId=staff-camila'),
      );
      expect(unauthInit.status).toBe(401);

      const unauthCb = await getGoogleOAuthCallback(
        makeRequest(
          'http://localhost:3000/api/integrations/google/callback?code=abc&state=staff-camila',
        ),
      );
      expect(unauthCb.status).toBe(401);

      const crossSpecialistInit = await getGoogleOAuth(
        makeRequest('http://localhost:3000/api/integrations/google?staffId=staff-valeria', {
          headers: { cookie: specialistCookie },
        }),
      );
      expect(crossSpecialistInit.status).toBe(403);

      const missingParamsCb = await getGoogleOAuthCallback(
        makeRequest('http://localhost:3000/api/integrations/google/callback?code=abc', {
          headers: { cookie: ownerCookie },
        }),
      );
      expect(missingParamsCb.status).toBe(400);

      const forgedRawStateCb = await getGoogleOAuthCallback(
        makeRequest(
          'http://localhost:3000/api/integrations/google/callback?code=abc&state=staff-camila',
          {
            headers: {
              cookie: `${ownerCookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=fake-nonce-value`,
            },
          },
        ),
      );
      expect(forgedRawStateCb.status).toBe(403);
      const camilaBefore = getSnapshot().calendarConnections.find(
        (c) => c.staffId === 'staff-camila',
      );
      expect(camilaBefore?.isConnected).toBe(false);

      const owner = getSnapshot().adminUsers.find((u) => u.role === 'owner');
      if (!owner) throw new Error('Missing seed owner');
      const expiredOAuth = createGoogleOAuthState({
        staffId: 'staff-camila',
        adminId: owner.id,
        ttlSeconds: -5,
      });
      if (!expiredOAuth) throw new Error('Expected expired OAuth state');

      const expiredCb = await getGoogleOAuthCallback(
        makeRequest(
          `http://localhost:3000/api/integrations/google/callback?code=abc&state=${encodeURIComponent(expiredOAuth.state)}`,
          {
            headers: {
              cookie: `${ownerCookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=${expiredOAuth.nonce}`,
            },
          },
        ),
      );
      expect(expiredCb.status).toBe(403);

      const initRes = await getGoogleOAuth(
        makeRequest('http://localhost:3000/api/integrations/google?staffId=staff-camila', {
          headers: { cookie: ownerCookie },
        }),
      );
      expect(initRes.status).toBe(200);
      const initJson = (await initRes.json()) as {
        configured: boolean;
        oauthUrl: string | null;
      };
      expect(initJson.configured).toBe(true);
      expect(initJson.oauthUrl).toBeTruthy();

      const oauthStateParam = new URL(initJson.oauthUrl ?? '').searchParams.get('state');
      const nonceCookie = initRes.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
      expect(oauthStateParam).toBeTruthy();
      expect(nonceCookie).toBeTruthy();

      const wrongAdminCb = await getGoogleOAuthCallback(
        makeRequest(
          `http://localhost:3000/api/integrations/google/callback?code=real-code&state=${encodeURIComponent(oauthStateParam ?? '')}`,
          {
            headers: {
              cookie: `${specialistCookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=${nonceCookie ?? ''}`,
            },
          },
        ),
      );
      expect(wrongAdminCb.status).toBe(403);

      const validCb = await getGoogleOAuthCallback(
        makeRequest(
          `http://localhost:3000/api/integrations/google/callback?code=real-code&state=${encodeURIComponent(oauthStateParam ?? '')}`,
          {
            headers: {
              cookie: `${ownerCookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=${nonceCookie ?? ''}`,
            },
          },
        ),
      );
      expect(validCb.status).toBe(307);
      expect(validCb.headers.get('location')).toContain('/admin/integraciones?google=connected');
      expect(validCb.headers.get('set-cookie') ?? '').toContain('Max-Age=0');

      const camilaAfter = getSnapshot().calendarConnections.find(
        (c) => c.staffId === 'staff-camila',
      );
      expect(camilaAfter?.isConnected).toBe(true);

      const replayCb = await getGoogleOAuthCallback(
        makeRequest(
          `http://localhost:3000/api/integrations/google/callback?code=real-code&state=${encodeURIComponent(oauthStateParam ?? '')}`,
          {
            headers: {
              cookie: `${ownerCookie}; ${GOOGLE_OAUTH_STATE_COOKIE}=${nonceCookie ?? ''}`,
            },
          },
        ),
      );
      expect(replayCb.status).toBe(403);
    });
  });

  describe('C8: Cron reminders fail-closed auth and write-locked persistence across reloads', () => {
    it('fails closed when CRON_SECRET is missing or mismatched', async () => {
      vi.stubEnv('CRON_SECRET', '');

      const unconfiguredRes = await postCronReminders(
        makeRequest('http://localhost:3000/api/cron/reminders', { method: 'POST' }),
      );
      expect(unconfiguredRes.status).toBe(503);

      vi.stubEnv('CRON_SECRET', 'super-secret-cron-token');

      const missingAuthRes = await postCronReminders(
        makeRequest('http://localhost:3000/api/cron/reminders', { method: 'POST' }),
      );
      expect(missingAuthRes.status).toBe(401);

      const wrongAuthRes = await postCronReminders(
        makeRequest('http://localhost:3000/api/cron/reminders', {
          method: 'POST',
          headers: { authorization: 'Bearer wrong-cron-token' },
        }),
      );
      expect(wrongAuthRes.status).toBe(401);
    });

    it('persists processed reminder status and sentAt to disk across cache reloads without duplicates', async () => {
      vi.stubEnv('CRON_SECRET', 'super-secret-cron-token');

      const pastIso = new Date(Date.now() - 60_000).toISOString();
      const db = getSnapshot();
      const testNotificationIds = ['ntf-sec-24h', 'ntf-sec-2h', 'ntf-sec-retouch'];
      db.notifications.unshift(
        {
          id: 'ntf-sec-24h',
          bookingId: 'bk-1001',
          workflowId: 'wf-24h',
          channel: 'whatsapp',
          recipient: '+525541239876',
          scheduledFor: pastIso,
          status: 'pending',
          subject: 'Recordatorio 24h',
          previewText: 'Recordatorio 24h test',
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          createdAt: pastIso,
        },
        {
          id: 'ntf-sec-2h',
          bookingId: 'bk-1001',
          workflowId: 'wf-2h',
          channel: 'whatsapp',
          recipient: '+525541239876',
          scheduledFor: pastIso,
          status: 'pending',
          subject: 'Recordatorio 2h',
          previewText: 'Recordatorio 2h test',
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          createdAt: pastIso,
        },
        {
          id: 'ntf-sec-retouch',
          bookingId: 'bk-1000',
          workflowId: 'wf-retoque',
          channel: 'whatsapp',
          recipient: '+525521098834',
          scheduledFor: pastIso,
          status: 'pending',
          subject: 'Recordatorio retoque',
          previewText: 'Recordatorio retoque test',
          providerMessageId: null,
          errorMessage: null,
          sentAt: null,
          createdAt: pastIso,
        },
      );

      const firstRunRes = await postCronReminders(
        makeRequest('http://localhost:3000/api/cron/reminders', {
          method: 'POST',
          headers: { authorization: 'Bearer super-secret-cron-token' },
        }),
      );
      expect(firstRunRes.status).toBe(200);
      const firstRunJson = (await firstRunRes.json()) as {
        processed: number;
        sentCount: number;
        failedCount: number;
      };
      expect(firstRunJson.processed).toBe(3);
      expect(firstRunJson.sentCount).toBe(3);
      expect(firstRunJson.failedCount).toBe(0);

      globalThis.nailsDbCache = undefined;
      const reloaded = getSnapshot();
      for (const id of testNotificationIds) {
        const persisted = reloaded.notifications.find((n) => n.id === id);
        expect(persisted?.status).toBe('sent');
        expect(persisted?.sentAt).toBeTruthy();
        expect(persisted?.providerMessageId).toBeTruthy();
      }

      const secondRunRes = await postCronReminders(
        makeRequest('http://localhost:3000/api/cron/reminders', {
          method: 'POST',
          headers: { authorization: 'Bearer super-secret-cron-token' },
        }),
      );
      expect(secondRunRes.status).toBe(200);
      const secondRunJson = (await secondRunRes.json()) as {
        processed: number;
        sentCount: number;
      };
      expect(secondRunJson.processed).toBe(0);
      expect(secondRunJson.sentCount).toBe(0);
    });
  });

  describe('Wave 2: D2 409, S1 HTML escaping, S2 CSV, S4 diagnose/manageToken, Admin overview & manual booking', () => {
    it('D2: returns 409 INVALID_TRANSITION on PATCH /api/admin/bookings for illegal state transitions', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-w2-d2');
      const ownerCookie = getOwnerCookieHeader();

      const invalidCompletedRes = await patchAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            cookie: ownerCookie,
          },
          body: JSON.stringify({
            bookingId: 'bk-1000',
            status: 'canceled',
          }),
        }),
      );
      expect(invalidCompletedRes.status).toBe(409);
      const invalidJson = (await invalidCompletedRes.json()) as { code: string };
      expect(invalidJson.code).toBe('INVALID_TRANSITION');
    });

    it('S1: escapes HTML/XSS payloads in booking email templates and blocks javascript: URLs', () => {
      const html = renderBookingEmailHtml({
        salonName: 'Nails <script>alert(1)</script> & Co',
        bodyText: 'Hola <img src=x onerror=alert(1)>\nTu cita está confirmada',
        manageUrl: 'javascript:alert(document.cookie)',
        address: 'Calle "Principal" <b onclick=evil()>',
      });

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<img ');
      expect(html).not.toContain('javascript:');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;<br/>Tu cita está confirmada');
      expect(html).toContain('href="#"');
      expect(html).toContain('&quot;Principal&quot; &lt;b onclick=evil()&gt;');
    });

    it('S2: protects CSV export with RBAC and escapes commas, quotes, and Excel formulas', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-w2-s2');

      const unauthRes = await getAdminOperations(
        makeRequest('http://localhost:3000/api/admin/operations?export=csv'),
      );
      expect(unauthRes.status).toBe(401);

      const specialistRes = await getAdminOperations(
        makeRequest('http://localhost:3000/api/admin/operations?export=csv', {
          headers: { cookie: getSpecialistCookieHeader() },
        }),
      );
      expect(specialistRes.status).toBe(403);

      await addCashEntry({
        bookingId: null,
        staffId: null,
        entryType: 'expense',
        description: '=HYPERLINK("https://evil.example","Click"), "promo"',
        amountCents: 10000,
        tipCents: 0,
        commissionCents: 0,
        paymentMethod: 'cash',
        recordedBy: '+cmd|calc',
      });

      const ownerRes = await getAdminOperations(
        makeRequest('http://localhost:3000/api/admin/operations?export=csv', {
          headers: { cookie: getOwnerCookieHeader() },
        }),
      );
      expect(ownerRes.status).toBe(200);
      const csvText = await ownerRes.text();
      expect(csvText).toContain('"\'=HYPERLINK(""https://evil.example"",""Click""), ""promo"""');
      expect(csvText).toContain("'+cmd|calc");
    });

    it('enforces requireAdmin on GET /api/admin/overview', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-w2-ov');

      const unauthRes = await getAdminOverview(
        makeRequest('http://localhost:3000/api/admin/overview'),
      );
      expect(unauthRes.status).toBe(401);

      const authedRes = await getAdminOverview(
        makeRequest('http://localhost:3000/api/admin/overview', {
          headers: { cookie: getOwnerCookieHeader() },
        }),
      );
      expect(authedRes.status).toBe(200);
    });

    it('S4: blocks public diagnose and raw ignoreBookingId, supports manageToken, and enforces admin diagnose RBAC', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-w2-s4');

      const publicDiagRes = await getPublicAvailability(
        makeRequest('http://localhost:3000/api/availability?mode=diagnose&staffId=staff-valeria'),
      );
      expect(publicDiagRes.status).toBe(403);

      const db = getSnapshot();
      const sofiaBooking = db.bookings.find((b) => b.id === 'bk-1001');
      if (!sofiaBooking) throw new Error('Expected bk-1001');
      const sofiaDate = getDateKeyInTimezone(
        new Date(sofiaBooking.startAt),
        db.settings.timezone,
      );

      const rawIgnoreRes = await getPublicAvailability(
        makeRequest(
          `http://localhost:3000/api/availability?serviceId=${sofiaBooking.serviceId}&staffId=${sofiaBooking.staffId}&startDate=${sofiaDate}&days=1&ignoreBookingId=${sofiaBooking.id}`,
        ),
      );
      expect(rawIgnoreRes.status).toBe(200);
      const rawIgnoreJson = (await rawIgnoreRes.json()) as {
        days: Array<{ slots: Array<{ startAt: string }> }>;
      };
      const rawHasSofiaSlot = rawIgnoreJson.days
        .flatMap((d) => d.slots)
        .some((s) => s.startAt === sofiaBooking.startAt);
      expect(rawHasSofiaSlot).toBe(false);

      const manageTokenRes = await getPublicAvailability(
        makeRequest(
          `http://localhost:3000/api/availability?serviceId=${sofiaBooking.serviceId}&staffId=${sofiaBooking.staffId}&startDate=${sofiaDate}&days=1&manageToken=${encodeURIComponent(sofiaBooking.manageToken)}`,
        ),
      );
      expect(manageTokenRes.status).toBe(200);
      const manageTokenJson = (await manageTokenRes.json()) as {
        days: Array<{ slots: Array<{ startAt: string }> }>;
      };
      const tokenHasSofiaSlot = manageTokenJson.days
        .flatMap((d) => d.slots)
        .some((s) => s.startAt === sofiaBooking.startAt);
      expect(tokenHasSofiaSlot).toBe(true);

      const unauthAdminDiag = await getAdminAvailability(
        makeRequest(
          `http://localhost:3000/api/admin/availability?mode=diagnose&serviceId=srv-gelish-manicure&date=${sofiaDate}&staffId=staff-valeria`,
        ),
      );
      expect(unauthAdminDiag.status).toBe(401);

      const crossSpecDiag = await getAdminAvailability(
        makeRequest(
          `http://localhost:3000/api/admin/availability?mode=diagnose&serviceId=srv-gelish-manicure&date=${sofiaDate}&staffId=staff-valeria`,
          { headers: { cookie: getSpecialistCookieHeader() } },
        ),
      );
      expect(crossSpecDiag.status).toBe(403);

      const ownerDiag = await getAdminAvailability(
        makeRequest(
          `http://localhost:3000/api/admin/availability?mode=diagnose&serviceId=srv-gelish-manicure&date=${sofiaDate}&staffId=staff-valeria`,
          { headers: { cookie: getOwnerCookieHeader() } },
        ),
      );
      expect(ownerDiag.status).toBe(200);
      const ownerDiagJson = (await ownerDiag.json()) as {
        date: string;
        diagnosis: unknown[];
      };
      expect(ownerDiagJson.date).toBe(sofiaDate);
      expect(ownerDiagJson.diagnosis.length).toBeGreaterThan(0);
    });

    it('enforces RBAC and D1 on POST /api/admin/bookings for manual/walk-in bookings', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-w2-manual');
      const db = getSnapshot();
      const tz = db.settings.timezone;
      const today = getDateKeyInTimezone(new Date(), tz);
      const valeriaSlot = queryAvailability({
        serviceId: 'srv-acrilico-escultural',
        addonIds: [],
        staffId: 'staff-valeria',
        startDate: today,
        days: 14,
      }).days.flatMap((d) => d.slots)[0];
      const camilaSlot = queryAvailability({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-camila',
        startDate: today,
        days: 14,
      }).days.flatMap((d) => d.slots)[0];
      if (!valeriaSlot || !camilaSlot) throw new Error('Expected open slots');

      const unauthRes = await postAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            serviceId: 'srv-acrilico-escultural',
            staffId: valeriaSlot.staffId,
            startAt: valeriaSlot.startAt,
            clientName: 'Sin Auth',
            clientPhone: '+525500112233',
          }),
        }),
      );
      expect(unauthRes.status).toBe(401);

      const crossSpecialistRes = await postAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: getSpecialistCookieHeader(),
          },
          body: JSON.stringify({
            serviceId: 'srv-acrilico-escultural',
            staffId: 'staff-valeria',
            startAt: valeriaSlot.startAt,
            clientName: 'Otra Especialista',
            clientPhone: '+525500112234',
          }),
        }),
      );
      expect(crossSpecialistRes.status).toBe(403);

      const ownerWalkInRes = await postAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: getOwnerCookieHeader(),
          },
          body: JSON.stringify({
            serviceId: 'srv-acrilico-escultural',
            staffId: valeriaSlot.staffId,
            startAt: valeriaSlot.startAt,
            clientName: 'Walk In Confirmada',
            clientPhone: '+525500112235',
            source: 'walk_in',
            forceConfirmed: true,
          }),
        }),
      );
      expect(ownerWalkInRes.status).toBe(201);
      const walkInJson = (await ownerWalkInRes.json()) as {
        booking: { status: string; source: string };
      };
      expect(walkInJson.booking.status).toBe('confirmed');
      expect(walkInJson.booking.source).toBe('walk_in');

      const specialistOwnRes = await postAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: getSpecialistCookieHeader(),
          },
          body: JSON.stringify({
            serviceId: 'srv-gelish-manicure',
            staffId: 'staff-camila',
            startAt: camilaSlot.startAt,
            clientName: 'Manual Propia',
            clientPhone: '+525500112236',
          }),
        }),
      );
      expect(specialistOwnRes.status).toBe(201);

      const futureValeriaDay = queryAvailability({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
        startDate: today,
        days: 14,
      }).days.find((d) => d.date > today && d.slots.length > 0);
      if (!futureValeriaDay) throw new Error('Expected future open day');
      const threeAmRes = await postAdminBookings(
        makeRequest('http://localhost:3000/api/admin/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: getOwnerCookieHeader(),
          },
          body: JSON.stringify({
            serviceId: 'srv-gelish-manicure',
            staffId: 'staff-valeria',
            startAt: zonedDateTimeToUtc(futureValeriaDay.date, '03:00', tz).toISOString(),
            clientName: 'Madrugada Admin',
            clientPhone: '+525500112237',
          }),
        }),
      );
      expect(threeAmRes.status).toBe(400);
      const threeAmJson = (await threeAmRes.json()) as { code: string };
      expect(threeAmJson.code).toBe('OUTSIDE_HOURS');
    });
  });

  describe('Phase 1 Wave 1: Non-PII realtime (S6), /cita/[token] DTO, and Supabase Auth (C1)', () => {
    it('S6: strips all PII from realtime broadcasts and SSE events', async () => {
      const received: PublicRealtimeEvent[] = [];
      const unsubscribe = subscribeRealtime((evt) => {
        received.push(evt);
      });

      const sseRes = await getRealtimeStream();
      const reader = sseRes.body?.getReader();
      if (!reader) throw new Error('Expected SSE reader');
      const decoder = new TextDecoder();

      try {
        const firstChunk = await reader.read();
        const firstText = decoder.decode(firstChunk.value);
        expect(firstText).toContain('"type":"connected"');

        const emitted = publishRealtimeEvent('booking_created', {
          bookingId: 'bk-secret-999',
          bookingCode: 'NL-9999',
          clientName: 'Clienta Privada',
          clientPhone: '+525500001234',
          clientEmail: 'privada@ejemplo.mx',
          staffId: 'staff-valeria',
          startAt: '2026-12-01T16:00:00.000Z',
        });

        expect(emitted.type).toBe('slot_changed');
        expect(emitted.staffId).toBe('staff-valeria');
        expect(emitted.date).toBe('2026-12-01');
        expect(Object.keys(emitted).sort()).toEqual(['date', 'staffId', 'timestamp', 'type']);

        expect(received).toHaveLength(1);
        const serialized = JSON.stringify(received[0]);
        expect(serialized).not.toContain('bk-secret-999');
        expect(serialized).not.toContain('NL-9999');
        expect(serialized).not.toContain('Clienta Privada');
        expect(serialized).not.toContain('+525500001234');
        expect(serialized).not.toContain('privada@ejemplo.mx');

        const nextChunk = await reader.read();
        const nextText = decoder.decode(nextChunk.value);
        expect(nextText).toContain('"type":"slot_changed"');
        expect(nextText).not.toContain('Clienta Privada');
        expect(nextText).not.toContain('NL-9999');
      } finally {
        unsubscribe();
        await reader.cancel();
      }
    });

    it('omits commissionPercent, defaultCommissionPercent, and internalNotes from /api/bookings/manage/[token]', async () => {
      const res = await getManageBooking(
        makeRequest('http://localhost:3000/api/bookings/manage/demo-token-sofia-1042'),
        { params: Promise.resolve({ token: 'demo-token-sofia-1042' }) },
      );
      expect(res.status).toBe(200);
      const rawText = await res.text();
      expect(rawText).not.toContain('commissionPercent');
      expect(rawText).not.toContain('defaultCommissionPercent');
      expect(rawText).not.toContain('Usar base milky #04.');
      const parsed = JSON.parse(rawText) as {
        booking: { staff: Record<string, unknown>; internalNotes: string };
        settings: Record<string, unknown>;
      };
      expect('commissionPercent' in parsed.booking.staff).toBe(false);
      expect('defaultCommissionPercent' in parsed.settings).toBe(false);
      expect(parsed.booking.internalNotes).toBe('');
    });

    it('C1: authenticates against Supabase Auth + active admin_users and never trusts demo cookies when Supabase is enabled', async () => {
      vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-secret-c1');
      const demoOwnerCookie = getOwnerCookieHeader();

      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock-nails.supabase.co');
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      expect(isSupabaseEnabled()).toBe(false);

      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'mock-anon-key');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-service-role-key');
      expect(isSupabaseEnabled()).toBe(true);

      const missingPasswordRes = await postAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'duena@nails.studio' }),
        }),
      );
      expect(missingPasswordRes.status).toBe(400);

      let activeAdminRow: Record<string, unknown> | null = {
        id: 'adm-supa-1',
        email: 'duena@nails.studio',
        full_name: 'Valeria Supabase',
        role: 'owner',
        staff_member_id: 'staff-valeria',
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
      };
      let signOutCalled = false;

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.includes('/auth/v1/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'mock-access-jwt',
              token_type: 'bearer',
              expires_in: 3600,
              refresh_token: 'mock-refresh-token',
              user: {
                id: 'auth-uid-owner-1',
                aud: 'authenticated',
                email: 'duena@nails.studio',
                app_metadata: {},
                user_metadata: {},
                created_at: '2026-01-01T00:00:00.000Z',
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url.includes('/auth/v1/user')) {
          const reqHeaders = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : undefined),
          );
          const authHeader = reqHeaders.get('authorization');
          if (authHeader === 'Bearer mock-access-jwt') {
            return new Response(
              JSON.stringify({
                id: 'auth-uid-owner-1',
                aud: 'authenticated',
                email: 'duena@nails.studio',
                app_metadata: {},
                user_metadata: {},
                created_at: '2026-01-01T00:00:00.000Z',
              }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            );
          }
          return new Response(
            JSON.stringify({ error: 'invalid_token', msg: 'Missing session' }),
            { status: 401, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url.includes('/auth/v1/logout')) {
          signOutCalled = true;
          return new Response(null, { status: 204 });
        }

        if (url.includes('/rest/v1/admin_users')) {
          return new Response(JSON.stringify(activeAdminRow), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
      });

      const demoCookieRejectedRes = await getAdminSessionRoute(
        makeRequest('http://localhost:3000/api/admin/session', {
          headers: { cookie: demoOwnerCookie },
        }),
      );
      expect(demoCookieRejectedRes.status).toBe(200);
      const demoRejectedJson = (await demoCookieRejectedRes.json()) as {
        session: unknown;
        availableDemoUsers: unknown[];
      };
      expect(demoRejectedJson.session).toBeNull();
      expect(demoRejectedJson.availableDemoUsers).toEqual([]);

      const supaLoginRes = await postAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'duena@nails.studio',
            password: 'correct-horse-battery',
          }),
        }),
      );
      expect(supaLoginRes.status).toBe(200);
      const supaLoginJson = (await supaLoginRes.json()) as {
        session: { user: { id: string; role: string }; isDemo: boolean };
      };
      expect(supaLoginJson.session.isDemo).toBe(false);
      expect(supaLoginJson.session.user.id).toBe('adm-supa-1');
      expect(supaLoginJson.session.user.role).toBe('owner');

      const issuedSupabaseCookieHeader = supaLoginRes.headers
        .getSetCookie()
        .map((c) => c.split(';')[0] ?? '')
        .filter((pair) => pair.startsWith('sb-'))
        .join('; ');
      expect(issuedSupabaseCookieHeader).toContain('sb-');

      const authedSessionRes = await getAdminSessionRoute(
        makeRequest('http://localhost:3000/api/admin/session', {
          headers: { cookie: issuedSupabaseCookieHeader },
        }),
      );
      expect(authedSessionRes.status).toBe(200);
      const authedSessionJson = (await authedSessionRes.json()) as {
        session: { user: { id: string; role: string }; isDemo: boolean } | null;
      };
      expect(authedSessionJson.session?.isDemo).toBe(false);
      expect(authedSessionJson.session?.user.id).toBe('adm-supa-1');

      activeAdminRow = null;
      const nonAdminLoginRes = await postAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: 'cliente@nails.studio',
            password: 'valid-supabase-password',
          }),
        }),
      );
      expect(nonAdminLoginRes.status).toBe(401);
      expect(nonAdminLoginRes.headers.get('set-cookie') ?? '').not.toContain('sb-');

      signOutCalled = false;
      const logoutRes = await deleteAdminSession(
        makeRequest('http://localhost:3000/api/admin/session', {
          method: 'DELETE',
          headers: { cookie: issuedSupabaseCookieHeader },
        }),
      );
      expect(logoutRes.status).toBe(200);
      expect(signOutCalled).toBe(true);
    });

    it('S7 & A7: /api/slot-holds sets HttpOnly nails_client_session cookie and /api/bookings enforces hold ownership via cookie', async () => {
      vi.stubEnv('CLIENT_SESSION_SECRET', 'test-client-secret-s7');
      const db = getSnapshot();
      const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
      const avail = queryAvailability({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-camila',
        startDate: today,
        days: 14,
      });
      const openSlot = avail.days.flatMap((d) => d.slots)[0];
      if (!openSlot) throw new Error('Expected open slot');

      const holdRes = await postSlotHold(
        makeRequest('http://localhost:3000/api/slot-holds', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            serviceId: 'srv-gelish-manicure',
            addonIds: [],
            staffId: openSlot.staffId,
            startAt: openSlot.startAt,
          }),
        }),
      );
      expect(holdRes.status).toBe(200);
      const setCookieHeader = holdRes.headers.get('set-cookie') ?? '';
      expect(setCookieHeader).toContain(`${CLIENT_SESSION_COOKIE}=`);
      expect(setCookieHeader).toContain('HttpOnly');
      expect(setCookieHeader).toContain('SameSite=Lax');

      const holdRawText = await holdRes.text();
      expect(holdRawText).not.toContain('sessionToken');
      const holdJson = JSON.parse(holdRawText) as {
        hold: Record<string, unknown> & { id: string; holdId: string };
        holdId: string;
      };
      expect('sessionToken' in holdJson.hold).toBe(false);
      expect(holdJson.holdId).toBe(holdJson.hold.id);

      const secondSessionBookingRes = await postPublicBooking(
        makeRequest('http://localhost:3000/api/bookings', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            serviceId: 'srv-gelish-manicure',
            addonIds: [],
            staffId: openSlot.staffId,
            startAt: openSlot.startAt,
            clientName: 'Otra Clienta',
            clientPhone: '+525588990011',
            holdId: holdJson.holdId,
            sessionToken: 'forged-other-session',
          }),
        }),
      );
      expect(secondSessionBookingRes.status).toBe(409);

      const clientCookiePair = setCookieHeader.split(';')[0] ?? '';
      const ownerBookingRes = await postPublicBooking(
        makeRequest('http://localhost:3000/api/bookings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: clientCookiePair,
          },
          body: JSON.stringify({
            serviceId: 'srv-gelish-manicure',
            addonIds: [],
            staffId: openSlot.staffId,
            startAt: openSlot.startAt,
            clientName: 'Clienta Con Cookie',
            clientPhone: '+525588990022',
            holdId: holdJson.holdId,
          }),
        }),
      );
      expect(ownerBookingRes.status).toBe(201);
    });

    it('A5: stores base64 inspo photo to disk as /api/media/... URL and blocks path traversal on /api/media', async () => {
      const tempUploadsDir = path.join(
        os.tmpdir(),
        `nails-sec-media-${process.pid}-${crypto.randomUUID()}`,
      );
      vi.stubEnv('NAILS_DEMO_UPLOADS_DIR', tempUploadsDir);

      try {
        const pngBytes = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        ]);
        const validPngDataUrl = `data:image/png;base64,${pngBytes.toString('base64')}`;
        const spoofedSvgDataUrl = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)/>', 'utf8').toString('base64')}`;

        const db = getSnapshot();
        const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
        const openSlot = queryAvailability({
          serviceId: 'srv-gelish-manicure',
          addonIds: [],
          staffId: 'staff-valeria',
          startDate: today,
          days: 14,
        }).days.flatMap((d) => d.slots)[0];
        if (!openSlot) throw new Error('Expected open slot');

        const spoofedRes = await postPublicBooking(
          makeRequest('http://localhost:3000/api/bookings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              serviceId: 'srv-gelish-manicure',
              addonIds: [],
              staffId: openSlot.staffId,
              startAt: openSlot.startAt,
              clientName: 'Spoofed Upload',
              clientPhone: '+525599001122',
              inspoPhotoUrl: spoofedSvgDataUrl,
            }),
          }),
        );
        expect(spoofedRes.status).toBe(400);

        const badSchemeRes = await postPublicBooking(
          makeRequest('http://localhost:3000/api/bookings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              serviceId: 'srv-gelish-manicure',
              addonIds: [],
              staffId: openSlot.staffId,
              startAt: openSlot.startAt,
              clientName: 'Bad Scheme',
              clientPhone: '+525599001123',
              inspoPhotoUrl: 'javascript:alert(1)',
            }),
          }),
        );
        expect(badSchemeRes.status).toBe(400);

        const validRes = await postPublicBooking(
          makeRequest('http://localhost:3000/api/bookings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              serviceId: 'srv-gelish-manicure',
              addonIds: [],
              staffId: openSlot.staffId,
              startAt: openSlot.startAt,
              clientName: 'Foto Real',
              clientPhone: '+525599001133',
              inspoPhotoUrl: validPngDataUrl,
            }),
          }),
        );
        expect(validRes.status).toBe(201);
        const validJson = (await validRes.json()) as {
          booking: { id: string; inspoPhotoUrl: string | null };
        };
        expect(validJson.booking.inspoPhotoUrl).toMatch(
          /^\/api\/media\/inspo\/[0-9a-f-]+\.png$/i,
        );
        expect(validJson.booking.inspoPhotoUrl).not.toContain('data:');

        const persistedRaw = fs.readFileSync(TEMP_DB_PATH, 'utf-8');
        expect(persistedRaw).not.toContain(validPngDataUrl);

        const mediaSegments = (validJson.booking.inspoPhotoUrl ?? '')
          .replace(/^\/api\/media\//, '')
          .split('/');
        const streamRes = await getMediaFile(
          makeRequest(`http://localhost:3000${validJson.booking.inspoPhotoUrl ?? ''}`),
          { params: Promise.resolve({ path: mediaSegments }) },
        );
        expect(streamRes.status).toBe(200);
        expect(streamRes.headers.get('content-type')).toBe('image/png');
        expect(streamRes.headers.get('x-content-type-options')).toBe('nosniff');
        const streamedBuf = Buffer.from(await streamRes.arrayBuffer());
        expect(streamedBuf.equals(pngBytes)).toBe(true);

        const traversalRes = await getMediaFile(
          makeRequest('http://localhost:3000/api/media/..%2F.env'),
          { params: Promise.resolve({ path: ['..', '.env'] }) },
        );
        expect([400, 403, 404]).toContain(traversalRes.status);

        const nestedTraversalRes = await getMediaFile(
          makeRequest('http://localhost:3000/api/media/inspo/..%2F..%2Fpackage.json'),
          { params: Promise.resolve({ path: ['inspo', '../../package.json'] }) },
        );
        expect([400, 403, 404]).toContain(nestedTraversalRes.status);
      } finally {
        if (fs.existsSync(tempUploadsDir)) {
          fs.rmSync(tempUploadsDir, { recursive: true, force: true });
        }
      }
    });
  });
});
