import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
} from '@/lib/auth/admin-session';
import {
  CLIENT_PORTAL_COOKIE,
  createClientPortalSessionToken,
} from '@/lib/auth/client-portal-otp';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  addCashEntry,
  createBookingAtomic,
  getSnapshot,
  queryAvailability,
  registerMediaAsset,
} from '@/lib/repositories/db';
import { signMediaUrl, storeMediaUpload } from '@/lib/storage/media';
import { GET as getMediaFile } from '@/app/api/media/[...path]/route';
import { POST as postCronRetention } from '@/app/api/cron/retention/route';
import { POST as postCronReminders } from '@/app/api/cron/reminders/route';

const MS_PER_DAY = 86_400_000;
const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const VALID_PNG_DATA_URL = `data:image/png;base64,${VALID_PNG_BYTES.toString('base64')}`;

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-media-auth-db-${process.pid}-${crypto.randomUUID()}.json`,
);
const TEMP_UPLOADS_DIR = path.join(
  os.tmpdir(),
  `nails-media-auth-uploads-${process.pid}-${crypto.randomUUID()}`,
);

let originalDbEnv: string | undefined;
let originalUploadsEnv: string | undefined;

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

function resetDemoState(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  globalThis.nailsDbPersistedToDisk = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
  if (fs.existsSync(TEMP_UPLOADS_DIR)) {
    fs.rmSync(TEMP_UPLOADS_DIR, { recursive: true, force: true });
  }
}

function getRoleCookie(role: 'owner' | 'admin' | 'specialist'): string {
  const user = getSnapshot().adminUsers.find((u) => u.role === role && u.isActive);
  if (!user) throw new Error(`Missing seeded ${role} user`);
  const token = createAdminSessionToken(user);
  if (!token) throw new Error(`Failed to sign ${role} session`);
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function findFirstOpenSlot(staffId: string): { staffId: string; startAt: string } {
  const db = getSnapshot();
  const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
  const avail = queryAvailability({
    serviceId: 'srv-gel-semipermanente-manos',
    addonIds: [],
    staffId,
    startDate: today,
    days: 21,
  });
  const slot = avail.days.flatMap((d) => d.slots)[0];
  if (!slot) throw new Error(`No open slot for ${staffId}`);
  return { staffId: slot.staffId, startAt: slot.startAt };
}

beforeAll(() => {
  originalDbEnv = process.env.NAILS_DEMO_DB_PATH;
  originalUploadsEnv = process.env.NAILS_DEMO_UPLOADS_DIR;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  process.env.NAILS_DEMO_UPLOADS_DIR = TEMP_UPLOADS_DIR;
});

beforeEach(() => {
  resetDemoState();
  vi.stubEnv('ADMIN_SESSION_SECRET', 'media-auth-admin-secret');
  vi.stubEnv('CLIENT_SESSION_SECRET', 'media-auth-client-secret');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDemoState();
});

afterAll(() => {
  resetDemoState();
  if (originalDbEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbEnv;
  }
  if (originalUploadsEnv === undefined) {
    delete process.env.NAILS_DEMO_UPLOADS_DIR;
  } else {
    process.env.NAILS_DEMO_UPLOADS_DIR = originalUploadsEnv;
  }
});

describe('GET /api/media/[...path] private access authorization', () => {
  it('enforces 401/403/200/400 across unauthenticated, wrong-owner, role, token, portal cookie, signed URL, and traversal requests', async () => {
    const karlaSlot = findFirstOpenSlot('staff-karla');
    const karlaBooking = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: karlaSlot.staffId,
      startAt: karlaSlot.startAt,
      clientName: 'Andrea Media Owner',
      clientPhone: '+522221112233',
      privacyConsentAccepted: true,
      paymentProofUrl: VALID_PNG_DATA_URL,
    });

    const tereSlot = findFirstOpenSlot('staff-tere');
    const tereBooking = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: tereSlot.staffId,
      startAt: tereSlot.startAt,
      clientName: 'Valeria Tere Client',
      clientPhone: '+522229998877',
      privacyConsentAccepted: true,
      paymentProofUrl: VALID_PNG_DATA_URL,
    });

    const karlaMediaUrl = karlaBooking.paymentProofUrl ?? '';
    expect(karlaMediaUrl).toMatch(/^\/api\/media\/proofs\/[0-9a-f-]+\.png$/i);
    const karlaStoragePath = karlaMediaUrl.replace(/^\/api\/media\//, '');
    const karlaSegments = karlaStoragePath.split('/');

    const tereMediaUrl = tereBooking.paymentProofUrl ?? '';
    const tereStoragePath = tereMediaUrl.replace(/^\/api\/media\//, '');
    const tereSegments = tereStoragePath.split('/');

    const unauthRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}`),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get('cache-control')).toBe('private, no-store');

    const wrongTokenRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}?token=wrong-token-123`),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(wrongTokenRes.status).toBe(403);
    expect(wrongTokenRes.headers.get('cache-control')).toBe('private, no-store');

    const otherBookingTokenRes = await getMediaFile(
      makeRequest(
        `http://localhost:3000${karlaMediaUrl}?token=${encodeURIComponent(tereBooking.manageToken)}`,
      ),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(otherBookingTokenRes.status).toBe(403);

    const wrongClientPortalToken = createClientPortalSessionToken('+522229998877');
    const wrongClientRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}`, {
        headers: { cookie: `${CLIENT_PORTAL_COOKIE}=${wrongClientPortalToken}` },
      }),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(wrongClientRes.status).toBe(403);

    const wrongSpecialistRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}`, {
        headers: { cookie: getRoleCookie('specialist') },
      }),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(wrongSpecialistRes.status).toBe(403);

    const owningSpecialistRes = await getMediaFile(
      makeRequest(`http://localhost:3000${tereMediaUrl}`, {
        headers: { cookie: getRoleCookie('specialist') },
      }),
      { params: Promise.resolve({ path: tereSegments }) },
    );
    expect(owningSpecialistRes.status).toBe(200);

    const ownerRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}`, {
        headers: { cookie: getRoleCookie('owner') },
      }),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(ownerRes.status).toBe(200);

    const adminRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}`, {
        headers: { cookie: getRoleCookie('admin') },
      }),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(adminRes.status).toBe(200);

    const owningTokenRes = await getMediaFile(
      makeRequest(
        `http://localhost:3000${karlaMediaUrl}?token=${encodeURIComponent(karlaBooking.manageToken)}`,
      ),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(owningTokenRes.status).toBe(200);
    expect(owningTokenRes.headers.get('cache-control')).toBe('private, no-store');
    expect(owningTokenRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(owningTokenRes.headers.get('content-disposition')).toContain('inline');
    expect(Buffer.from(await owningTokenRes.arrayBuffer()).equals(VALID_PNG_BYTES)).toBe(true);

    const owningClientPortalToken = createClientPortalSessionToken('+522221112233');
    const owningClientRes = await getMediaFile(
      makeRequest(`http://localhost:3000${karlaMediaUrl}`, {
        headers: { cookie: `${CLIENT_PORTAL_COOKIE}=${owningClientPortalToken}` },
      }),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(owningClientRes.status).toBe(200);

    const signedPath = signMediaUrl(karlaStoragePath, { ttlSeconds: 3600 });
    expect(signedPath).toBeTruthy();
    const signedRes = await getMediaFile(
      makeRequest(`http://localhost:3000${signedPath ?? ''}`),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(signedRes.status).toBe(200);

    const expiredSignedPath = signMediaUrl(karlaStoragePath, {
      ttlSeconds: 60,
      nowMs: Date.now() - 120_000,
    });
    const expiredRes = await getMediaFile(
      makeRequest(`http://localhost:3000${expiredSignedPath ?? ''}`),
      { params: Promise.resolve({ path: karlaSegments }) },
    );
    expect(expiredRes.status).toBe(401);

    const traversal1 = await getMediaFile(
      makeRequest('http://localhost:3000/api/media/..%2F.env'),
      { params: Promise.resolve({ path: ['..', '.env'] }) },
    );
    expect(traversal1.status).toBe(400);

    const traversal2 = await getMediaFile(
      makeRequest('http://localhost:3000/api/media/proofs/..%2F..%2Fpackage.json'),
      { params: Promise.resolve({ path: ['proofs', '../../package.json'] }) },
    );
    expect(traversal2.status).toBe(400);

    const badFolder = await getMediaFile(
      makeRequest('http://localhost:3000/api/media/secrets/file.png', {
        headers: { cookie: getRoleCookie('owner') },
      }),
      { params: Promise.resolve({ path: ['secrets', 'file.png'] }) },
    );
    expect(badFolder.status).toBe(400);
  });
});

describe('POST /api/cron/retention & POST /api/cron/reminders keep-alive', () => {
  it('enforces CRON_SECRET auth (503 unset, 401 missing/invalid) on /api/cron/retention', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const unsetRes = await postCronRetention(
      makeRequest('http://localhost:3000/api/cron/retention', { method: 'POST' }),
    );
    expect(unsetRes.status).toBe(503);

    vi.stubEnv('CRON_SECRET', 'retention-cron-secret');
    const missingRes = await postCronRetention(
      makeRequest('http://localhost:3000/api/cron/retention', { method: 'POST' }),
    );
    expect(missingRes.status).toBe(401);

    const wrongRes = await postCronRetention(
      makeRequest('http://localhost:3000/api/cron/retention', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(wrongRes.status).toBe(401);
  });

  it('warns at 335d/358d, purges 365d+ storage objects while preserving accounting history, and is strictly idempotent', async () => {
    vi.stubEnv('CRON_SECRET', 'retention-cron-secret');
    const nowMs = Date.now();

    const purgeUpload = await storeMediaUpload({
      buffer: VALID_PNG_BYTES,
      declaredMimeType: 'image/png',
      folder: 'proofs',
    });
    const proofStoragePath = purgeUpload.storagePath;
    const proofDiskPath = path.join(TEMP_UPLOADS_DIR, proofStoragePath);
    expect(fs.existsSync(proofDiskPath)).toBe(true);

    await registerMediaAsset({
      storagePath: proofStoragePath,
      folder: 'proofs',
      bookingId: null,
      clientId: null,
      contentType: 'image/png',
      sizeBytes: purgeUpload.sizeBytes,
      createdAt: new Date(nowMs - 370 * MS_PER_DAY).toISOString(),
    });

    const slot = findFirstOpenSlot('staff-karla');
    const booking = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: slot.staffId,
      startAt: slot.startAt,
      clientName: 'Clienta Contabilidad',
      clientPhone: '+522223334455',
      privacyConsentAccepted: true,
      paymentProofUrl: `/api/media/${proofStoragePath}`,
    });

    const cashEntry = await addCashEntry({
      bookingId: booking.id,
      staffId: booking.staffId,
      entryType: 'deposit',
      description: 'Anticipo SPEI retenido para contabilidad',
      amountCents: 20_000,
      tipCents: 0,
      commissionCents: 0,
      paymentMethod: 'transfer',
      recordedBy: 'duena@nails.studio',
    });

    const freshUpload = await storeMediaUpload({
      buffer: VALID_PNG_BYTES,
      declaredMimeType: 'image/png',
      folder: 'inspo',
    });
    const warn30Upload = await storeMediaUpload({
      buffer: VALID_PNG_BYTES,
      declaredMimeType: 'image/png',
      folder: 'proofs',
    });
    const warn7Upload = await storeMediaUpload({
      buffer: VALID_PNG_BYTES,
      declaredMimeType: 'image/png',
      folder: 'proofs',
    });

    await registerMediaAsset({
      storagePath: freshUpload.storagePath,
      folder: 'inspo',
      bookingId: null,
      clientId: booking.clientId,
      contentType: 'image/png',
      sizeBytes: freshUpload.sizeBytes,
      createdAt: new Date(nowMs - 100 * MS_PER_DAY).toISOString(),
    });
    await registerMediaAsset({
      storagePath: warn30Upload.storagePath,
      folder: 'proofs',
      bookingId: null,
      clientId: booking.clientId,
      contentType: 'image/png',
      sizeBytes: warn30Upload.sizeBytes,
      createdAt: new Date(nowMs - 340 * MS_PER_DAY).toISOString(),
    });
    await registerMediaAsset({
      storagePath: warn7Upload.storagePath,
      folder: 'proofs',
      bookingId: null,
      clientId: booking.clientId,
      contentType: 'image/png',
      sizeBytes: warn7Upload.sizeBytes,
      createdAt: new Date(nowMs - 360 * MS_PER_DAY).toISOString(),
    });

    const firstRes = await postCronRetention(
      makeRequest('http://localhost:3000/api/cron/retention', {
        method: 'POST',
        headers: { authorization: 'Bearer retention-cron-secret' },
      }),
    );
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as {
      warned30dCount: number;
      warned7dCount: number;
      purgedCount: number;
      warningsFailedCount: number;
      purgeFailedCount: number;
    };
    expect(firstJson.warned30dCount).toBe(1);
    expect(firstJson.warned7dCount).toBe(1);
    expect(firstJson.purgedCount).toBe(1);
    expect(firstJson.warningsFailedCount).toBe(0);
    expect(firstJson.purgeFailedCount).toBe(0);

    expect(fs.existsSync(proofDiskPath)).toBe(false);

    const afterDb = getSnapshot();
    const preservedBooking = afterDb.bookings.find((b) => b.id === booking.id);
    expect(preservedBooking).toBeDefined();
    expect(preservedBooking?.paymentProofUrl).toBeNull();
    expect(afterDb.cashEntries.some((c) => c.id === cashEntry.id)).toBe(true);
    expect(afterDb.auditLogs?.some((a) => a.action === 'media_retention_warned')).toBe(true);
    expect(afterDb.auditLogs?.some((a) => a.action === 'media_retention_purged')).toBe(true);

    const secondRes = await postCronRetention(
      makeRequest('http://localhost:3000/api/cron/retention', {
        method: 'POST',
        headers: { authorization: 'Bearer retention-cron-secret' },
      }),
    );
    expect(secondRes.status).toBe(200);
    const secondJson = (await secondRes.json()) as {
      warned30dCount: number;
      warned7dCount: number;
      purgedCount: number;
    };
    expect(secondJson.warned30dCount).toBe(0);
    expect(secondJson.warned7dCount).toBe(0);
    expect(secondJson.purgedCount).toBe(0);
  });

  it('POST /api/cron/reminders cleans expired slot holds and reports dbKeepAlive', async () => {
    vi.stubEnv('CRON_SECRET', 'reminders-cron-secret');
    const nowMs = Date.now();
    const db = getSnapshot();
    db.slotHolds.push({
      id: 'hold-expired-cron-test',
      staffId: 'staff-karla',
      serviceId: 'srv-gel-semipermanente-manos',
      sessionToken: 'expired-session-token',
      startAt: new Date(nowMs + 3_600_000).toISOString(),
      endAt: new Date(nowMs + 7_200_000).toISOString(),
      expiresAt: new Date(nowMs - 60_000).toISOString(),
      createdAt: new Date(nowMs - 360_000).toISOString(),
    });

    const res = await postCronReminders(
      makeRequest('http://localhost:3000/api/cron/reminders', {
        method: 'POST',
        headers: { authorization: 'Bearer reminders-cron-secret' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      cleanedHoldsCount: number;
      dbKeepAlive: boolean;
    };
    expect(json.cleanedHoldsCount).toBeGreaterThanOrEqual(1);
    expect(json.dbKeepAlive).toBe(true);
    expect(getSnapshot().slotHolds.some((h) => h.id === 'hold-expired-cron-test')).toBe(false);
  });
});
