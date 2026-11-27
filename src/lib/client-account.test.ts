import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as getClientPortalProfile } from '@/app/api/client-portal/profile/route';
import { POST as postPublicBooking } from '@/app/api/bookings/route';
import {
  isPhoneMatchingSession,
  profileToContactFields,
  resolveAccountTransitionPatch,
  resolveProfilePrefill,
  resolveSignOutClear,
  type ClientContactFields,
} from '@/components/booking/clientAccountHelpers';
import {
  CLIENT_PORTAL_COOKIE,
  createClientPortalSessionToken,
} from '@/lib/auth/client-portal-otp';
import { isClientAuthMethodEnabled, selectClientPortalProfile } from '@/lib/client-account';
import {
  ClientPortalProfileResponseSchema,
  type ClientPortalProfile,
} from '@/lib/contracts';
import { getDateKeyInTimezone, normalizePhoneE164 } from '@/lib/format';
import { getSnapshot, queryAvailability } from '@/lib/repositories/db';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';

const CONTACT_KEYS: ReadonlyArray<keyof ClientContactFields> = [
  'clientName',
  'clientPhone',
  'clientInstagram',
  'clientEmail',
  'clientBirthday',
];

const digitCharArb = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9');

const mxPhone10Arb = fc.string({ unit: digitCharArb, minLength: 10, maxLength: 10 });

const e164MxPhoneArb = mxPhone10Arb.map((digits) => `+52${digits}`);

const isoBirthdayArb = fc
  .record({
    year: fc.integer({ min: 1950, max: 2010 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(
    ({ year, month, day }) =>
      `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );

const contactFieldsArb: fc.Arbitrary<ClientContactFields> = fc.record({
  clientName: fc.oneof(fc.constant(''), fc.constant('   '), fc.string({ minLength: 1, maxLength: 40 })),
  clientPhone: fc.oneof(fc.constant(''), fc.constant('  '), mxPhone10Arb, fc.string({ minLength: 1, maxLength: 16 })),
  clientInstagram: fc.oneof(fc.constant(''), fc.constant(' '), fc.string({ minLength: 1, maxLength: 30 })),
  clientEmail: fc.oneof(fc.constant(''), fc.constant('  '), fc.string({ minLength: 1, maxLength: 40 })),
  clientBirthday: fc.oneof(fc.constant(''), fc.constant(' '), fc.constant('15/08/1997'), fc.string({ minLength: 1, maxLength: 12 })),
});

const portalProfileArb: fc.Arbitrary<ClientPortalProfile> = fc.record({
  fullName: fc.oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 60 })),
  phoneE164: e164MxPhoneArb,
  email: fc.option(fc.string({ minLength: 1, maxLength: 60 }), { nil: null }),
  instagramHandle: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  birthday: fc.option(isoBirthdayArb, { nil: null }),
  isRegistered: fc.boolean(),
});

const clientRecordArb = fc.record({
  fullName: fc.string({ minLength: 1, maxLength: 80 }),
  phoneE164: e164MxPhoneArb,
  email: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null }),
  instagramHandle: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
  birthday: fc.option(isoBirthdayArb, { nil: null }),
});

describe('client auth provider configuration', () => {
  it('enables only whatsapp_otp by default and keeps future methods disabled', () => {
    expect(isClientAuthMethodEnabled('whatsapp_otp')).toBe(true);
    expect(isClientAuthMethodEnabled('email_magic_link')).toBe(false);
    expect(isClientAuthMethodEnabled('google')).toBe(false);
  });

  it('supports enabling future auth methods via explicit provider config', () => {
    const customConfig = [
      { method: 'whatsapp_otp' as const, label: 'WhatsApp', isEnabled: true },
      { method: 'email_magic_link' as const, label: 'Correo', isEnabled: true },
      { method: 'google' as const, label: 'Google', isEnabled: false },
    ];
    expect(isClientAuthMethodEnabled('email_magic_link', customConfig)).toBe(true);
    expect(isClientAuthMethodEnabled('google', customConfig)).toBe(false);
  });
});

describe('resolveProfilePrefill and resolveSignOutClear', () => {
  it('prefills empty fields from profile without ever overwriting typed or drafted fields', () => {
    fc.assert(
      fc.property(contactFieldsArb, portalProfileArb, (current, profile) => {
        const patch = resolveProfilePrefill(current, profile);
        const expected = profileToContactFields(profile);
        for (const key of CONTACT_KEYS) {
          if (current[key].trim().length > 0) {
            expect(patch[key]).toBeUndefined();
          } else if (expected[key].length > 0) {
            expect(patch[key]).toBe(expected[key]);
          } else {
            expect(patch[key]).toBeUndefined();
          }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('clears only fields matching the signed-in profile and preserves custom values', () => {
    fc.assert(
      fc.property(contactFieldsArb, portalProfileArb, (current, profile) => {
        const patch = resolveSignOutClear(current, profile);
        const fromProfile = profileToContactFields(profile);
        for (const key of CONTACT_KEYS) {
          const matchesProfile = fromProfile[key].length > 0 && current[key].trim() === fromProfile[key];
          if (matchesProfile) {
            expect(patch[key]).toBe('');
          } else {
            expect(patch[key]).toBeUndefined();
          }
        }
      }),
      { numRuns: 250 },
    );
  });

  it('round-trips empty form prefill followed by sign-out back to empty fields', () => {
    const empty: ClientContactFields = {
      clientName: '',
      clientPhone: '',
      clientInstagram: '',
      clientEmail: '',
      clientBirthday: '',
    };
    fc.assert(
      fc.property(portalProfileArb, (profile) => {
        const afterPrefill: ClientContactFields = { ...empty, ...resolveProfilePrefill(empty, profile) };
        const afterSignOut: ClientContactFields = {
          ...afterPrefill,
          ...resolveSignOutClear(afterPrefill, profile),
        };
        expect(afterSignOut).toEqual(empty);
      }),
      { numRuns: 200 },
    );
  });

  it('formats profile fields for the booking form and handles account transitions', () => {
    const sofia: ClientPortalProfile = {
      fullName: 'Sofía Ramírez',
      phoneE164: '+522224123987',
      email: 'sofia.ramirez@ejemplo.mx',
      instagramHandle: 'sofia.ramirez.pue',
      birthday: '1997-11-29',
      isRegistered: true,
    };
    const paula: ClientPortalProfile = {
      fullName: 'Paula Herrera',
      phoneE164: '+522222109883',
      email: 'paula.h@ejemplo.mx',
      instagramHandle: '@paulaherrera.pue',
      birthday: '1993-12-02',
      isRegistered: true,
    };

    expect(profileToContactFields(sofia)).toEqual({
      clientName: 'Sofía Ramírez',
      clientPhone: '222 412 3987',
      clientInstagram: '@sofia.ramirez.pue',
      clientEmail: 'sofia.ramirez@ejemplo.mx',
      clientBirthday: '29/11/1997',
    });

    const typedCustom = {
      ...profileToContactFields(sofia),
      clientPhone: '222 210 9883',
      clientInstagram: '@mi.cuenta.custom',
    };
    const switchPatch = resolveAccountTransitionPatch(typedCustom, sofia, paula);
    const merged: ClientContactFields = { ...typedCustom, ...switchPatch };
    expect(merged).toEqual({
      clientName: 'Paula Herrera',
      clientPhone: '222 210 9883',
      clientInstagram: '@mi.cuenta.custom',
      clientEmail: 'paula.h@ejemplo.mx',
      clientBirthday: '02/12/1993',
    });
  });

  it('matches MX phone inputs against the verified session phone strictly', () => {
    fc.assert(
      fc.property(mxPhone10Arb, mxPhone10Arb, (a, b) => {
        const session = `+52${a}`;
        const formatted = `${a.slice(0, 3)} ${a.slice(3, 6)} ${a.slice(6)}`;
        expect(isPhoneMatchingSession(a, session)).toBe(true);
        expect(isPhoneMatchingSession(formatted, session)).toBe(true);
        expect(isPhoneMatchingSession(`+52 ${formatted}`, session)).toBe(true);
        expect(isPhoneMatchingSession(`${a}9`, session)).toBe(false);
        expect(isPhoneMatchingSession(a.slice(0, 9), session)).toBe(false);
        expect(isPhoneMatchingSession(b, session)).toBe(a === b);
      }),
      { numRuns: 200 },
    );
    expect(isPhoneMatchingSession('222 412 3987', '+14155550199')).toBe(false);
  });
});

describe('selectClientPortalProfile isolation', () => {
  it('never returns profile data belonging to a different phone number', () => {
    fc.assert(
      fc.property(fc.array(clientRecordArb, { maxLength: 20 }), e164MxPhoneArb, (clients, sessionPhone) => {
        const normalizedSession = normalizePhoneE164(sessionPhone);
        const result = selectClientPortalProfile(clients, sessionPhone);
        expect(result.phoneE164).toBe(normalizedSession);

        const expectedMatch = clients.find(
          (entry) => normalizePhoneE164(entry.phoneE164) === normalizedSession,
        );
        if (!expectedMatch) {
          expect(result.isRegistered).toBe(false);
          expect(result.fullName).toBe('');
          expect(result.email).toBeNull();
          expect(result.instagramHandle).toBeNull();
          expect(result.birthday).toBeNull();
        } else {
          expect(result.isRegistered).toBe(true);
          expect(result.fullName).toBe(expectedMatch.fullName.trim().slice(0, 200));
          expect(result.email).toBe(expectedMatch.email?.trim().slice(0, 320) || null);
          expect(result.instagramHandle).toBe(
            expectedMatch.instagramHandle?.trim().slice(0, 120) || null,
          );
          expect(result.birthday).toBe(expectedMatch.birthday?.trim().slice(0, 20) || null);
        }
      }),
      { numRuns: 300 },
    );
  });
});

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-client-account-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

describe('GET /api/client-portal/profile route security and client persistence', () => {
  beforeAll(() => {
    originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
    process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
    resetIsolatedDb();
  });

  beforeEach(() => {
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

  it('rejects unauthenticated and tampered requests with 401 and private no-store headers', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-profile-secret-1');

    const unauth = await getClientPortalProfile(
      new NextRequest('http://localhost:3000/api/client-portal/profile'),
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('cache-control')).toBe('private, no-store');
    expect(unauth.headers.get('vary')).toBe('Cookie');
    const unauthBody = ClientPortalProfileResponseSchema.parse(await unauth.json());
    expect(unauthBody.authenticated).toBe(false);

    const tampered = await getClientPortalProfile(
      new NextRequest('http://localhost:3000/api/client-portal/profile', {
        headers: { cookie: `${CLIENT_PORTAL_COOKIE}=forged.signature` },
      }),
    );
    expect(tampered.status).toBe(401);
  });

  it('returns only the authenticated client profile without leaking internal notes or other clients', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-profile-secret-2');
    const token = createClientPortalSessionToken('+522224123987');
    expect(token).toBeTruthy();

    const res = await getClientPortalProfile(
      new NextRequest('http://localhost:3000/api/client-portal/profile', {
        headers: { cookie: `${CLIENT_PORTAL_COOKIE}=${token ?? ''}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('vary')).toBe('Cookie');

    const rawText = await res.text();
    expect(rawText).not.toContain('Paula Herrera');
    expect(rawText).not.toContain('Valeria Mendoza');
    expect(rawText).not.toContain('Cutícula sensible');
    expect(rawText).not.toContain('noShowCount');

    const parsed = ClientPortalProfileResponseSchema.parse(JSON.parse(rawText));
    expect(parsed.authenticated).toBe(true);
    if (!parsed.authenticated) return;
    expect(parsed.authMethod).toBe('whatsapp_otp');
    expect(parsed.profile).toEqual({
      fullName: 'Sofía Ramírez',
      phoneE164: '+522224123987',
      email: 'sofia.ramirez@ejemplo.mx',
      instagramHandle: '@sofia.ramirez.pue',
      birthday: expect.stringMatching(/^1997-\d{2}-\d{2}$/),
      isRegistered: true,
      lastServiceSlug: expect.any(String),
      lastServiceName: expect.any(String),
      lastStaffSlug: expect.any(String),
      lastStaffName: expect.any(String),
    });
  });

  it('returns unregistered profile for a new phone and prefills it after booking saves the client', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-profile-secret-3');
    const newPhone = '+522225550191';
    const token = createClientPortalSessionToken(newPhone);
    expect(token).toBeTruthy();

    const beforeRes = await getClientPortalProfile(
      new NextRequest('http://localhost:3000/api/client-portal/profile', {
        headers: { cookie: `${CLIENT_PORTAL_COOKIE}=${token ?? ''}` },
      }),
    );
    expect(beforeRes.status).toBe(200);
    const beforeBody = ClientPortalProfileResponseSchema.parse(await beforeRes.json());
    expect(beforeBody.authenticated).toBe(true);
    if (!beforeBody.authenticated) return;
    expect(beforeBody.profile).toEqual({
      fullName: '',
      phoneE164: newPhone,
      email: null,
      instagramHandle: null,
      birthday: null,
      isRegistered: false,
    });

    const db = getSnapshot();
    const service = db.services.find((s) => s.isActive && !s.isPrivate);
    expect(service).toBeTruthy();
    if (!service) return;

    const todayKey = getDateKeyInTimezone(new Date(), db.settings.timezone || 'America/Mexico_City');
    const availability = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      startDate: todayKey,
      days: 14,
    });
    const firstSlot = availability.days.flatMap((day) => day.slots)[0];
    expect(firstSlot).toBeTruthy();
    if (!firstSlot) return;

    const bookingRes = await postPublicBooking(
      new NextRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': `idem-test-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          serviceId: service.id,
          staffId: firstSlot.staffId,
          startAt: firstSlot.startAt,
          clientName: 'Mariana Torres',
          clientPhone: newPhone,
          clientEmail: 'mariana.torres@correo.mx',
          clientInstagram: '@mariana.t',
          clientBirthday: '1998-04-12',
          privacyConsentAccepted: true,
          marketingOptIn: false,
        }),
      }),
    );
    expect(bookingRes.status).toBe(201);

    const afterRes = await getClientPortalProfile(
      new NextRequest('http://localhost:3000/api/client-portal/profile', {
        headers: { cookie: `${CLIENT_PORTAL_COOKIE}=${token ?? ''}` },
      }),
    );
    expect(afterRes.status).toBe(200);
    const afterBody = ClientPortalProfileResponseSchema.parse(await afterRes.json());
    expect(afterBody.authenticated).toBe(true);
    if (!afterBody.authenticated) return;
    expect(afterBody.profile).toEqual({
      fullName: 'Mariana Torres',
      phoneE164: newPhone,
      email: 'mariana.torres@correo.mx',
      instagramHandle: '@mariana.t',
      birthday: '1998-04-12',
      isRegistered: true,
      lastServiceSlug: service.slug,
      lastServiceName: service.name,
      lastStaffSlug: expect.any(String),
      lastStaffName: expect.any(String),
    });
  });

  it('rate-limits excessive profile requests with 429 and private headers', async () => {
    vi.stubEnv('CLIENT_PORTAL_SECRET', 'test-profile-secret-4');
    const ip = '198.51.100.77';
    let lastStatus = 0;
    let lastHeaders: Headers | null = null;
    for (let i = 0; i < 61; i += 1) {
      const res = await getClientPortalProfile(
        new NextRequest('http://localhost:3000/api/client-portal/profile', {
          headers: { 'x-forwarded-for': ip },
        }),
      );
      lastStatus = res.status;
      lastHeaders = res.headers;
    }
    expect(lastStatus).toBe(429);
    expect(lastHeaders?.get('cache-control')).toBe('private, no-store');
    expect(lastHeaders?.get('vary')).toBe('Cookie');
    expect(lastHeaders?.get('retry-after')).toBeTruthy();
  });
});
