import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/auth/admin-session';
import { getDateKeyInTimezone } from '@/lib/format';
import * as dbModule from '@/lib/repositories/db';
import type {
  AdminRole,
  AdminUser,
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
} from '@/lib/types';
import { GET as getAdminBookings } from './route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-admin-bookings-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function cookieForUser(user: AdminUser): string {
  const token = createAdminSessionToken(user);
  if (!token) throw new Error('Expected signed token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function cookieFor(role: AdminRole): string {
  const baseUser = dbModule.getSnapshot().adminUsers.find((u) => u.role === role && u.isActive);
  if (!baseUser) throw new Error(`Missing seed user ${role}`);
  return cookieForUser(baseUser);
}

function getRequest(query: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/admin/bookings${query}`, {
    method: 'GET',
    headers: cookie ? { cookie } : {},
  });
}

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) fs.unlinkSync(TEMP_DB_PATH);
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-bookings-secret');
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

afterAll(() => {
  vi.restoreAllMocks();
  resetIsolatedDb();
  vi.unstubAllEnvs();
  if (originalDbPathEnv === undefined) delete process.env.NAILS_DEMO_DB_PATH;
  else process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
});

describe('GET /api/admin/bookings (Phase 5 range queries, validation & RBAC)', () => {
  it('filters bookings, paymentSplits, and cashEntries by salon-timezone date range and staff', async () => {
    const db = dbModule.getSnapshot();
    const tz = db.settings.timezone || 'America/Mexico_City';
    const sampleBooking = db.bookings[0];
    expect(sampleBooking).toBeDefined();
    if (!sampleBooking) throw new Error('Missing seed booking');
    const targetDate = getDateKeyInTimezone(new Date(sampleBooking.startAt), tz);

    const res = await getAdminBookings(
      getRequest(
        `?from=${targetDate}&to=${targetDate}&staff=${encodeURIComponent(sampleBooking.staffId)}`,
        cookieFor('owner'),
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('vary')).toContain('Cookie');

    const body = (await res.json()) as {
      bookings: BookingWithRelations[];
      paymentSplits: PaymentSplit[];
      cashEntries: CashRegisterEntry[];
      range: { from: string | null; to: string | null; staffId: string | null };
      timezone: string;
    };

    expect(body.range).toEqual({
      from: targetDate,
      to: targetDate,
      staffId: sampleBooking.staffId,
    });
    expect(body.timezone).toBe(tz);
    expect(body.bookings.length).toBeGreaterThan(0);
    for (const bk of body.bookings) {
      expect(getDateKeyInTimezone(new Date(bk.startAt), tz)).toBe(targetDate);
      expect(bk.staffId).toBe(sampleBooking.staffId);
      expect(bk.client.fullName.length).toBeGreaterThan(0);
      expect(bk.service.name.length).toBeGreaterThan(0);
      expect(bk.staff.name.length).toBeGreaterThan(0);
    }

    const returnedIds = new Set(body.bookings.map((b) => b.id));
    for (const split of body.paymentSplits) {
      expect(returnedIds.has(split.bookingId)).toBe(true);
    }
    for (const entry of body.cashEntries) {
      expect(entry.bookingId !== null && returnedIds.has(entry.bookingId)).toBe(true);
    }
  });

  it('rejects unauthenticated requests (401) and invalid date ranges (400)', async () => {
    const unauth = await getAdminBookings(getRequest('?from=2026-11-01&to=2026-11-07'));
    expect(unauth.status).toBe(401);

    const badFormat = await getAdminBookings(
      getRequest('?from=not-a-date&to=2026-11-07', cookieFor('owner')),
    );
    expect(badFormat.status).toBe(400);

    const badCalendarDate = await getAdminBookings(
      getRequest('?from=2026-02-30&to=2026-03-02', cookieFor('owner')),
    );
    expect(badCalendarDate.status).toBe(400);

    const reversedRange = await getAdminBookings(
      getRequest('?from=2026-11-20&to=2026-11-10', cookieFor('owner')),
    );
    expect(reversedRange.status).toBe(400);

    const tooWideRange = await getAdminBookings(
      getRequest('?from=2025-01-01&to=2026-12-31', cookieFor('owner')),
    );
    expect(tooWideRange.status).toBe(400);
  });

  it('locks specialist requests to their own staffMemberId even when passing another staff param', async () => {
    const db = dbModule.getSnapshot();
    const specialistUser = db.adminUsers.find((u) => u.role === 'specialist' && u.isActive);
    const otherStaff = db.staff.find((s) => s.id !== specialistUser?.staffMemberId);
    expect(specialistUser?.staffMemberId).toBeTruthy();
    expect(otherStaff?.id).toBeTruthy();

    const res = await getAdminBookings(
      getRequest(
        `?staff=${encodeURIComponent(otherStaff?.id ?? '')}`,
        cookieFor('specialist'),
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      bookings: BookingWithRelations[];
      range: { staffId: string | null };
    };
    expect(body.range.staffId).toBe(specialistUser?.staffMemberId);
    expect(
      body.bookings.every((b) => b.staffId === specialistUser?.staffMemberId),
    ).toBe(true);

    const unassignedUser = await dbModule.getRepository().upsertAdminUser({
      email: 'sin-vincular@nails.studio',
      fullName: 'Especialista Sin Vincular',
      role: 'specialist',
      staffMemberId: null,
      isActive: true,
    });
    const unassigned = await getAdminBookings(
      getRequest('?from=2026-11-01&to=2026-11-30', cookieForUser(unassignedUser)),
    );
    expect(unassigned.status).toBe(200);
    const unassignedBody = (await unassigned.json()) as {
      bookings: BookingWithRelations[];
      range: { staffId: string | null };
    };
    expect(unassignedBody.bookings).toEqual([]);
    expect(unassignedBody.range.staffId).toBeNull();
  });
});
