import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAvailability } from '@/app/api/availability/route';
import { POST as postPublicBooking } from '@/app/api/bookings/route';
import { PATCH as patchManageBooking } from '@/app/api/bookings/manage/[token]/route';
import { POST as postSlotHold } from '@/app/api/slot-holds/route';
import { POST as postWaitlist } from '@/app/api/waitlist/route';
import { CLIENT_SESSION_COOKIE } from '@/lib/auth/client-session';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  getRepository,
  getSnapshot,
  queryAvailability,
} from '@/lib/repositories/db';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';

const ONE_PIXEL_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2d8AAAAASUVORK5CYII=';

function makeRequest(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

async function countFilesRecursively(dir: string): Promise<number> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await countFilesRecursively(full);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

describe('Wave 1 public booking API safety (A9 orphan media, A2 offer availability, A8/C4)', () => {
  let tempUploadsDir = '';
  let tempDbPath = '';

  beforeEach(async () => {
    vi.stubEnv('CLIENT_SESSION_SECRET', 'test-wave1-client-session-secret');
    tempUploadsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nails-wave1-media-'));
    tempDbPath = path.join(
      os.tmpdir(),
      `nails-wave1-db-${process.pid}-${crypto.randomUUID()}.json`,
    );
    vi.stubEnv('NAILS_DEMO_UPLOADS_DIR', tempUploadsDir);
    vi.stubEnv('NAILS_DB_PATH', tempDbPath);
    globalThis.nailsDbCache = undefined;
    globalThis.nailsDbCachePath = undefined;
    resetRateLimiterForTests();
  });

  afterEach(async () => {
    globalThis.nailsDbCache = undefined;
    globalThis.nailsDbCachePath = undefined;
    vi.unstubAllEnvs();
    if (tempUploadsDir) {
      await fsp.rm(tempUploadsDir, { recursive: true, force: true });
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  it('A9: creates zero orphan media assets or uploaded files on 409 conflict and idempotency retry', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const openSlot = avail.days
      .filter((day) => day.date > today)
      .flatMap((day) => day.slots)[0];
    if (!openSlot) throw new Error('Expected open slot');

    const initialMediaCount = getSnapshot().mediaAssets?.length ?? 0;
    const idemKey = `wave1-idem-${crypto.randomUUID()}`;

    const firstRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: openSlot.staffId,
          startAt: openSlot.startAt,
          clientName: 'Clienta Con Fotos',
          clientPhone: '+522227771001',
          inspoPhotoUrl: ONE_PIXEL_PNG_DATA_URL,
          paymentProofUrl: ONE_PIXEL_PNG_DATA_URL,
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(firstRes.status).toBe(201);
    const firstJson = (await firstRes.json()) as {
      booking: { id: string; inspoPhotoUrl: string | null; paymentProofUrl: string | null };
    };
    expect(firstJson.booking.inspoPhotoUrl).toMatch(/^\/api\/media\/inspo\//);
    expect(firstJson.booking.paymentProofUrl).toMatch(/^\/api\/media\/proofs\//);

    const assetsAfterFirst = getSnapshot().mediaAssets ?? [];
    expect(assetsAfterFirst.length).toBe(initialMediaCount + 2);
    expect(assetsAfterFirst.filter((a) => a.bookingId === null)).toHaveLength(0);
    expect(
      assetsAfterFirst.filter((a) => a.bookingId === firstJson.booking.id),
    ).toHaveLength(2);
    const filesAfterFirst = await countFilesRecursively(tempUploadsDir);
    expect(filesAfterFirst).toBe(2);

    const replayRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: openSlot.staffId,
          startAt: openSlot.startAt,
          clientName: 'Clienta Con Fotos',
          clientPhone: '+522227771001',
          inspoPhotoUrl: ONE_PIXEL_PNG_DATA_URL,
          paymentProofUrl: ONE_PIXEL_PNG_DATA_URL,
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(replayRes.status).toBe(201);
    const replayJson = (await replayRes.json()) as { booking: { id: string } };
    expect(replayJson.booking.id).toBe(firstJson.booking.id);
    expect((getSnapshot().mediaAssets ?? []).length).toBe(initialMediaCount + 2);
    expect((getSnapshot().mediaAssets ?? []).filter((a) => a.bookingId === null)).toHaveLength(0);
    expect(await countFilesRecursively(tempUploadsDir)).toBe(2);

    const conflictRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `wave1-conflict-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: openSlot.staffId,
          startAt: openSlot.startAt,
          clientName: 'Clienta Choque',
          clientPhone: '+522227771002',
          inspoPhotoUrl: ONE_PIXEL_PNG_DATA_URL,
          paymentProofUrl: ONE_PIXEL_PNG_DATA_URL,
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(conflictRes.status).toBe(409);
    expect((getSnapshot().mediaAssets ?? []).length).toBe(initialMediaCount + 2);
    expect((getSnapshot().mediaAssets ?? []).filter((a) => a.bookingId === null)).toHaveLength(0);
    expect(await countFilesRecursively(tempUploadsDir)).toBe(2);
  });

  it('A2 & C4: protects waitlist offer slot in /api/availability and /api/slot-holds while allowing offer holder to view, hold via httpOnly cookie, and claim without body sessionToken', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const targetDay = avail.days.find((d) => d.date > today && d.slots.length > 0);
    const slot = targetDay?.slots[0];
    if (!targetDay || !slot) throw new Error('Expected open slot');

    const createdRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `wave1-wl-orig-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: slot.staffId,
          startAt: slot.startAt,
          clientName: 'Clienta Titular',
          clientPhone: '+522227772001',
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(createdRes.status).toBe(201);
    const holderToken = (
      (await createdRes.json()) as { booking: { manageToken: string } }
    ).booking.manageToken;

    const wlRes = await postWaitlist(
      makeRequest('http://localhost:3000/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          preferredStaffId: slot.staffId,
          desiredDate: targetDay.date,
          preferredWindow: 'any',
          clientName: 'Clienta Lista Espera',
          clientPhoneE164: '+522227772002',
        }),
      }),
    );
    expect(wlRes.status).toBe(201);

    const cancelRes = await patchManageBooking(
      makeRequest(`http://localhost:3000/api/bookings/manage/${holderToken}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: 'Cambio de plan' }),
      }),
      { params: Promise.resolve({ token: holderToken }) },
    );
    expect(cancelRes.status).toBe(200);

    const offerEntry = getSnapshot().waitlist.find(
      (entry) => entry.clientName === 'Clienta Lista Espera',
    );
    const offerToken = offerEntry?.priorityOfferToken ?? '';
    expect(offerToken.length).toBeGreaterThanOrEqual(6);

    const baseQuery = `serviceId=srv-rubber&staffId=${encodeURIComponent(slot.staffId)}&startDate=${encodeURIComponent(targetDay.date)}&days=1`;

    const publicAvailRes = await getAvailability(
      makeRequest(`http://localhost:3000/api/availability?${baseQuery}`),
    );
    expect(publicAvailRes.status).toBe(200);
    const publicAvailJson = (await publicAvailRes.json()) as {
      days: Array<{ slots: Array<{ startAt: string }> }>;
    };
    expect(
      publicAvailJson.days[0]?.slots.some((s) => s.startAt === slot.startAt),
    ).toBe(false);

    const wrongOfferRes = await getAvailability(
      makeRequest(
        `http://localhost:3000/api/availability?${baseQuery}&offer=wlo-wrong-token-999`,
      ),
    );
    expect(wrongOfferRes.status).toBe(200);
    const wrongOfferJson = (await wrongOfferRes.json()) as {
      days: Array<{ slots: Array<{ startAt: string }> }>;
    };
    expect(
      wrongOfferJson.days[0]?.slots.some((s) => s.startAt === slot.startAt),
    ).toBe(false);

    const holderAvailRes = await getAvailability(
      makeRequest(
        `http://localhost:3000/api/availability?${baseQuery}&offer=${encodeURIComponent(offerToken)}`,
      ),
    );
    expect(holderAvailRes.status).toBe(200);
    const holderAvailJson = (await holderAvailRes.json()) as {
      days: Array<{ slots: Array<{ startAt: string }> }>;
    };
    expect(
      holderAvailJson.days[0]?.slots.some((s) => s.startAt === slot.startAt),
    ).toBe(true);

    const intruderHoldRes = await postSlotHold(
      makeRequest('http://localhost:3000/api/slot-holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: slot.staffId,
          startAt: slot.startAt,
        }),
      }),
    );
    expect(intruderHoldRes.status).toBe(409);

    const holderHoldRes = await postSlotHold(
      makeRequest('http://localhost:3000/api/slot-holds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: slot.staffId,
          startAt: slot.startAt,
          waitlistOfferToken: offerToken,
        }),
      }),
    );
    expect(holderHoldRes.status).toBe(200);
    const setCookieHeader = holderHoldRes.headers.get('set-cookie') ?? '';
    expect(setCookieHeader).toContain(`${CLIENT_SESSION_COOKIE}=`);
    const cookiePair = setCookieHeader.split(';')[0] ?? '';
    const holdJson = (await holderHoldRes.json()) as { holdId: string };

    const claimRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookiePair,
          'Idempotency-Key': `wave1-wl-claim-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-rubber',
          addonIds: [],
          staffId: slot.staffId,
          startAt: slot.startAt,
          clientName: 'Clienta Lista Espera',
          clientPhone: '+522227772002',
          holdId: holdJson.holdId,
          waitlistOfferToken: offerToken,
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(claimRes.status).toBe(201);
    const bookedEntry = getSnapshot().waitlist.find(
      (entry) => entry.id === offerEntry?.id,
    );
    expect(bookedEntry?.status).toBe('booked');
  });

  it('A2-expired & A8: releases expired waitlist offers in /api/availability and never injects hardcoded 20000 deposit fallback', async () => {
    const repo = getRepository();
    await repo.updateSalonSettings({ depositAmountCents: 0 });
    const db = getSnapshot();
    const targetService = db.services.find((s) => s.id === 'srv-retiro');
    if (!targetService) throw new Error('Expected srv-retiro');
    await repo.upsertService({
      ...targetService,
      depositRequired: false,
      depositAmountCents: 0,
    });

    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-retiro',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const targetDay = avail.days.find((d) => d.date > today && d.slots.length > 0);
    const slot = targetDay?.slots[0];
    if (!targetDay || !slot) throw new Error('Expected open slot');

    db.waitlist.push({
      id: 'wl-expired-test',
      serviceId: 'srv-retiro',
      preferredStaffId: slot.staffId,
      desiredDate: targetDay.date,
      preferredWindow: 'any',
      clientName: 'Oferta Expirada',
      clientPhoneE164: '+522227773001',
      clientEmail: null,
      notes: '',
      status: 'notified',
      notifiedAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      priorityOfferToken: 'wlo-expired-token-01',
      priorityOfferExpiresAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      priorityOfferSlotStartAt: slot.startAt,
      priorityOfferStaffId: slot.staffId,
      createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    });

    const availRes = await getAvailability(
      makeRequest(
        `http://localhost:3000/api/availability?serviceId=srv-retiro&staffId=${encodeURIComponent(slot.staffId)}&startDate=${encodeURIComponent(targetDay.date)}&days=1`,
      ),
    );
    expect(availRes.status).toBe(200);
    const availJson = (await availRes.json()) as {
      days: Array<{ slots: Array<{ startAt: string }> }>;
    };
    expect(availJson.days[0]?.slots.some((s) => s.startAt === slot.startAt)).toBe(true);

    const bookRes = await postPublicBooking(
      makeRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `wave1-no-deposit-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: 'srv-retiro',
          addonIds: [],
          staffId: slot.staffId,
          startAt: slot.startAt,
          clientName: 'Clienta Sin Anticipo',
          clientPhone: '+522227773002',
          privacyConsentAccepted: true,
        }),
      }),
    );
    expect(bookRes.status).toBe(201);
    const bookJson = (await bookRes.json()) as {
      booking: { depositAmountCents: number };
      noShowPolicy: { depositAmountCents: number };
    };
    expect(bookJson.booking.depositAmountCents).toBe(0);
    expect(bookJson.noShowPolicy.depositAmountCents).toBe(0);
  });
});
