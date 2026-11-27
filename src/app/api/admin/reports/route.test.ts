import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/auth/admin-session';
import * as dbModule from '@/lib/repositories/db';
import type { AdminRole, AdminUser } from '@/lib/types';
import { GET as getAdminReports } from './route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-admin-reports-test-${process.pid}-${crypto.randomUUID()}.json`,
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
  return new NextRequest(`http://localhost:3000/api/admin/reports${query}`, {
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
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-admin-reports-secret');
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

describe('GET /api/admin/reports (Phase 5 zero-snapshot & RBAC)', () => {
  it('never calls getRepository().getSnapshot() and returns identical period parity for owner/admin', async () => {
    const repo = dbModule.getRepository();
    const snapshotSpy = vi.spyOn(repo, 'getSnapshot');
    const reportDataSpy = vi.spyOn(repo, 'getExecutiveReportData');
    vi.spyOn(dbModule, 'getRepository').mockReturnValue(repo);

    const res = await getAdminReports(getRequest('?period=7d', cookieFor('owner')));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(reportDataSpy).toHaveBeenCalledWith({ scopeStaffId: null });

    const body = (await res.json()) as {
      scope: string;
      period: string;
      cashSummary: { collectedCents: number; tipsCents: number };
      summary: { totalBookings: number };
    };
    expect(body.scope).toBe('studio');
    expect(body.period).toBe('7d');
    expect(body.cashSummary.collectedCents).toBeGreaterThanOrEqual(0);

    const adminRes = await getAdminReports(getRequest('?period=month', cookieFor('admin')));
    expect(adminRes.status).toBe(200);
    expect(snapshotSpy).not.toHaveBeenCalled();

    const customRes = await getAdminReports(
      getRequest('?period=custom&from=2026-11-01&to=2026-11-30', cookieFor('owner')),
    );
    expect(customRes.status).toBe(200);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });

  it('enforces auth (401), period validation (400), and strict specialist scope isolation (including unassigned specialist)', async () => {
    const unauth = await getAdminReports(getRequest('?period=7d'));
    expect(unauth.status).toBe(401);

    const invalidPeriod = await getAdminReports(getRequest('?period=365d', cookieFor('owner')));
    expect(invalidPeriod.status).toBe(400);

    const repo = dbModule.getRepository();
    const snapshotSpy = vi.spyOn(repo, 'getSnapshot');
    const reportDataSpy = vi.spyOn(repo, 'getExecutiveReportData');
    vi.spyOn(dbModule, 'getRepository').mockReturnValue(repo);

    const specialistUser = dbModule
      .getSnapshot()
      .adminUsers.find((u) => u.role === 'specialist' && u.isActive);
    expect(specialistUser?.staffMemberId).toBeTruthy();

    const specRes = await getAdminReports(getRequest('?period=all', cookieFor('specialist')));
    expect(specRes.status).toBe(200);
    expect(snapshotSpy).not.toHaveBeenCalled();
    expect(reportDataSpy).toHaveBeenCalledWith({
      scopeStaffId: specialistUser?.staffMemberId ?? null,
    });
    const specBody = (await specRes.json()) as {
      scope: string;
      scopeStaffId: string | null;
      specialistOccupancy: Array<{ staffId: string }>;
      funnel: { totalSessions: number };
    };
    expect(specBody.scope).toBe('specialist');
    expect(specBody.scopeStaffId).toBe(specialistUser?.staffMemberId);
    expect(
      specBody.specialistOccupancy.every((row) => row.staffId === specialistUser?.staffMemberId),
    ).toBe(true);
    expect(specBody.funnel.totalSessions).toBe(0);

    const unassignedUser = await repo.upsertAdminUser({
      email: 'sin-vincular@nails.studio',
      fullName: 'Especialista Sin Vincular',
      role: 'specialist',
      staffMemberId: null,
      isActive: true,
    });
    const unassignedRes = await getAdminReports(
      getRequest('?period=7d', cookieForUser(unassignedUser)),
    );
    expect(unassignedRes.status).toBe(200);
    const unassignedBody = (await unassignedRes.json()) as {
      scope: string;
      scopeStaffId: string | null;
      summary: { totalBookings: number };
      specialistOccupancy: unknown[];
    };
    expect(unassignedBody.scope).toBe('specialist');
    expect(unassignedBody.scopeStaffId).toBeNull();
    expect(unassignedBody.summary.totalBookings).toBe(0);
    expect(unassignedBody.specialistOccupancy).toEqual([]);
    expect(snapshotSpy).not.toHaveBeenCalled();
  });
});
