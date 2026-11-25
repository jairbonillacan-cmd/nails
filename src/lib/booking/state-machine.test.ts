import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BOOKING_TRANSITIONS,
  canTransitionBookingStatus,
  isActiveBookingStatus,
  isTerminalBookingStatus,
  transitionBookingStatus,
  type BookingTransitionEffect,
  type BookingTransitionInput,
} from './state-machine';
import { rangesOverlap } from '../availability/engine';
import type { BookingStatus } from '../types';

const ALL_STATUSES: readonly BookingStatus[] = [
  'pending_payment',
  'pending_confirmation',
  'confirmed',
  'completed',
  'canceled',
  'no_show',
];

function makeBookingInput(
  overrides: Partial<BookingTransitionInput> = {},
): BookingTransitionInput {
  return {
    id: 'bk-1',
    status: 'pending_confirmation',
    staffId: 'staff-valeria',
    clientId: 'client-1',
    totalPriceCents: 45000,
    discountCents: 0,
    couponCode: null,
    googleEventId: null,
    ...overrides,
  };
}

describe('Booking Status State Machine (D2)', () => {
  it('enforces the exact allowed transition matrix and terminal states', () => {
    expect(isTerminalBookingStatus('completed')).toBe(true);
    expect(isTerminalBookingStatus('canceled')).toBe(true);
    expect(isTerminalBookingStatus('no_show')).toBe(true);
    expect(isTerminalBookingStatus('pending_payment')).toBe(false);
    expect(isTerminalBookingStatus('pending_confirmation')).toBe(false);
    expect(isTerminalBookingStatus('confirmed')).toBe(false);

    expect(isActiveBookingStatus('pending_payment')).toBe(true);
    expect(isActiveBookingStatus('pending_confirmation')).toBe(true);
    expect(isActiveBookingStatus('confirmed')).toBe(true);
    expect(isActiveBookingStatus('completed')).toBe(false);
    expect(isActiveBookingStatus('canceled')).toBe(false);
    expect(isActiveBookingStatus('no_show')).toBe(false);

    for (const from of ALL_STATUSES) {
      const expectedAllowed: readonly BookingStatus[] = BOOKING_TRANSITIONS[from];
      for (const to of ALL_STATUSES) {
        expect(canTransitionBookingStatus(from, to)).toBe(expectedAllowed.includes(to));
      }
    }
  });

  it('rejects reactivating canceled, completed, or no_show bookings', () => {
    for (const terminal of ['completed', 'canceled', 'no_show'] as const) {
      const booking = makeBookingInput({ status: terminal });
      for (const target of ALL_STATUSES) {
        const res = transitionBookingStatus(booking, target);
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe('INVALID_TRANSITION');
        }
      }
    }
  });

  it('emits update instead of create for Google Calendar when googleEventId already exists', () => {
    const withoutEvent = makeBookingInput({
      status: 'pending_confirmation',
      googleEventId: null,
    });
    const resCreate = transitionBookingStatus(withoutEvent, 'confirmed');
    expect(resCreate.ok).toBe(true);
    if (resCreate.ok) {
      expect(resCreate.nextStatus).toBe('confirmed');
      const expectedEffects: BookingTransitionEffect[] = [
        {
          type: 'SyncCalendar',
          action: 'create',
          bookingId: 'bk-1',
          staffId: 'staff-valeria',
          googleEventId: null,
        },
        {
          type: 'Notify',
          trigger: 'booking_confirmed',
          bookingId: 'bk-1',
          cancelPending: false,
        },
      ];
      expect(resCreate.effects).toEqual(expectedEffects);
    }

    const withEvent = makeBookingInput({
      status: 'pending_confirmation',
      googleEventId: 'gcal-evt-42',
    });
    const resUpdate = transitionBookingStatus(withEvent, 'confirmed');
    expect(resUpdate.ok).toBe(true);
    if (resUpdate.ok) {
      expect(resUpdate.effects[0]).toEqual({
        type: 'SyncCalendar',
        action: 'update',
        bookingId: 'bk-1',
        staffId: 'staff-valeria',
        googleEventId: 'gcal-evt-42',
      });
    }
  });

  it('emits Delete calendar, Cancel notification, and ReleaseCoupon when canceling a booking with coupon', () => {
    const withCoupon = makeBookingInput({
      status: 'confirmed',
      couponCode: 'BIENVENIDA10',
      discountCents: 4500,
      googleEventId: 'gcal-evt-99',
    });
    const resWithCoupon = transitionBookingStatus(withCoupon, 'canceled');
    expect(resWithCoupon.ok).toBe(true);
    if (resWithCoupon.ok) {
      expect(resWithCoupon.nextStatus).toBe('canceled');
      expect(resWithCoupon.effects).toEqual([
        {
          type: 'SyncCalendar',
          action: 'delete',
          bookingId: 'bk-1',
          staffId: 'staff-valeria',
          googleEventId: 'gcal-evt-99',
        },
        {
          type: 'Notify',
          trigger: 'booking_canceled',
          bookingId: 'bk-1',
          cancelPending: true,
        },
        {
          type: 'ReleaseCoupon',
          bookingId: 'bk-1',
          couponCode: 'BIENVENIDA10',
          discountCents: 4500,
        },
      ]);
    }

    const withoutCoupon = makeBookingInput({ status: 'pending_payment', couponCode: null });
    const resNoCoupon = transitionBookingStatus(withoutCoupon, 'canceled');
    expect(resNoCoupon.ok).toBe(true);
    if (resNoCoupon.ok) {
      expect(resNoCoupon.effects.some((e) => e.type === 'ReleaseCoupon')).toBe(false);
    }
  });

  it('emits RecordCash on completed and IncrementNoShow on no_show without mutating input', () => {
    const confirmed = makeBookingInput({ status: 'confirmed', totalPriceCents: 65000 });
    const completedRes = transitionBookingStatus(confirmed, 'completed');
    expect(completedRes.ok).toBe(true);
    if (completedRes.ok) {
      expect(completedRes.nextStatus).toBe('completed');
      expect(completedRes.effects).toEqual([
        {
          type: 'RecordCash',
          bookingId: 'bk-1',
          staffId: 'staff-valeria',
          amountCents: 65000,
        },
      ]);
    }
    expect(confirmed.status).toBe('confirmed');

    const noShowRes = transitionBookingStatus(confirmed, 'no_show');
    expect(noShowRes.ok).toBe(true);
    if (noShowRes.ok) {
      expect(noShowRes.nextStatus).toBe('no_show');
      expect(noShowRes.effects).toEqual([
        {
          type: 'IncrementNoShow',
          bookingId: 'bk-1',
          clientId: 'client-1',
        },
      ]);
    }
  });

  it('Property (D2): no sequence of bookings and state transitions ever creates overlapping active bookings', () => {
    type SimBooking = BookingTransitionInput & {
      occupiedStartMin: number;
      occupiedEndMin: number;
    };

    type SimOp =
      | {
          kind: 'create';
          staffId: string;
          startMin: number;
          durationMin: number;
          initialStatus: 'pending_payment' | 'pending_confirmation' | 'confirmed';
        }
      | {
          kind: 'transition';
          bookingIdx: number;
          targetStatus: BookingStatus;
        };

    const opArb: fc.Arbitrary<SimOp> = fc.oneof(
      fc.record({
        kind: fc.constant<'create'>('create'),
        staffId: fc.constantFrom('staff-valeria', 'staff-camila'),
        startMin: fc.integer({ min: 9 * 60, max: 18 * 60 }),
        durationMin: fc.constantFrom(30, 60, 90),
        initialStatus: fc.constantFrom<
          'pending_payment' | 'pending_confirmation' | 'confirmed'
        >('pending_payment', 'pending_confirmation', 'confirmed'),
      }),
      fc.record({
        kind: fc.constant<'transition'>('transition'),
        bookingIdx: fc.integer({ min: 0, max: 20 }),
        targetStatus: fc.constantFrom<BookingStatus>(...ALL_STATUSES),
      }),
    );

    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const ledger: SimBooking[] = [];

        for (const op of ops) {
          if (op.kind === 'create') {
            const endMin = op.startMin + op.durationMin;
            const hasActiveConflict = ledger.some(
              (b) =>
                b.staffId === op.staffId &&
                isActiveBookingStatus(b.status) &&
                rangesOverlap(op.startMin, endMin, b.occupiedStartMin, b.occupiedEndMin),
            );
            if (!hasActiveConflict) {
              ledger.push({
                id: `bk-${ledger.length}`,
                status: op.initialStatus,
                staffId: op.staffId,
                clientId: 'cli-1',
                totalPriceCents: 38000,
                discountCents: 0,
                couponCode: null,
                googleEventId: null,
                occupiedStartMin: op.startMin,
                occupiedEndMin: endMin,
              });
            }
          } else if (ledger.length > 0) {
            const idx = op.bookingIdx % ledger.length;
            const target = ledger[idx];
            if (target) {
              const res = transitionBookingStatus(target, op.targetStatus);
              if (res.ok) {
                ledger[idx] = { ...target, status: res.nextStatus };
              }
            }
          }

          for (let i = 0; i < ledger.length; i++) {
            const a = ledger[i];
            if (!a || !isActiveBookingStatus(a.status)) continue;
            for (let j = i + 1; j < ledger.length; j++) {
              const b = ledger[j];
              if (!b || !isActiveBookingStatus(b.status)) continue;
              if (a.staffId !== b.staffId) continue;
              expect(
                rangesOverlap(
                  a.occupiedStartMin,
                  a.occupiedEndMin,
                  b.occupiedStartMin,
                  b.occupiedEndMin,
                ),
              ).toBe(false);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('Property (D2): terminal states are absorbing across arbitrary transition sequences', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BookingStatus>(...ALL_STATUSES),
        fc.array(fc.constantFrom<BookingStatus>(...ALL_STATUSES), {
          minLength: 1,
          maxLength: 25,
        }),
        (initialStatus, targets) => {
          let current = makeBookingInput({ status: initialStatus });
          let lockedTerminal: BookingStatus | null = isTerminalBookingStatus(initialStatus)
            ? initialStatus
            : null;

          for (const target of targets) {
            const res = transitionBookingStatus(current, target);
            if (lockedTerminal !== null) {
              expect(res.ok).toBe(false);
              expect(current.status).toBe(lockedTerminal);
            } else if (res.ok) {
              current = { ...current, status: res.nextStatus };
              if (isTerminalBookingStatus(res.nextStatus)) {
                lockedTerminal = res.nextStatus;
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
