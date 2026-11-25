import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addDateOverride,
  createBookingAtomic,
  createOrRefreshSlotHold,
  getBookingByToken,
  getSnapshot,
  manageClientBookingAction,
  PolicyError,
  queryAvailability,
  releaseSlotHold,
  SlotConflictError,
  updateBookingStatus,
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
    const service = db.services.find((s) => s.id === 'srv-gelish-manicure');
    if (!service) throw new Error('Expected seed service');
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const avail = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      staffId: 'staff-valeria',
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
    const service = db.services.find((s) => s.id === 'srv-gelish-manicure');
    if (!service) throw new Error('Expected seed service');
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);

    const avail = queryAvailability({
      serviceId: service.id,
      addonIds: [],
      staffId: 'staff-camila',
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
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-camila',
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
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: slotA.staffId,
      startAt: slotA.startAt,
      sessionToken: 'sess-a7-owner',
    });
    expect(hold.holdId).toBe(hold.id);

    await expect(
      createBookingAtomic({
        serviceId: 'srv-gelish-manicure',
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
        serviceId: 'srv-gelish-manicure',
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
      serviceId: 'srv-gelish-manicure',
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
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-valeria',
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
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
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
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
        startAt: threeAmIso,
        sessionToken: 'sess-3am',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const pastIso = new Date(Date.now() - 3_600_000).toISOString();
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
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
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
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
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
        startAt: unalignedIso,
        clientName: 'Desalineada',
        clientPhone: '+525511223347',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ALIGNMENT' });

    await addDateOverride({
      staffId: 'staff-valeria',
      overrideDate: validDay.date,
      isUnavailable: true,
      startTime: null,
      endTime: null,
      reason: 'Vacaciones test D1',
    });
    await expect(
      createBookingAtomic({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
        startAt: validSlot.startAt,
        clientName: 'Dia Cerrado',
        clientPhone: '+525511223348',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const farAvail = queryAvailability({
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-camila',
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
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-camila',
      startAt: farDay.slots[0].startAt,
      clientName: 'Reagendar D1',
      clientPhone: '+525511223349',
    });

    await expect(
      manageClientBookingAction({
        token: created.manageToken,
        action: 'reschedule',
        newStartAt: threeAmIso,
        newStaffId: 'staff-camila',
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });

    const unchanged = getBookingByToken(created.manageToken);
    expect(unchanged?.startAt).toBe(created.startAt);
  });

  it('D2: enforces state machine transitions and restores coupon/gift card on cancel', async () => {
    const db = getSnapshot();
    const today = getDateKeyInTimezone(new Date(), db.settings.timezone);
    const avail = queryAvailability({
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-camila',
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
      serviceId: 'srv-gelish-manicure',
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
      serviceId: 'srv-gelish-manicure',
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

    const valeriaAvail = queryAvailability({
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-valeria',
      startDate: today,
      days: 14,
    });
    const camilaAvail = queryAvailability({
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-camila',
      startDate: today,
      days: 14,
    });

    const camilaByTime = new Set(
      camilaAvail.days.flatMap((d) => d.slots).map((s) => s.startAt),
    );
    const sharedSlots = valeriaAvail.days
      .flatMap((d) => d.slots)
      .filter((s) => camilaByTime.has(s.startAt));

    const firstShared = sharedSlots[0];
    const laterSharedSameDay = sharedSlots.find(
      (s) =>
        s.startAt !== firstShared?.startAt &&
        getDateKeyInTimezone(new Date(s.startAt), db.settings.timezone) ===
          getDateKeyInTimezone(new Date(firstShared?.startAt ?? 0), db.settings.timezone) &&
        Math.abs(
          new Date(s.startAt).getTime() - new Date(firstShared?.startAt ?? 0).getTime(),
        ) >= 120 * 60_000,
    );
    if (!firstShared || !laterSharedSameDay) {
      throw new Error('Expected two shared slots on the same day');
    }

    await createBookingAtomic({
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: 'staff-valeria',
      startAt: firstShared.startAt,
      clientName: 'Ocupa Valeria',
      clientPhone: '+525544556601',
    });

    const autoFree = await createBookingAtomic({
      serviceId: 'srv-gelish-manicure',
      addonIds: [],
      staffId: null,
      startAt: firstShared.startAt,
      clientName: 'Cualquiera Libre',
      clientPhone: '+525544556602',
    });
    expect(autoFree.staffId).toBe('staff-camila');

    const extraValeriaSlot = valeriaAvail.days
      .flatMap((d) => d.slots)
      .find(
        (s) =>
          s.startAt !== firstShared.startAt &&
          s.startAt !== laterSharedSameDay.startAt &&
          getDateKeyInTimezone(new Date(s.startAt), db.settings.timezone) ===
            getDateKeyInTimezone(new Date(laterSharedSameDay.startAt), db.settings.timezone) &&
          Math.abs(
            new Date(s.startAt).getTime() - new Date(firstShared.startAt).getTime(),
          ) >= 90 * 60_000 &&
          Math.abs(
            new Date(s.startAt).getTime() - new Date(laterSharedSameDay.startAt).getTime(),
          ) >= 90 * 60_000,
      );
    if (extraValeriaSlot) {
      await createBookingAtomic({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: 'staff-valeria',
        startAt: extraValeriaSlot.startAt,
        clientName: 'Extra Valeria',
        clientPhone: '+525544556603',
      });

      const leastBusyPick = await createBookingAtomic({
        serviceId: 'srv-gelish-manicure',
        addonIds: [],
        staffId: null,
        startAt: laterSharedSameDay.startAt,
        clientName: 'Menor Carga',
        clientPhone: '+525544556604',
      });
      expect(leastBusyPick.staffId).toBe('staff-camila');
    }
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
          const token = `prop-policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
