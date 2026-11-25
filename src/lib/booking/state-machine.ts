import type { Booking, BookingStatus } from '../types';

export const BOOKING_TRANSITIONS = {
  pending_payment: ['confirmed', 'canceled'],
  pending_confirmation: ['confirmed', 'canceled'],
  confirmed: ['completed', 'canceled', 'no_show'],
  completed: [],
  canceled: [],
  no_show: [],
} as const satisfies Record<BookingStatus, readonly BookingStatus[]>;

const ACTIVE_STATUS_SET: ReadonlySet<BookingStatus> = new Set([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
]);

export type BookingTransitionInput = Pick<
  Booking,
  | 'id'
  | 'status'
  | 'staffId'
  | 'clientId'
  | 'totalPriceCents'
  | 'discountCents'
  | 'couponCode'
  | 'googleEventId'
>;

export type BookingTransitionEffect =
  | {
      type: 'SyncCalendar';
      action: 'create' | 'update' | 'delete';
      bookingId: string;
      staffId: string;
      googleEventId: string | null;
    }
  | {
      type: 'Notify';
      trigger: 'booking_confirmed' | 'booking_canceled';
      bookingId: string;
      cancelPending: boolean;
    }
  | {
      type: 'RecordCash';
      bookingId: string;
      staffId: string;
      amountCents: number;
    }
  | {
      type: 'ReleaseCoupon';
      bookingId: string;
      couponCode: string;
      discountCents: number;
    }
  | {
      type: 'IncrementNoShow';
      bookingId: string;
      clientId: string;
    };

export type BookingTransitionResult =
  | {
      ok: true;
      nextStatus: BookingStatus;
      effects: BookingTransitionEffect[];
    }
  | {
      ok: false;
      code: 'INVALID_TRANSITION';
      message: string;
    };

export function isActiveBookingStatus(status: BookingStatus): boolean {
  return ACTIVE_STATUS_SET.has(status);
}

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0;
}

export function canTransitionBookingStatus(
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  const allowed: readonly BookingStatus[] = BOOKING_TRANSITIONS[from];
  return allowed.includes(to);
}

export function transitionBookingStatus(
  booking: BookingTransitionInput,
  targetStatus: BookingStatus,
): BookingTransitionResult {
  if (!canTransitionBookingStatus(booking.status, targetStatus)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      message: `No es posible cambiar una cita de "${booking.status}" a "${targetStatus}".`,
    };
  }

  const effects: BookingTransitionEffect[] = [];

  if (targetStatus === 'confirmed') {
    effects.push({
      type: 'SyncCalendar',
      action: booking.googleEventId ? 'update' : 'create',
      bookingId: booking.id,
      staffId: booking.staffId,
      googleEventId: booking.googleEventId,
    });
    effects.push({
      type: 'Notify',
      trigger: 'booking_confirmed',
      bookingId: booking.id,
      cancelPending: false,
    });
  } else if (targetStatus === 'canceled') {
    effects.push({
      type: 'SyncCalendar',
      action: 'delete',
      bookingId: booking.id,
      staffId: booking.staffId,
      googleEventId: booking.googleEventId,
    });
    effects.push({
      type: 'Notify',
      trigger: 'booking_canceled',
      bookingId: booking.id,
      cancelPending: true,
    });
    if (booking.couponCode && booking.couponCode.trim().length > 0) {
      effects.push({
        type: 'ReleaseCoupon',
        bookingId: booking.id,
        couponCode: booking.couponCode,
        discountCents: booking.discountCents,
      });
    }
  } else if (targetStatus === 'completed') {
    effects.push({
      type: 'RecordCash',
      bookingId: booking.id,
      staffId: booking.staffId,
      amountCents: booking.totalPriceCents,
    });
  } else if (targetStatus === 'no_show') {
    effects.push({
      type: 'IncrementNoShow',
      bookingId: booking.id,
      clientId: booking.clientId,
    });
  }

  return {
    ok: true,
    nextStatus: targetStatus,
    effects,
  };
}
