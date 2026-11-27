import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
} from '@/lib/auth/admin-session';
import {
  getBookingPaymentSummaryAsync,
  getSnapshot,
  updateBookingStatus,
} from '@/lib/repositories/db';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';
import { PATCH as patchAdminBookings } from '@/app/api/admin/bookings/route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-checkin-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

function getCookieForRole(role: 'owner' | 'admin' | 'specialist'): string {
  const user = getSnapshot().adminUsers.find((u) => u.role === role && u.isActive);
  if (!user) throw new Error(`Missing seed ${role}`);
  const token = createAdminSessionToken(user);
  if (!token) throw new Error(`Expected signed ${role} token`);
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function makePatchRequest(body: Record<string, unknown>, cookie?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new NextRequest('http://localhost/api/admin/bookings', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
}

describe('Admin bookings check_in RBAC, payment summary helper & zero-snapshot regression', () => {
  beforeAll(() => {
    originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
    process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
    resetIsolatedDb();
  });

  beforeEach(() => {
    resetRateLimiterForTests();
    resetIsolatedDb();
  });

  afterAll(() => {
    resetIsolatedDb();
    if (originalDbPathEnv === undefined) {
      delete process.env.NAILS_DEMO_DB_PATH;
    } else {
      process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
    }
  });

  it('enforces auth & specialist RBAC on PATCH action=check_in and stays idempotent', async () => {
    const snapshot = getSnapshot();
    const specialistUser = snapshot.adminUsers.find(
      (u) => u.role === 'specialist' && u.isActive && u.staffMemberId,
    );
    expect(specialistUser?.staffMemberId).toBeTruthy();

    const ownBooking = snapshot.bookings.find(
      (b) =>
        b.staffId === specialistUser?.staffMemberId &&
        b.status !== 'canceled' &&
        b.status !== 'no_show',
    );
    const foreignBooking = snapshot.bookings.find(
      (b) =>
        b.staffId !== specialistUser?.staffMemberId &&
        b.status !== 'canceled' &&
        b.status !== 'no_show',
    );
    expect(ownBooking).toBeDefined();
    expect(foreignBooking).toBeDefined();

    const unauthRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: ownBooking!.id }),
    );
    expect(unauthRes.status).toBe(401);

    const specCookie = getCookieForRole('specialist');
    const foreignRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: foreignBooking!.id }, specCookie),
    );
    expect(foreignRes.status).toBe(403);

    const ownRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: ownBooking!.id }, specCookie),
    );
    expect(ownRes.status).toBe(200);
    const ownJson = (await ownRes.json()) as {
      booking: {
        id: string;
        attendanceStatus?: string;
        attendanceConfirmedAt?: string | null;
        confirmedVia?: string | null;
      };
    };
    expect(ownJson.booking.id).toBe(ownBooking!.id);
    expect(ownJson.booking.attendanceStatus).toBe('confirmed');
    expect(ownJson.booking.attendanceConfirmedAt).toBeTruthy();
    expect(ownJson.booking.confirmedVia).toBeTruthy();

    const firstConfirmedAt = ownJson.booking.attendanceConfirmedAt;
    const secondRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: ownBooking!.id }, specCookie),
    );
    expect(secondRes.status).toBe(200);
    const secondJson = (await secondRes.json()) as {
      booking: { attendanceConfirmedAt?: string | null };
    };
    expect(secondJson.booking.attendanceConfirmedAt).toBe(firstConfirmedAt);

    const ownerCookie = getCookieForRole('owner');
    const ownerRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: foreignBooking!.id }, ownerCookie),
    );
    expect(ownerRes.status).toBe(200);

    const missingRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: 'nonexistent-booking-id' }, ownerCookie),
    );
    expect(missingRes.status).toBe(404);

    await updateBookingStatus({
      bookingId: foreignBooking!.id,
      status: 'canceled',
      cancellationReason: 'Cancelada para prueba',
    });
    const canceledRes = await patchAdminBookings(
      makePatchRequest({ action: 'check_in', bookingId: foreignBooking!.id }, ownerCookie),
    );
    expect(canceledRes.status).toBe(400);
    const canceledJson = (await canceledRes.json()) as { code?: string };
    expect(canceledJson.code).toBe('INVALID_STATE');
  });

  it('computes targeted booking payment summary accurately before and after deposit approval', async () => {
    const snapshot = getSnapshot();
    const pendingBooking = snapshot.bookings.find(
      (b) =>
        (b.status === 'pending_confirmation' || b.status === 'pending_payment') &&
        b.depositAmountCents > 0,
    );
    expect(pendingBooking).toBeDefined();

    const before = await getBookingPaymentSummaryAsync(
      pendingBooking!.id,
      pendingBooking!.totalPriceCents,
    );
    expect(before.paidCents).toBe(0);
    expect(before.remainingCents).toBe(pendingBooking!.totalPriceCents);

    await updateBookingStatus({
      bookingId: pendingBooking!.id,
      status: 'confirmed',
    });

    const after = await getBookingPaymentSummaryAsync(
      pendingBooking!.id,
      pendingBooking!.totalPriceCents,
    );
    expect(after.paidCents).toBe(pendingBooking!.depositAmountCents);
    expect(after.remainingCents).toBe(
      Math.max(0, pendingBooking!.totalPriceCents - pendingBooking!.depositAmountCents),
    );
  });

  it('keeps /api/admin/bookings/route.ts free of full-DB getSnapshot() calls', () => {
    const routePath = path.resolve(process.cwd(), 'src/app/api/admin/bookings/route.ts');
    const source = fs.readFileSync(routePath, 'utf8');
    expect(source).not.toContain('getSnapshot(');
  });
});
