import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createBookingAtomic,
  createOrRefreshSlotHold,
  getBookingByToken,
  getSnapshot,
  manageClientBookingAction,
  PolicyError,
  queryAvailability,
  releaseSlotHold,
  SlotConflictError,
} from './db';
import { getDateKeyInTimezone } from '../format';

describe('Atomic Booking Concurrency & 3-Minute Slot Hold', () => {
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
