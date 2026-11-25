import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertSlotBookable,
  computeServiceTotals,
  diagnoseDateSlots,
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
  RecurringBlock,
  Service,
  ServiceAddon,
  SlotHold,
} from '../types';

const TEST_DATE = '2026-12-15';
const TEST_DOW = 2 as const;
const TZ = 'America/Mexico_City';
const NOW = new Date('2026-12-10T12:00:00.000Z');
const SEED_DB = createInitialDemoDatabase();
const PRIMARY_STAFF_ID = SEED_DB.staff[0]?.id ?? 'staff-karla';
const PRIMARY_SERVICE_ID = SEED_DB.services[0]?.id ?? 'srv-rubber';

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
  extraServices: Service[] = [],
): AvailabilityContext {
  const baseService = SEED_DB.services[0];
  const baseStaff = SEED_DB.staff[0];
  if (!baseService || !baseStaff) {
    throw new Error('Seed requires service and staff');
  }

  return {
    settings: {
      ...SEED_DB.settings,
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
    extraServices,
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
    serviceId: PRIMARY_SERVICE_ID,
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
    depositAmountCents: 20000,
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
          const staffId = PRIMARY_STAFF_ID;
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
              serviceId: PRIMARY_SERVICE_ID,
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
          const staffId = PRIMARY_STAFF_ID;
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
          const staffId = PRIMARY_STAFF_ID;
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
          const staffId = PRIMARY_STAFF_ID;
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

  it('Property 6 (D1): assertSlotBookable accepts a slot iff it appears in getAvailableSlotsForDate', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(30, 45, 60, 90),
        fc.constantFrom(0, 10, 15),
        fc.constantFrom(0, 10, 15),
        fc.constantFrom<15 | 30 | 60>(15, 30, 60),
        fc.integer({ min: 0, max: 180 }),
        fc.integer({ min: 1, max: 60 }),
        fc.array(
          fc.record({
            startMin: fc.integer({ min: 9 * 60, max: 18 * 60 }),
            dur: fc.constantFrom(30, 60),
          }),
          { minLength: 0, maxLength: 4 },
        ),
        fc.integer({ min: 0, max: 23 * 60 + 55 }),
        fc.constantFrom(-10, 0, 5, 120),
        (
          duration,
          bufBefore,
          bufAfter,
          interval,
          minNotice,
          maxDays,
          rawBookings,
          probeMinutes,
          dayOffsetFromNow,
        ) => {
          const staffId = PRIMARY_STAFF_ID;
          const probeDateDt = new Date(NOW.getTime() + dayOffsetFromNow * 86_400_000);
          const probeDateStr = probeDateDt.toISOString().slice(0, 10);
          const probeDow = probeDateDt.getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;

          const rules: AvailabilityRule[] = [
            { id: 'r-am', dayOfWeek: probeDow, startTime: '09:00', endTime: '14:00' },
            { id: 'r-pm', dayOfWeek: probeDow, startTime: '15:00', endTime: '19:30' },
          ];

          const bookings = rawBookings.map((b, i) => {
            const sMs = zonedDateTimeToUtc(probeDateStr, toTimeStr(b.startMin), TZ).getTime();
            const eMs = sMs + b.dur * 60_000;
            return {
              ...makeActiveBooking(`d1-${i}`, staffId, b.startMin, b.dur, bufBefore, bufAfter),
              startAt: new Date(sMs).toISOString(),
              endAt: new Date(eMs).toISOString(),
              occupiedStartAt: new Date(sMs - bufBefore * 60_000).toISOString(),
              occupiedEndAt: new Date(eMs + bufAfter * 60_000).toISOString(),
            };
          });

          const baseCtx = makeBaseContext(
            duration,
            bufBefore,
            bufAfter,
            interval,
            rules,
            [],
            bookings,
          );
          const ctx: AvailabilityContext = {
            ...baseCtx,
            settings: {
              ...baseCtx.settings,
              minBookingNoticeMinutes: minNotice,
              maxBookingDaysAhead: maxDays,
            },
          };

          const available = getAvailableSlotsForDate(ctx, probeDateStr, staffId);
          const availableStartSet = new Set(available.map((s) => s.startAt));

          const probeIso = zonedDateTimeToUtc(
            probeDateStr,
            toTimeStr(probeMinutes),
            TZ,
          ).toISOString();
          const probeResult = assertSlotBookable(ctx, {
            startAt: probeIso,
            staffId,
          });
          expect(probeResult.ok).toBe(availableStartSet.has(probeIso));
          if (probeResult.ok) {
            expect(availableStartSet.has(probeResult.slot.startAt)).toBe(true);
          }

          for (const slot of available) {
            const res = assertSlotBookable(ctx, {
              startAt: slot.startAt,
              staffId: slot.staffId,
            });
            expect(res.ok).toBe(true);
            if (res.ok) {
              expect(res.slot.startAt).toBe(slot.startAt);
            }
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('Property 7 (D7): diagnoseDateSlots(t).isAvailable iff t is in getAvailableSlotsForDate', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(30, 45, 60, 90),
        fc.constantFrom(0, 15),
        fc.constantFrom(0, 15),
        fc.constantFrom<15 | 30 | 60>(15, 30, 60),
        fc.integer({ min: 0, max: 300 }),
        fc.constantFrom(2, 10, 90),
        fc.constantFrom<'none' | 'closed' | 'custom'>('none', 'closed', 'custom'),
        fc.array(
          fc.record({
            startMin: fc.integer({ min: 9 * 60, max: 18 * 60 }),
            dur: fc.constantFrom(30, 60),
          }),
          { minLength: 0, maxLength: 4 },
        ),
        (duration, bufB, bufA, interval, minNotice, maxDays, overrideKind, rawBookings) => {
          const staffId = PRIMARY_STAFF_ID;
          const rules: AvailabilityRule[] = [
            { id: 'r1', dayOfWeek: TEST_DOW, startTime: '08:30', endTime: '13:30' },
            { id: 'r2', dayOfWeek: TEST_DOW, startTime: '15:00', endTime: '20:30' },
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
                      reason: 'Cerrado',
                    },
                  ]
                : [
                    {
                      id: 'ovr',
                      staffId,
                      overrideDate: TEST_DATE,
                      isUnavailable: false,
                      startTime: '09:15',
                      endTime: '15:15',
                      reason: 'Especial',
                    },
                  ];

          const bookings = rawBookings.map((b, i) =>
            makeActiveBooking(`d7-${i}`, staffId, b.startMin, b.dur, bufB, bufA),
          );

          const baseCtx = makeBaseContext(
            duration,
            bufB,
            bufA,
            interval,
            rules,
            [],
            bookings,
            [],
            overrides,
          );
          const ctx: AvailabilityContext = {
            ...baseCtx,
            settings: {
              ...baseCtx.settings,
              minBookingNoticeMinutes: minNotice,
              maxBookingDaysAhead: maxDays,
            },
          };

          const availableSlots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);
          const availableTimes = new Set(availableSlots.map((s) => s.localTime24));
          const diagnostics = diagnoseDateSlots(ctx, TEST_DATE, staffId);
          const diagByTime = new Map(diagnostics.map((d) => [d.time24, d]));

          for (const d of diagnostics) {
            expect(d.isAvailable).toBe(availableTimes.has(d.time24));
          }
          for (const slot of availableSlots) {
            const diagEntry = diagByTime.get(slot.localTime24);
            expect(diagEntry?.isAvailable).toBe(true);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('Property 8 (DST): transition dates preserve exact duration, monotonicity, and D1/D7 equivalence', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          { tz: 'America/New_York', date: '2026-03-08', nowIso: '2026-03-01T12:00:00.000Z' },
          { tz: 'America/New_York', date: '2026-11-01', nowIso: '2026-10-25T12:00:00.000Z' },
          { tz: 'Europe/Madrid', date: '2026-03-29', nowIso: '2026-03-20T12:00:00.000Z' },
          { tz: 'Europe/Madrid', date: '2026-10-25', nowIso: '2026-10-18T12:00:00.000Z' },
          { tz: 'America/Los_Angeles', date: '2026-03-08', nowIso: '2026-03-01T12:00:00.000Z' },
          { tz: 'America/Los_Angeles', date: '2026-11-01', nowIso: '2026-10-25T12:00:00.000Z' },
        ),
        fc.constantFrom(30, 45, 60, 90),
        fc.constantFrom<15 | 30 | 60>(15, 30, 60),
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 5, max: 14 }),
        fc.integer({ min: 0, max: 100 }),
        (dstCase, duration, interval, startH, endH, pickIdx) => {
          const staffId = PRIMARY_STAFF_ID;
          const baseCtx = makeBaseContext(duration, 0, 15, interval, [
            {
              id: 'r-dst',
              dayOfWeek: 0,
              startTime: toTimeStr(startH * 60),
              endTime: toTimeStr(endH * 60),
            },
          ]);
          const ctx: AvailabilityContext = {
            ...baseCtx,
            now: new Date(dstCase.nowIso),
            settings: {
              ...baseCtx.settings,
              timezone: dstCase.tz,
              slotIntervalMinutes: interval,
              minBookingNoticeMinutes: 0,
              maxBookingDaysAhead: 60,
            },
          };

          const slots = getAvailableSlotsForDate(ctx, dstCase.date, staffId);
          const diag = diagnoseDateSlots(ctx, dstCase.date, staffId);
          const availableSet = new Set(slots.map((s) => s.localTime24));

          let prevStartMs = -Infinity;
          for (const slot of slots) {
            const startMs = new Date(slot.startAt).getTime();
            const endMs = new Date(slot.endAt).getTime();
            expect(endMs - startMs).toBe(duration * 60_000);
            expect(startMs).toBeGreaterThan(prevStartMs);
            prevStartMs = startMs;
          }

          if (slots.length > 0) {
            const sampled = new Map<string, (typeof slots)[number]>();
            const first = slots[0];
            const last = slots[slots.length - 1];
            const picked = slots[pickIdx % slots.length];
            if (first) sampled.set(first.startAt, first);
            if (last) sampled.set(last.startAt, last);
            if (picked) sampled.set(picked.startAt, picked);
            for (const slot of slots) {
              if (slot.localTime24 >= '01:00' && slot.localTime24 <= '03:30') {
                sampled.set(slot.startAt, slot);
              }
            }
            for (const slot of sampled.values()) {
              const check = assertSlotBookable(ctx, {
                startAt: slot.startAt,
                staffId,
              });
              expect(check.ok).toBe(true);
            }
          }

          for (const d of diag) {
            expect(d.isAvailable).toBe(availableSet.has(d.time24));
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 9 (Fixed Start Times): only configured fixed blocks are offered and D1/D7 stay equivalent', () => {
    const fixedPool = [
      '09:00',
      '10:00',
      '11:30',
      '13:30',
      '14:00',
      '16:00',
      '16:30',
      '18:00',
    ];
    fc.assert(
      fc.property(
        fc.subarray(fixedPool, { minLength: 1, maxLength: 6 }),
        fc.constantFrom(30, 60, 90, 120, 150),
        fc.constantFrom<15 | 30 | 60>(15, 30, 60),
        fc.array(
          fc.record({
            startMin: fc.integer({ min: 9 * 60, max: 19 * 60 }),
            dur: fc.constantFrom(60, 120),
          }),
          { minLength: 0, maxLength: 3 },
        ),
        fc.constantFrom('10:30', '12:00', '15:00', '17:00'),
        fc.boolean(),
        (fixedStartTimes, duration, interval, rawBookings, probeTime, isClosed) => {
          const staffId = PRIMARY_STAFF_ID;
          const fixedSet = new Set(fixedStartTimes);
          const rules: AvailabilityRule[] = [
            {
              id: 'r-fixed',
              dayOfWeek: TEST_DOW,
              startTime: '09:00',
              endTime: '20:30',
              fixedStartTimes,
            },
          ];
          const bookings = rawBookings.map((b, i) =>
            makeActiveBooking(`fx-${i}`, staffId, b.startMin, b.dur, 0, 0),
          );
          const overrides: DateOverride[] = isClosed
            ? [
                {
                  id: 'ovr-fx',
                  staffId,
                  overrideDate: TEST_DATE,
                  isUnavailable: true,
                  startTime: null,
                  endTime: null,
                  reason: 'Cerrado',
                },
              ]
            : [];

          const ctx = makeBaseContext(
            duration,
            0,
            0,
            interval,
            rules,
            [],
            bookings,
            [],
            overrides,
          );

          const slots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);
          const availableTimes = new Set(slots.map((s) => s.localTime24));

          for (const slot of slots) {
            expect(fixedSet.has(slot.localTime24)).toBe(true);
            const check = assertSlotBookable(ctx, {
              startAt: slot.startAt,
              staffId,
            });
            expect(check.ok).toBe(true);
          }

          const probeIso = zonedDateTimeToUtc(TEST_DATE, probeTime, TZ).toISOString();
          const probeCheck = assertSlotBookable(ctx, {
            startAt: probeIso,
            staffId,
          });
          expect(probeCheck.ok).toBe(false);

          const diag = diagnoseDateSlots(ctx, TEST_DATE, staffId);
          const diagByTime = new Map(diag.map((d) => [d.time24, d]));
          for (const d of diag) {
            expect(d.isAvailable).toBe(availableTimes.has(d.time24));
          }
          for (const slot of slots) {
            expect(diagByTime.get(slot.localTime24)?.isAvailable).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 10 (Multi-service): extraServices sum durations/prices and take max buffers accurately', () => {
    const templateService = SEED_DB.services[0];
    if (!templateService) {
      throw new Error('Seed requires at least one service');
    }

    fc.assert(
      fc.property(
        fc.constantFrom(30, 60, 90, 120),
        fc.constantFrom(0, 5, 10),
        fc.constantFrom(0, 5, 10),
        fc.array(
          fc.record({
            durationMinutes: fc.constantFrom(30, 45, 60, 90),
            priceCents: fc.constantFrom(8000, 15000, 25000, 50000),
            bufferBeforeMinutes: fc.constantFrom(0, 5, 15),
            bufferAfterMinutes: fc.constantFrom(0, 10, 15),
          }),
          { minLength: 1, maxLength: 3 },
        ),
        fc.array(fc.constantFrom(15, 20, 30), { minLength: 0, maxLength: 3 }),
        (baseDur, baseBufB, baseBufA, rawExtras, addonMins) => {
          const staffId = PRIMARY_STAFF_ID;
          const extraServices: Service[] = rawExtras.map((extra, idx) => ({
            ...templateService,
            id: SEED_DB.services[(idx + 1) % SEED_DB.services.length]?.id ?? `srv-extra-${idx}`,
            durationMinutes: extra.durationMinutes,
            priceCents: extra.priceCents,
            bufferBeforeMinutes: extra.bufferBeforeMinutes,
            bufferAfterMinutes: extra.bufferAfterMinutes,
          }));
          const addons: ServiceAddon[] = addonMins.map((extraMinutes, idx) => ({
            id: `a-ms-${idx}`,
            name: `Extra ${idx}`,
            description: '',
            extraMinutes,
            extraPriceCents: 10000,
            appliesToAll: true,
            serviceIds: [],
            isActive: true,
            displayOrder: idx,
          }));

          const ctx = makeBaseContext(
            baseDur,
            baseBufB,
            baseBufA,
            30,
            [
              {
                id: 'r-ms',
                dayOfWeek: TEST_DOW,
                startTime: '09:00',
                endTime: '20:30',
                fixedStartTimes: ['10:00', '13:30', '16:30'],
              },
            ],
            addons,
            [],
            [],
            [],
            extraServices,
          );

          const expectedDuration =
            baseDur +
            extraServices.reduce((acc, s) => acc + s.durationMinutes, 0) +
            addonMins.reduce((acc, m) => acc + m, 0);
          const expectedPrice =
            ctx.service.priceCents +
            extraServices.reduce((acc, s) => acc + s.priceCents, 0) +
            addons.length * 10000;
          const expectedBufB = Math.max(
            baseBufB,
            ...extraServices.map((s) => s.bufferBeforeMinutes),
          );
          const expectedBufA = Math.max(
            baseBufA,
            ...extraServices.map((s) => s.bufferAfterMinutes),
          );

          const totals = computeServiceTotals(ctx.service, addons, extraServices);
          expect(totals.totalDurationMinutes).toBe(expectedDuration);
          expect(totals.subtotalCents).toBe(expectedPrice);
          expect(totals.bufferBeforeMinutes).toBe(expectedBufB);
          expect(totals.bufferAfterMinutes).toBe(expectedBufA);

          const windowEndMs = zonedDateTimeToUtc(TEST_DATE, '20:30', TZ).getTime();
          const slots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);
          for (const slot of slots) {
            const startMs = new Date(slot.startAt).getTime();
            const endMs = new Date(slot.endAt).getTime();
            const occStartMs = new Date(slot.occupiedStartAt).getTime();
            const occEndMs = new Date(slot.occupiedEndAt).getTime();

            expect(endMs - startMs).toBe(expectedDuration * 60_000);
            expect(startMs - occStartMs).toBe(expectedBufB * 60_000);
            expect(occEndMs - endMs).toBe(expectedBufA * 60_000);
            expect(endMs).toBeLessThanOrEqual(windowEndMs);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 11 (Recurring Blocks): slots never overlap active recurring blocks and stay 1:1 with D1/D7', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'weekly' | 'monthly'>('weekly', 'monthly'),
        fc.integer({ min: 9, max: 16 }),
        fc.integer({ min: 1, max: 3 }),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom(60, 120),
        (frequency, blockStartH, blockDurH, isActive, expiredUntil, duration) => {
          const staffId = PRIMARY_STAFF_ID;
          const blockStartStr = toTimeStr(blockStartH * 60);
          const blockEndStr = toTimeStr((blockStartH + blockDurH) * 60);
          const block: RecurringBlock = {
            id: 'rb-prop',
            staffId,
            reason: 'Bloqueo test',
            frequency,
            weekdays: frequency === 'weekly' ? [TEST_DOW] : [],
            dayOfMonth: frequency === 'monthly' ? 15 : null,
            startTime: blockStartStr,
            endTime: blockEndStr,
            untilDate: expiredUntil ? '2026-12-10' : '2026-12-31',
            isActive,
          };

          const baseCtx = makeBaseContext(duration, 0, 15, 30, [
            { id: 'r-rb', dayOfWeek: TEST_DOW, startTime: '09:00', endTime: '20:00' },
          ]);
          const ctx: AvailabilityContext = {
            ...baseCtx,
            recurringBlocks: [block],
          };

          const slots = getAvailableSlotsForDate(ctx, TEST_DATE, staffId);
          const availableTimes = new Set(slots.map((s) => s.localTime24));
          const bStartMs = zonedDateTimeToUtc(TEST_DATE, blockStartStr, TZ).getTime();
          const bEndMs = zonedDateTimeToUtc(TEST_DATE, blockEndStr, TZ).getTime();
          const applies = isActive && !expiredUntil;

          for (const slot of slots) {
            if (applies) {
              const occStart = new Date(slot.occupiedStartAt).getTime();
              const occEnd = new Date(slot.occupiedEndAt).getTime();
              expect(rangesOverlap(occStart, occEnd, bStartMs, bEndMs)).toBe(false);
            }
          }

          if (slots[0]) {
            expect(
              assertSlotBookable(ctx, { startAt: slots[0].startAt, staffId }).ok,
            ).toBe(true);
          }

          const diag = diagnoseDateSlots(ctx, TEST_DATE, staffId);
          for (const d of diag) {
            expect(d.isAvailable).toBe(availableTimes.has(d.time24));
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
