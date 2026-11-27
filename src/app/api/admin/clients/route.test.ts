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
  assignClientPackage,
  createClientProfile,
  getSnapshot,
} from '@/lib/repositories/db';
import {
  DELETE as deleteAdminClients,
  GET as getAdminClients,
  PATCH as patchAdminClients,
  POST as postAdminClients,
} from './route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-clients-route-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  globalThis.nailsDbPersistedToDisk = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

function makeCookie(role: 'owner' | 'admin' | 'specialist') {
  const user = getSnapshot().adminUsers.find((u) => u.role === role && u.isActive);
  if (!user) {
    throw new Error(`Missing seeded admin user for role ${role}`);
  }
  const token = createAdminSessionToken({
    id: user.id,
    email: user.email,
    role: user.role,
  });
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

describe('/api/admin/clients Wave 5 CRUD, RBAC & targeted queries', () => {
  beforeAll(() => {
    originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
    process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
    resetIsolatedDb();
  });

  beforeEach(() => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'wave5-clients-route-test-secret');
    resetIsolatedDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    resetIsolatedDb();
    if (originalDbPathEnv === undefined) {
      delete process.env.NAILS_DEMO_DB_PATH;
    } else {
      process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
    }
  });

  it('enforces owner/admin RBAC (401/403) across GET, POST, PATCH, and DELETE', async () => {
    const specialistCookie = makeCookie('specialist');

    expect((await getAdminClients(new NextRequest('http://localhost:3000/api/admin/clients'))).status).toBe(401);
    expect(
      (
        await getAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients', {
            headers: { cookie: specialistCookie },
          }),
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await postAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ fullName: 'Sin Auth', phone: '2221112233' }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await postAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients', {
            method: 'POST',
            headers: { 'content-type': 'application/json', cookie: specialistCookie },
            body: JSON.stringify({ fullName: 'Esp Test', phone: '2221112233' }),
          }),
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await patchAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clientId: 'client-sofia', fullName: 'Sin Auth' }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await patchAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json', cookie: specialistCookie },
            body: JSON.stringify({ clientId: 'client-sofia', fullName: 'Esp Edit' }),
          }),
        )
      ).status,
    ).toBe(403);

    expect(
      (
        await deleteAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients?id=client-sofia', {
            method: 'DELETE',
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await deleteAdminClients(
          new NextRequest('http://localhost:3000/api/admin/clients?id=client-sofia', {
            method: 'DELETE',
            headers: { cookie: specialistCookie },
          }),
        )
      ).status,
    ).toBe(403);
  });

  it('edits fullName & phone with E.164 normalization, 409 CLIENT_EXISTS duplicate guard, and 404 missing guard', async () => {
    const ownerCookie = makeCookie('owner');
    const created = await createClientProfile({
      fullName: 'Daniela Ortiz',
      phone: '2227778899',
      email: 'daniela@ejemplo.mx',
      instagramHandle: '@daniela.nails',
      notes: 'Base rubber',
    });

    const editRes = await patchAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          clientId: created.id,
          fullName: '  Daniela Ortiz Mora  ',
          phone: '222 888 9900',
          notes: 'Almendra · Medio · Rubber',
        }),
      }),
    );
    expect(editRes.status).toBe(200);
    const editJson = (await editRes.json()) as {
      client: { id: string; fullName: string; phoneE164: string; notes: string };
    };
    expect(editJson.client.fullName).toBe('Daniela Ortiz Mora');
    expect(editJson.client.phoneE164).toBe('+522228889900');
    expect(editJson.client.notes).toBe('Almendra · Medio · Rubber');

    const selfPhoneEditRes = await patchAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          clientId: created.id,
          phone: '+5212228889900',
        }),
      }),
    );
    expect(selfPhoneEditRes.status).toBe(200);

    const sofia = getSnapshot().clients.find((c) => c.id === 'client-sofia');
    expect(sofia).toBeDefined();
    const dupPhoneRes = await patchAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          clientId: created.id,
          phone: sofia?.phoneE164.replace('+52', '') ?? '2224123987',
        }),
      }),
    );
    expect(dupPhoneRes.status).toBe(409);
    const dupJson = (await dupPhoneRes.json()) as { code?: string };
    expect(dupJson.code).toBe('CLIENT_EXISTS');

    const invalidPhoneRes = await patchAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          clientId: created.id,
          phone: '--------',
        }),
      }),
    );
    expect(invalidPhoneRes.status).toBe(400);

    const missingRes = await patchAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie: ownerCookie },
        body: JSON.stringify({
          clientId: 'client-does-not-exist',
          fullName: 'Inexistente',
        }),
      }),
    );
    expect(missingRes.status).toBe(404);
    expect(((await missingRes.json()) as { code?: string }).code).toBe('CLIENT_NOT_FOUND');
  });

  it('safely deletes empty clients (200) and blocks clients with bookings or packages (409 CLIENT_HAS_HISTORY)', async () => {
    const adminCookie = makeCookie('admin');

    const badQuery = await deleteAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        method: 'DELETE',
        headers: { cookie: adminCookie },
      }),
    );
    expect(badQuery.status).toBe(400);

    const missingDel = await deleteAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients?id=client-unknown-999', {
        method: 'DELETE',
        headers: { cookie: adminCookie },
      }),
    );
    expect(missingDel.status).toBe(404);
    expect(((await missingDel.json()) as { code?: string }).code).toBe('CLIENT_NOT_FOUND');

    const withBookingsDel = await deleteAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients?id=client-sofia', {
        method: 'DELETE',
        headers: { cookie: adminCookie },
      }),
    );
    expect(withBookingsDel.status).toBe(409);
    expect(((await withBookingsDel.json()) as { code?: string }).code).toBe(
      'CLIENT_HAS_HISTORY',
    );
    expect(getSnapshot().clients.some((c) => c.id === 'client-sofia')).toBe(true);

    const pkgClient = await createClientProfile({
      fullName: 'Camila Paquete',
      phone: '2226665544',
    });
    const activePkg = getSnapshot().servicePackages?.find((p) => p.isActive);
    expect(activePkg).toBeDefined();
    if (activePkg) {
      await assignClientPackage({
        clientId: pkgClient.id,
        packageId: activePkg.id,
      });
    }

    const withPkgDel = await deleteAdminClients(
      new NextRequest(
        `http://localhost:3000/api/admin/clients?id=${encodeURIComponent(pkgClient.id)}`,
        {
          method: 'DELETE',
          headers: { cookie: adminCookie },
        },
      ),
    );
    expect(withPkgDel.status).toBe(409);
    expect(((await withPkgDel.json()) as { code?: string }).code).toBe('CLIENT_HAS_HISTORY');

    const emptyClient = await createClientProfile({
      fullName: 'Clienta Prueba Temporal',
      phone: '2225551122',
    });
    const okDel = await deleteAdminClients(
      new NextRequest(
        `http://localhost:3000/api/admin/clients?id=${encodeURIComponent(emptyClient.id)}`,
        {
          method: 'DELETE',
          headers: { cookie: adminCookie },
        },
      ),
    );
    expect(okDel.status).toBe(200);
    expect(await okDel.json()).toEqual({
      ok: true,
      deletedId: emptyClient.id,
      fullName: 'Clienta Prueba Temporal',
    });
    expect(getSnapshot().clients.some((c) => c.id === emptyClient.id)).toBe(false);
  });

  it('serves GET directory, inactiveDays (with lastServiceName), and ARCO export without calling getSnapshot()', async () => {
    const routeSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/app/api/admin/clients/route.ts'),
      'utf8',
    );
    expect(routeSource).not.toContain('getSnapshot');

    const ownerCookie = makeCookie('owner');

    const dirRes = await getAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients', {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(dirRes.status).toBe(200);
    const dirJson = (await dirRes.json()) as {
      clients: Array<{ id: string }>;
      nearRewardClients: Array<{ clientId: string }>;
    };
    expect(dirJson.clients.length).toBeGreaterThan(0);
    expect(dirJson.nearRewardClients.some((c) => c.clientId === 'client-sofia')).toBe(true);

    const liveDb = getSnapshot();
    const paulaBooking = liveDb.bookings.find((b) => b.id === 'bk-1000');
    expect(paulaBooking).toBeDefined();
    if (paulaBooking) {
      const oldIso = new Date(Date.now() - 45 * 86_400_000).toISOString();
      paulaBooking.startAt = oldIso;
      paulaBooking.endAt = oldIso;
      paulaBooking.status = 'completed';
    }
    const expectedServiceName = liveDb.services.find(
      (s) => s.id === paulaBooking?.serviceId,
    )?.name;

    const inactiveRes = await getAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients?inactiveDays=30', {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(inactiveRes.status).toBe(200);
    const inactiveJson = (await inactiveRes.json()) as {
      inactiveDays: number;
      clients: Array<{
        clientId: string;
        lastServiceId: string | null;
        lastServiceName: string | null;
      }>;
    };
    const paulaInactive = inactiveJson.clients.find((c) => c.clientId === 'client-paula');
    expect(paulaInactive).toBeDefined();
    expect(paulaInactive?.lastServiceId).toBe(paulaBooking?.serviceId ?? null);
    expect(paulaInactive?.lastServiceName).toBe(expectedServiceName ?? null);

    const arcoRes = await getAdminClients(
      new NextRequest('http://localhost:3000/api/admin/clients?exportClientId=client-sofia', {
        headers: { cookie: ownerCookie },
      }),
    );
    expect(arcoRes.status).toBe(200);
    const arcoText = await arcoRes.text();
    expect(arcoText).not.toContain('internalNotes');
    const arcoJson = JSON.parse(arcoText) as { client: { id: string }; bookings: unknown[] };
    expect(arcoJson.client.id).toBe('client-sofia');
    expect(arcoJson.bookings.length).toBeGreaterThan(0);
  });
});
