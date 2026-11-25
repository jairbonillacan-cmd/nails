import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  getAvailableSlotsForDate,
  rangesOverlap,
  zonedDateTimeToUtc,
  type AvailabilityContext,
} from './engine';
import { checkManagePolicyWindow } from './policy';
import { createInitialDemoDatabase } from '../demo-seed';
import type {
  AvailabilityRule,
  Booking,
  DateOverride,
  ServiceAddon,
  SlotHold,
} from '../types';

const TEST_DATE = '2026-12-15';
const TEST_DOW = 2 as const;
const TZ = 'America/Mexico_City';
const NOW = new Date('2026-12-10T12:00:00.000Z');

function toTimeStr(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function makeBaseContext(
  durationMinutes: number,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  slotIntervalMinutes: 15 | 30 | 60,
  rules: AvailabilityRule[],
  addons: ServiceAddon[] = [],
  bookings: Booking[] = [],
  slotHolds: SlotHold[] = [],
  dateOverrides: DateOverride[] = [],
): AvailabilityContext {
  const db = createInitialDemoDatabase();
  const baseService = db.services[0];
  const baseStaff = db.staff[0];
  if (!baseService || !baseStaff) {
    throw new Error('Seed requires service and staff');
  }

  return {
    settings: {
      ...db.settings,
      timezone: TZ,
      slotIntervalMinutes,
      minBookingNoticeMinutes: 0,
      maxBookingDaysAhead: 90,
    },
    service: {
      ...baseService,
      durationMinutes,
      bufferBeforeMinutes,
      bufferAfterMinutes,
    },
    addons,
    staffMembers: [baseStaff],
    schedules: [
      {
        id: 'sched-prop',
        staffId: baseStaff.id,
        name: 'Prop',
        timezone: TZ,
        isDefault: true,
        rules,
      },
    ],
    dateOverrides,
    bookings,
    slotHolds,
    calendarConnections: [],
    now: NOW,
    callerSessionToken: 'caller-session',
  };
}

function makeActiveBooking(
  id: string,
  staffId: string,
  startMin: number,
  durationMin: number,
  bufBefore: number,
  bufAfter: number,
): Booking {
  const startMs = zonedDateTimeToUtc(TEST_DATE, toTimeStr(startMin), TZ).getTime();
  const endMs = startMs + durationMin * 60_000;
  return {
    id,
    bookingCode: `NL-${id}`,
    manageToken: `tok-${id}`,
    idempotencyKey: null,
    serviceId: 'srv-gelish-manicure',
    staffId,
    clientId: 'client-1',
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    occupiedStartAt: new Date(startMs - bufBefore * 60_000).toISOString(),
    occupiedEndAt: new Date(endMs + bufAfter * 60_000).toISOString(),
    totalDurationMinutes: durationMin,
    subtotalCents: 38000,
    discountCents: 0,
    totalPriceCents: 38000,
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
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  };
}

describe('Availability Engine Property-Based Invariants (fast-check)', () => {
  it('Property 1: no generated slot overlaps active bookings or unexpired holds including buffers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(30, 45, 60, 75, 90, 120),
        fc.constantFrom(0, 10, 15, 30),
        fc.constantFrom(0, 10, 15, 30),
        fc.constantFrom<15 | 30 | 60>(15, 30, 60),
        fc.array(
          fc.record({
            startMin: fc.integer({ min: 9 * 60, max: 18 * 60 }),
            dur: fc.constantFrom(30, 45, 60, 90),
            bufB: fc.constantFrom(0, 15),
            bufA: fc.constantFrom(0, 15),
          }),
          { minLength: 0, maxLength: 6 },
        ),
        fc.array(
          fc.record({
            startMin: fc.integer({ min: 9 * 60, max: 18 * 60 }),
            dur: fc.constantFrom(30, 60),
          }),
          { minLength: 0, maxLength: 4 },
        ),
        (duration, bufBefore, bufAfter, interval, rawBookings, rawHolds) => {
          const staffId = 'staff-valeria';
          const rules: AvailabilityRule[] = [
            { id: 'r1', dayOfWeek: TEST_DOW, startTime: '09:00', endTime: '20:00' },
          ];
          const bookings = rawBookings.map((b, i) =>
            makeActiveBooking(`b-${i}`, staffId, b.startMin, b.dur, b.bufB, b.bufA),
          );
          const holds: SlotHold[] = rawHolds.map((h, i) => {
            const sMs = zonedDateTimeToUtc(TEST_DATE, toTimeStr(h.startMin), TZ).getTime();
            return {
              id: `h-${i}`,
              staffId,
              serviceId: 'srv-gelish-manicure',
              sessionToken: `other-session-${i}`,
              startAt: new Date(sMs).toISOString(),
              endAt: new Date(sMs + h.dur * 60_000).toISOString(),
              expiresAt: new Date(NOW.getTime() + 180_000).toISOString(),
              createdAt: NOW.toISOString(),
            };
          });

          const ctx = makeBaseContext(
            duration,
            bufBefore,
            bufAfter,
            interval,
            rules,
            [],
            bookings,
            holds,
          );
          const slots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);

          for (const slot of slots) {
            const sOccStart = new Date(slot.occupiedStartAt).getTime();
            const sOccEnd = new Date(slot.occupiedEndAt).getTime();
            for (const b of bookings) {
              const bStart = new Date(b.occupiedStartAt).getTime();
              const bEnd = new Date(b.occupiedEndAt).getTime();
              expect(rangesOverlap(sOccStart, sOccEnd, bStart, bEnd)).toBe(false);
            }
            for (const h of holds) {
              const hStart = new Date(h.startAt).getTime();
              const hEnd = new Date(h.endAt).getTime();
              expect(rangesOverlap(sOccStart, sOccEnd, hStart, hEnd)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property 2: every slot fits completely inside active working windows and respects date overrides', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(30, 45, 60, 90),
        fc.integer({ min: 8, max: 11 }),
        fc.integer({ min: 12, max: 14 }),
        fc.integer({ min: 15, max: 17 }),
        fc.integer({ min: 18, max: 21 }),
        fc.constantFrom<'none' | 'closed' | 'custom'>('none', 'closed', 'custom'),
        fc.integer({ min: 10, max: 13 }),
        fc.integer({ min: 14, max: 18 }),
        (duration, mStart, mEnd, aStart, aEnd, overrideKind, ovrStartH, ovrEndH) => {
          const staffId = 'staff-valeria';
          const rules: AvailabilityRule[] = [
            {
              id: 'morning',
              dayOfWeek: TEST_DOW,
              startTime: toTimeStr(mStart * 60),
              endTime: toTimeStr(mEnd * 60),
            },
            {
              id: 'afternoon',
              dayOfWeek: TEST_DOW,
              startTime: toTimeStr(aStart * 60),
              endTime: toTimeStr(aEnd * 60),
            },
          ];

          const overrides: DateOverride[] =
            overrideKind === 'none'
              ? []
              : overrideKind === 'closed'
                ? [
                    {
                      id: 'ovr',
                      staffId,
                      overrideDate: TEST_DATE,
                      isUnavailable: true,
                      startTime: null,
                      endTime: null,
                      reason: 'Vacaciones',
                    },
                  ]
                : [
                    {
                      id: 'ovr',
                      staffId,
                      overrideDate: TEST_DATE,
                      isUnavailable: false,
                      startTime: toTimeStr(ovrStartH * 60),
                      endTime: toTimeStr(ovrEndH * 60),
                      reason: 'Horario especial',
                    },
                  ];

          const ctx = makeBaseContext(
            duration,
            0,
            0,
            15,
            rules,
            [],
            [],
            [],
            overrides,
          );
          const slots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);

          if (overrideKind === 'closed') {
            expect(slots).toHaveLength(0);
            return;
          }

          const activeWindows =
            overrideKind === 'custom'
              ? [{ startH: ovrStartH, endH: ovrEndH }]
              : [
                  { startH: mStart, endH: mEnd },
                  { startH: aStart, endH: aEnd },
                ];

          for (const slot of slots) {
            const sStart = new Date(slot.startAt).getTime();
            const sEnd = new Date(slot.endAt).getTime();
            const fitsSomeWindow = activeWindows.some((w) => {
              const wStart = zonedDateTimeToUtc(
                TEST_DATE,
                toTimeStr(w.startH * 60),
                TZ,
              ).getTime();
              const wEnd = zonedDateTimeToUtc(
                TEST_DATE,
                toTimeStr(w.endH * 60),
                TZ,
              ).getTime();
              return sStart >= wStart && sEnd <= wEnd;
            });
            expect(fitsSomeWindow).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property 3: slot duration always equals base duration plus sum of add-ons and exact buffers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 15, max: 120 }),
        fc.constantFrom(0, 5, 10, 15, 20),
        fc.constantFrom(0, 5, 10, 15, 20),
        fc.array(fc.integer({ min: 0, max: 45 }), { minLength: 0, maxLength: 5 }),
        (baseDuration, bufBefore, bufAfter, addonMinutesList) => {
          const staffId = 'staff-valeria';
          const addons: ServiceAddon[] = addonMinutesList.map((extraMinutes, idx) => ({
            id: `a-${idx}`,
            name: `Extra ${idx}`,
            description: '',
            extraMinutes,
            extraPriceCents: 5000,
            appliesToAll: true,
            serviceIds: [],
            isActive: true,
            displayOrder: idx,
          }));
          const expectedDuration =
            baseDuration + addonMinutesList.reduce((acc, m) => acc + m, 0);

          const ctx = makeBaseContext(
            baseDuration,
            bufBefore,
            bufAfter,
            30,
            [{ id: 'r1', dayOfWeek: TEST_DOW, startTime: '08:00', endTime: '21:00' }],
            addons,
          );
          const slots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);

          for (const slot of slots) {
            const startMs = new Date(slot.startAt).getTime();
            const endMs = new Date(slot.endAt).getTime();
            const occStartMs = new Date(slot.occupiedStartAt).getTime();
            const occEndMs = new Date(slot.occupiedEndAt).getTime();

            expect(endMs - startMs).toBe(expectedDuration * 60_000);
            expect(startMs - occStartMs).toBe(bufBefore * 60_000);
            expect(occEndMs - endMs).toBe(bufAfter * 60_000);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property 4: monotonicity — adding a booking or shortening hours never creates new slots', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(30, 45, 60, 90),
        fc.integer({ min: 9, max: 11 }),
        fc.integer({ min: 17, max: 20 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        fc.integer({ min: 9 * 60, max: 18 * 60 }),
        fc.constantFrom(30, 60, 90),
        (duration, startH, endH, trimStartH, trimEndH, extraBookMin, extraBookDur) => {
          const staffId = 'staff-valeria';
          const initialRules: AvailabilityRule[] = [
            {
              id: 'r1',
              dayOfWeek: TEST_DOW,
              startTime: toTimeStr(startH * 60),
              endTime: toTimeStr(endH * 60),
            },
          ];

          const baseCtx = makeBaseContext(duration, 0, 15, 15, initialRules);
          const baseSlots = new Set(
            getAvailableSlotsForDate(baseCtx, TEST_DATE, staffId).map((s) => s.startAt),
          );

          const withNewBookingCtx = makeBaseContext(
            duration,
            0,
            15,
            15,
            initialRules,
            [],
            [makeActiveBooking('extra', staffId, extraBookMin, extraBookDur, 0, 15)],
          );
          const afterBooking = getAvailableSlotsForDate(
            withNewBookingCtx,
            TEST_DATE,
            staffId,
          );
          for (const slot of afterBooking) {
            expect(baseSlots.has(slot.startAt)).toBe(true);
          }

          const newStartH = startH + trimStartH;
          const newEndH = endH - trimEndH;
          const shortenedRules: AvailabilityRule[] =
            newStartH < newEndH
              ? [
                  {
                    id: 'r1',
                    dayOfWeek: TEST_DOW,
                    startTime: toTimeStr(newStartH * 60),
                    endTime: toTimeStr(newEndH * 60),
                  },
                ]
              : [];
          const shortenedCtx = makeBaseContext(duration, 0, 15, 15, shortenedRules);
          const afterShorten = getAvailableSlotsForDate(shortenedCtx, TEST_DATE, staffId);
          for (const slot of afterShorten) {
            expect(baseSlots.has(slot.startAt)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('Property 5: policy window check rejects every cancel/reschedule inside minimum notice hours', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 48 }),
        fc.double({ min: -10, max: 0.99, noNaN: true }),
        fc.constantFrom<'cancel' | 'reschedule'>('cancel', 'reschedule'),
        (minHours, fractionOfWindow, action) => {
          const nowMs = NOW.getTime();
          const offsetHours = minHours * fractionOfWindow;
          const startAtIso = new Date(nowMs + offsetHours * 3_600_000).toISOString();

          const res = checkManagePolicyWindow({
            startAtIso,
            nowMs,
            minHours,
            action,
          });
          expect(res.allowed).toBe(false);
          if (!res.allowed) {
            expect(res.code).toBe('POLICY_WINDOW');
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
