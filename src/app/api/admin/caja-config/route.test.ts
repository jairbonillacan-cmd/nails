import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from '@/lib/auth/admin-session';
import { DEFAULT_CAJA_CONFIG, resolveCajaConfig } from '@/lib/caja/caja-config';
import { toPublicSettingsDTO } from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import type { AdminRole, CajaConfig } from '@/lib/types';
import { PATCH as patchAdminBrand } from '@/app/api/admin/brand/route';
import { PUT as putCajaConfig } from '@/app/api/admin/caja-config/route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-caja-config-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

const VALID_CONFIG: CajaConfig = {
  openingFloatCents: 50_000,
  expenseCategories: ['Acetona', 'Algodón y toallas'],
  retailCommissionPercent: 15,
  defaultPeriod: 'today',
  closeSummary: { includeStaffBreakdown: false, includeTips: true, includePending: false },
};

function cookieFor(role: AdminRole): string {
  const user = getSnapshot().adminUsers.find((u) => u.role === role && u.isActive);
  if (!user) throw new Error(`Missing seed user ${role}`);
  const token = createAdminSessionToken(user);
  if (!token) throw new Error('Expected signed token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function putRequest(role: AdminRole, body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/caja-config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: cookieFor(role) },
    body: JSON.stringify(body),
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
  vi.unstubAllEnvs();
  vi.stubEnv('ADMIN_SESSION_SECRET', 'test-caja-config-secret');
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

afterAll(() => {
  resetIsolatedDb();
  vi.unstubAllEnvs();
  if (originalDbPathEnv === undefined) delete process.env.NAILS_DEMO_DB_PATH;
  else process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
});

describe('PUT /api/admin/caja-config', () => {
  it('lets owner and admin persist cajaConfig without touching other landing content', async () => {
    const before = getSnapshot().settings;
    expect(resolveCajaConfig(before.landingContent)).toEqual(DEFAULT_CAJA_CONFIG);

    const res = await putCajaConfig(putRequest('admin', { cajaConfig: VALID_CONFIG }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { cajaConfig: CajaConfig }).cajaConfig).toEqual(VALID_CONFIG);

    const after = getSnapshot().settings;
    expect(after.landingContent.cajaConfig).toEqual(VALID_CONFIG);
    expect(after.landingContent.heroTitle).toBe(before.landingContent.heroTitle);
    expect(after.landingContent.touchUpDays).toBe(before.landingContent.touchUpDays);

    const ownerRes = await putCajaConfig(
      putRequest('owner', { cajaConfig: { ...VALID_CONFIG, openingFloatCents: 0 } }),
    );
    expect(ownerRes.status).toBe(200);
  });

  it('keeps cajaConfig when the owner later saves the brand page', async () => {
    await putCajaConfig(putRequest('owner', { cajaConfig: VALID_CONFIG }));
    const brandRes = await patchAdminBrand(
      new NextRequest('http://localhost:3000/api/admin/brand', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: cookieFor('owner') },
        body: JSON.stringify({ landingContent: { heroTitle: 'Nuevo título' } }),
      }),
    );
    expect(brandRes.status).toBe(200);
    const after = getSnapshot().settings;
    expect(after.landingContent.heroTitle).toBe('Nuevo título');
    expect(after.landingContent.cajaConfig).toEqual(VALID_CONFIG);
  });

  it('rejects specialists with 403 and invalid payloads with 400', async () => {
    const forbidden = await putCajaConfig(putRequest('specialist', { cajaConfig: VALID_CONFIG }));
    expect(forbidden.status).toBe(403);

    const invalidPercent = await putCajaConfig(
      putRequest('owner', { cajaConfig: { ...VALID_CONFIG, retailCommissionPercent: 140 } }),
    );
    expect(invalidPercent.status).toBe(400);

    const duplicated = await putCajaConfig(
      putRequest('owner', {
        cajaConfig: { ...VALID_CONFIG, expenseCategories: ['Acetona', 'acetona'] },
      }),
    );
    expect(duplicated.status).toBe(400);

    const extraKey = await putCajaConfig(
      putRequest('owner', { cajaConfig: { ...VALID_CONFIG, hacked: true } }),
    );
    expect(extraKey.status).toBe(400);

    const stored = getSnapshot().settings;
    expect(stored.landingContent.cajaConfig).toBeUndefined();
  });

  it('never exposes cajaConfig through the public settings DTO', async () => {
    await putCajaConfig(putRequest('owner', { cajaConfig: VALID_CONFIG }));
    const dto = toPublicSettingsDTO(getSnapshot().settings);
    expect('cajaConfig' in dto.landingContent).toBe(false);
  });
});
