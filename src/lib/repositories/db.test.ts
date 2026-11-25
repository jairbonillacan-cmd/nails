import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDateOverride,
  createBookingAtomic,
  createClientProfile,
  createOrRefreshSlotHold,
  getBookingByToken,
  getSnapshot,
  manageClientBookingAction,
  PolicyError,
  queryAvailability,
  releaseSlotHold,
  saveOnboardingSetup,
  sendManualBookingReminder,
  SlotConflictError,
  updateBookingStatus,
  updateClientNotes,
} from './db';
import { zonedDateTimeToUtc } from '../availability/engine';
import { getDateKeyInTimezone } from '../format';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-db-test-${process.pid}-${crypto.randomUUID()}.json`,
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

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  resetIsolatedDb();
});

afterEach(() => {
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

describe('Atomic Booking Concurrency, Slot Holds & Domain Guards (D1/D2/D3)', () => {
  it('prevents double-booking when two clients race for the exact same slot and returns 3 alternatives', async () => {
    const db = getSnapshot();
    const service = db.services.find((s) => s.id === 'srv-gel-semipermanente-manos');
    if (!service) throw new Error('Expected seed service');
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const avail = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const openSlot = avail.days.flatMap((d) => d.slots)[0];
    expect(openSlot).toBeDefined();
    if (!openSlot) throw new Error('Expected open slot');

    const [r1, r2] = await Promise.allSettled([
      createBookingAtomic({
        serviceId: service.id,
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Clienta Carrera A',
        clientPhone: '+525511002201',
        source: 'web',
        idempotencyKey: `race-a-${Date.now()}`,
      }),
      createBookingAtomic({
        serviceId: service.id,
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Clienta Carrera B',
        clientPhone: '+525511002202',
        source: 'whatsapp',
        idempotencyKey: `race-b-${Date.now()}`,
      }),
    ]);

    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const firstRejected = rejected[0];
    if (!firstRejected || firstRejected.status !== 'rejected') {
      throw new Error('Expected rejected promise');
    }
    const err = firstRejected.reason;
    expect(err).toBeInstanceOf(SlotConflictError);
    expect(err.code).toBe('SLOT_TAKEN');
    expect(Array.isArray(err.suggestedSlots)).toBe(true);
    expect(err.suggestedSlots.length).toBeGreaterThan(0);
  });

  it('deduplicates double submissions via Idempotency-Key and enforces 3-minute slot holds', async () => {
    const db = getSnapshot();
    const service = db.services.find((s) => s.id === 'srv-gel-semipermanente-manos');
    if (!service) throw new Error('Expected seed service');
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const avail = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const openSlot = avail.days.flatMap((d) => d.slots)[0];
    expect(openSlot).toBeDefined();
    if (!openSlot) throw new Error('Expected open slot');

    const hold = await createOrRefreshSlotHold({
      serviceId: service.id,
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      sessionToken: 'sess-hold-owner',
    });
    expect(new Date(hold.expiresAt).getTime()).toBeGreaterThan(Date.now());

    await expect(
      createBookingAtomic({
        serviceId: service.id,
        addonIds: [],
        staffId: openSlot.staffId,
        startAt: openSlot.startAt,
        clientName: 'Intrusa B',
        clientPhone: '+525511009999',
        sessionToken: 'sess-other-user',
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    const idemKey = `idem-dedup-${Date.now()}`;
    const first = await createBookingAtomic({
      serviceId: service.id,
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      clientName: 'Clienta Hold A',
      clientPhone: '+525511008888',
      sessionToken: 'sess-hold-owner',
      idempotencyKey: idemKey,
    });
    const second = await createBookingAtomic({
      serviceId: service.id,
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      clientName: 'Clienta Hold A',
      clientPhone: '+525511008888',
      sessionToken: 'sess-hold-owner',
      idempotencyKey: idemKey,
    });
    expect(second.id).toBe(first.id);
    await releaseSlotHold('sess-hold-owner');
  });

  it('A7: enforces holdId + sessionToken ownership and range match on booking confirmation', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const slots = avail.days.flatMap((d) => d.slots);
    const slotA = slots[0];
    const slotB = slots[slots.length - 1];
    if (!slotA || !slotB || slotA.startAt === slotB.startAt) {
      throw new Error('Expected two distinct open slots');
    }

    const hold = await createOrRefreshSlotHold({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: slotA.staffId,
      startAt: slotA.startAt,
      sessionToken: 'sess-a7-owner',
    });
    expect(hold.holdId).toBe(hold.id);

    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: slotA.staffId,
        startAt: slotA.startAt,
        clientName: 'Otra Sesion',
        clientPhone: '+525511007701',
        sessionToken: 'sess-a7-intruder',
        holdId: hold.holdId,
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: slotB.staffId,
        startAt: slotB.startAt,
        clientName: 'Otro Horario',
        clientPhone: '+525511007702',
        sessionToken: 'sess-a7-owner',
        holdId: hold.holdId,
      }),
    ).rejects.toBeInstanceOf(SlotConflictError);

    const confirmed = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: slotA.staffId,
      startAt: slotA.startAt,
      clientName: 'Duena Hold',
      clientPhone: '+525511007703',
      sessionToken: 'sess-a7-owner',
      holdId: hold.holdId,
    });
    expect(confirmed.bookingCode).toMatch(/^NL-[A-Z2-9]{6}$/);
    expect(getSnapshot().slotHolds.some((h) => h.id === hold.holdId)).toBe(false);
  });

  it('D1: rejects 3am, past, beyond-max-days, override-closed, and unaligned slots on booking, hold, and reschedule', async () => {
    const db = getSnapshot();
    const tz = db.settings.timezone;
    const today = getDateKeyInTimezone(new Date(), tz);
    const avail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const validDay = avail.days.find((d) => d.date > today && d.slots.length > 0);
    if (!validDay || !validDay.slots[0]) throw new Error('Expected future open day');
    const validSlot = validDay.slots[0];

    const threeAmIso = zonedDateTimeToUtc(validDay.date, '03:00', tz).toISOString();
    let caughtThreeAm: unknown = null;
    try {
      await createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: threeAmIso,
        clientName: 'Nocturna',
        clientPhone: '+525511223344',
      });
    } catch (err) {
      caughtThreeAm = err;
    }
    expect(caughtThreeAm).toBeInstanceOf(PolicyError);
    expect((caughtThreeAm as PolicyError).code).toBe('OUTSIDE_HOURS');
    expect((caughtThreeAm as PolicyError).suggestedSlots?.length).toBeGreaterThan(0);

    await expect(
      createOrRefreshSlotHold({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: threeAmIso,
        sessionToken: 'sess-3am',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const pastIso = new Date(Date.now() - 3_600_000).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: pastIso,
        clientName: 'Pasado',
        clientPhone: '+525511223345',
      }),
    ).rejects.toMatchObject({ code: 'PAST_OR_NOTICE' });

    const beyondMaxIso = new Date(
      Date.now() + (db.settings.maxBookingDaysAhead + 10) * 86_400_000,
    ).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: beyondMaxIso,
        clientName: 'Futuro Lejano',
        clientPhone: '+525511223346',
      }),
    ).rejects.toMatchObject({ code: 'BEYOND_MAX_DAYS' });

    const unalignedIso = new Date(
      new Date(validSlot.startAt).getTime() + 7 * 60_000,
    ).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: unalignedIso,
        clientName: 'Desalineada',
        clientPhone: '+525511223347',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ALIGNMENT' });

    await addDateOverride({
      staffId: 'staff-karla',
      overrideDate: validDay.date,
      isUnavailable: true,
      startTime: null,
      endTime: null,
      reason: 'Vacaciones test D1',
    });
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gel-semipermanente-manos',
        addonIds: [],
        staffId: 'staff-karla',
        startAt: validSlot.startAt,
        clientName: 'Dia Cerrado',
        clientPhone: '+525511223348',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const farAvail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const farDay = farAvail.days.find(
      (d) =>
        d.slots.length > 0 &&
        new Date(d.slots[0]?.startAt ?? 0).getTime() - Date.now() > 48 * 3_600_000,
    );
    if (!farDay || !farDay.slots[0]) throw new Error('Expected future slot >48h');
    const created = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-tere',
      startAt: farDay.slots[0].startAt,
      clientName: 'Reagendar D1',
      clientPhone: '+525511223349',
    });

    await expect(
      manageClientBookingAction({
        token: created.manageToken,
        action: 'reschedule',
        newStartAt: threeAmIso,
        newStaffId: 'staff-tere',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const unchanged = getBookingByToken(created.manageToken);
    expect(unchanged?.startAt).toBe(created.startAt);
  });

  it('D2: enforces state machine transitions and restores coupon/gift card on cancel', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: 'staff-tere',
      startDate: today,
      days: 14,
    });
    const futureSlots = avail.days
      .flatMap((d) => d.slots)
      .filter((s) => new Date(s.startAt).getTime() - Date.now() > 48 * 3_600_000);
    const slot1 = futureSlots[0];
    const slot2 = futureSlots[futureSlots.length - 1];
    if (!slot1 || !slot2 || slot1.startAt === slot2.startAt) {
      throw new Error('Expected two distinct future slots');
    }

    const initialCouponUses =
      getSnapshot().coupons.find((c) => c.code === 'BIENVENIDA10')?.usedCount ?? 0;
    const withCoupon = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot1.staffId,
      startAt: slot1.startAt,
      clientName: 'Clienta Cupon',
      clientPhone: '+525533445501',
      couponCode: 'BIENVENIDA10',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'BIENVENIDA10')?.usedCount,
    ).toBe(initialCouponUses + 1);

    await updateBookingStatus({
      bookingId: withCoupon.id,
      status: 'canceled',
      cancellationReason: 'Cancelada en test D2',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'BIENVENIDA10')?.usedCount,
    ).toBe(initialCouponUses);

    await expect(
      updateBookingStatus({
        bookingId: withCoupon.id,
        status: 'confirmed',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    const cashCountBefore = getSnapshot().cashEntries.length;
    await expect(
      updateBookingStatus({
        bookingId: 'bk-1000',
        status: 'canceled',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(getSnapshot().bookings.find((b) => b.id === 'bk-1000')?.status).toBe('completed');
    expect(getSnapshot().cashEntries.length).toBe(cashCountBefore);

    const initialGiftBal =
      getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.remainingBalanceCents ?? 0;
    const withGift = await createBookingAtomic({
      serviceId: 'srv-rubber',
      addonIds: [],
      staffId: slot2.staffId,
      startAt: slot2.startAt,
      clientName: 'Clienta Gift',
      clientPhone: '+525533445502',
      couponCode: 'GIFT500',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.remainingBalanceCents,
    ).toBeLessThan(initialGiftBal);

    await manageClientBookingAction({
      token: withGift.manageToken,
      action: 'cancel',
      reason: 'Cancelada por clienta',
    });
    expect(
      getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.remainingBalanceCents,
    ).toBe(initialGiftBal);
    expect(getSnapshot().coupons.find((c) => c.code === 'GIFT500')?.usedCount).toBe(0);
  });

  it('D3: selects an actually free eligible specialist (and prefers least busy) when staffId is null', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const karlaAvail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    const patyAvail = queryAvailability({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-paty',
      startDate: today,
      days: 14,
    });

    const patyDayMap = new Map(patyAvail.days.map((d) => [d.date, d]));
    const cleanSharedDay = karlaAvail.days.find((kd) => {
      const pd = patyDayMap.get(kd.date);
      return kd.date > today && kd.slots.length >= 3 && pd && pd.slots.length >= 3;
    });
    if (!cleanSharedDay || cleanSharedDay.slots.length < 3) {
      throw new Error('Expected clean shared day with 3 fixed blocks for Karla and Paty');
    }

    const slotMorning = cleanSharedDay.slots[0];
    const slotMidday = cleanSharedDay.slots[1];
    const slotEvening = cleanSharedDay.slots[2];
    if (!slotMorning || !slotMidday || !slotEvening) {
      throw new Error('Expected three fixed slots on clean shared day');
    }

    await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startAt: slotMorning.startAt,
      clientName: 'Ocupa Karla',
      clientPhone: '+525544556601',
    });

    const autoFree = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: null,
      startAt: slotMorning.startAt,
      clientName: 'Cualquiera Libre',
      clientPhone: '+525544556602',
    });
    expect(autoFree.staffId).toBe('staff-paty');

    await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: 'staff-karla',
      startAt: slotMidday.startAt,
      clientName: 'Extra Karla',
      clientPhone: '+525544556603',
    });

    const leastBusyPick = await createBookingAtomic({
      serviceId: 'srv-gel-semipermanente-manos',
      addonIds: [],
      staffId: null,
      startAt: slotEvening.startAt,
      clientName: 'Menor Carga',
      clientPhone: '+525544556604',
    });
    expect(leastBusyPick.staffId).toBe('staff-paty');
  });

  it('Phase 2: supports multi-service booking, @instagram persistence, custom overrides, manual reminders, clients & onboarding', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const multiAvail = queryAvailability({
      serviceId: 'srv-unas-acrilicas',
      extraServiceIds: ['srv-retiro'],
      addonIds: [],
      staffId: 'staff-karla',
      startDate: today,
      days: 14,
    });
    expect(multiAvail.totals.totalDurationMinutes).toBe(180);
    expect(multiAvail.totals.subtotalCents).toBe(53000);
    expect(multiAvail.extraServices.map((s) => s.id)).toEqual(['srv-retiro']);

    const openSlot = multiAvail.days.find((d) => d.date > today && d.slots.length > 0)?.slots[0];
    if (!openSlot) throw new Error('Expected multi-service slot for Karla');

    const created = await createBookingAtomic({
      serviceId: 'srv-unas-acrilicas',
      extraServiceIds: ['srv-retiro'],
      addonIds: [],
      staffId: openSlot.staffId,
      startAt: openSlot.startAt,
      clientName: 'Valeria Puebla',
      clientPhone: '+522229998877',
      clientEmail: 'valeria.puebla@ejemplo.mx',
      clientInstagram: 'https://instagram.com/Valeria.Nails_Pue/',
      proofDeliveryMethod: 'instagram_dm',
    });

    expect(created.extraServiceIds).toEqual(['srv-retiro']);
    expect(created.totalDurationMinutes).toBe(180);
    expect(created.subtotalCents).toBe(53000);
    expect(created.depositAmountCents).toBe(20000);
    expect(created.clientInstagram).toBe('@valeria.nails_pue');
    expect(created.client.instagramHandle).toBe('@valeria.nails_pue');
    expect(created.proofDeliveryMethod).toBe('instagram_dm');

    const reminder = await sendManualBookingReminder({
      bookingId: created.id,
      channel: 'both',
    });
    expect(reminder.ok).toBe(true);
    expect(reminder.waMeUrl).toContain('https://wa.me/522229998877');
    expect(reminder.messagePreview).toContain('LAIKONA NAILS');
    expect(reminder.logs).toHaveLength(2);

    const clientCreated = await createClientProfile({
      fullName: 'Daniela Ortiz',
      phone: '2223334455',
      email: 'daniela@ejemplo.mx',
      instagramHandle: 'daniela.pue',
      notes: 'Cutícula seca',
    });
    expect(clientCreated.instagramHandle).toBe('@daniela.pue');
    expect(clientCreated.notes).toBe('Cutícula seca');

    await expect(
      createClientProfile({
        fullName: 'Duplicada',
        phone: '+522223334455',
      }),
    ).rejects.toMatchObject({ code: 'CLIENT_EXISTS' });

    const updatedClient = await updateClientNotes({
      clientId: clientCreated.id,
      instagramHandle: '@daniela.nails.mx',
      notes: 'Prefiere Cherry Red',
    });
    expect(updatedClient.instagramHandle).toBe('@daniela.nails.mx');

    const onboarding = await saveOnboardingSetup({
      businessType: 'Salón de Manicure y Uñas',
      teamSizeTier: '3 a 5',
      salonName: 'LAIKONA NAILS Puebla',
      serviceMode: 'studio',
      address: 'Puebla Centro',
      soundAlertsEnabled: true,
      onboardingCompleted: true,
      starterService: {
        name: 'Diseño Editorial Cherry',
        priceCents: 48000,
        durationMinutes: 120,
        isStartingPrice: true,
      },
    });
    expect(onboarding.settings.onboardingCompleted).toBe(true);
    expect(onboarding.settings.name).toBe('LAIKONA NAILS Puebla');
    expect(onboarding.starterService?.isStartingPrice).toBe(true);
  });

  it('invalidates in-memory cache and re-seeds cleanly when the demo DB file is deleted from disk', async () => {
    const initial = getSnapshot();
    expect(initial.settings.name).toBe('LAIKONA NAILS');
    expect(fs.existsSync(TEMP_DB_PATH)).toBe(true);

    await saveOnboardingSetup({
      salonName: 'Temporarily Mutated Salon',
      onboardingCompleted: true,
    });
    expect(getSnapshot().settings.name).toBe('Temporarily Mutated Salon');

    fs.unlinkSync(TEMP_DB_PATH);
    expect(fs.existsSync(TEMP_DB_PATH)).toBe(false);

    const reseeded = getSnapshot();
    expect(reseeded.settings.name).toBe('LAIKONA NAILS');
    expect(reseeded.settings.onboardingCompleted).toBe(false);
    expect(reseeded.staff.some((s) => s.id === 'staff-karla')).toBe(true);
    expect(reseeded.services.some((s) => s.id === 'srv-rubber')).toBe(true);
    expect(fs.existsSync(TEMP_DB_PATH)).toBe(true);
  });

  it('Property: /cita/[token] cancel/reschedule inside minimum notice window throws PolicyError without mutating booking', async () => {
    const db = getSnapshot();
    const minWindowHours = Math.min(
      db.settings.minCancelHours,
      db.settings.minRescheduleHours,
    );
    const service = db.services[0];
    const staff = db.staff[0];
    const client = db.clients[0];
    if (!service || !staff || !client) throw new Error('Missing seed data');

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 5, max: Math.max(10, minWindowHours * 60 - 15) }),
        fc.constantFrom<'cancel' | 'reschedule'>('cancel', 'reschedule'),
        async (minutesFromNow, action) => {
          const token = `prop-policy-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
          const startAt = new Date(Date.now() + minutesFromNow * 60_000).toISOString();
          const endAt = new Date(Date.now() + (minutesFromNow + 60) * 60_000).toISOString();
          const updatedAt = new Date().toISOString();

          const liveDb = getSnapshot();
          liveDb.bookings.push({
            id: `bk-${token}`,
            bookingCode: `NL-${token.slice(-4).toUpperCase()}`,
            manageToken: token,
            idempotencyKey: null,
            serviceId: service.id,
            staffId: staff.id,
            clientId: client.id,
            startAt,
            endAt,
            occupiedStartAt: startAt,
            occupiedEndAt: endAt,
            totalDurationMinutes: 60,
            subtotalCents: service.priceCents,
            discountCents: 0,
            totalPriceCents: service.priceCents,
            depositAmountCents: 0,
            couponCode: null,
            status: 'confirmed',
            source: 'web',
            clientNotes: '',
            internalNotes: '',
            inspoPhotoUrl: null,
            paymentProofUrl: null,
            googleEventId: null,
            cancellationReason: null,
            rescheduledFromId: null,
            addons: [],
            createdAt: updatedAt,
            updatedAt,
          });

          try {
            let caught: unknown = null;
            try {
              await manageClientBookingAction({
                token,
                action,
                newStartAt: new Date(Date.now() + 72 * 3_600_000).toISOString(),
                reason: 'Cambio de último minuto',
              });
            } catch (err) {
              caught = err;
            }

            expect(caught).toBeInstanceOf(PolicyError);
            expect((caught as PolicyError).code).toBe('POLICY_WINDOW');

            const after = getBookingByToken(token);
            expect(after?.status).toBe('confirmed');
            expect(after?.startAt).toBe(startAt);
            expect(after?.endAt).toBe(endAt);
            expect(after?.updatedAt).toBe(updatedAt);
          } finally {
            liveDb.bookings = liveDb.bookings.filter((b) => b.manageToken !== token);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
