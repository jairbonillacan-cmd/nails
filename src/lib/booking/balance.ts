import type { Booking, CashRegisterEntry, PaymentSplit } from '../types';
import { isActiveBookingStatus } from './state-machine';

export type BookingBalanceInput = Pick<
  Booking,
  'id' | 'status' | 'totalPriceCents' | 'depositAmountCents' | 'endAt'
> & {
  paymentProofUrl?: string | null;
  proofDeliveryMethod?: Booking['proofDeliveryMethod'] | null;
};

export type BookingProofInput = {
  paymentProofUrl?: string | null;
  proofDeliveryMethod?: Booking['proofDeliveryMethod'] | null;
};

export type BookingPastUnclosedInput = Pick<Booking, 'status' | 'endAt'>;

export type BalanceSplitInput = Pick<PaymentSplit, 'bookingId' | 'amountCents' | 'tipCents'> & {
  method?: PaymentSplit['method'];
  reference?: string | null;
};

export type BalanceCashEntryInput = Pick<
  CashRegisterEntry,
  'bookingId' | 'entryType' | 'amountCents' | 'tipCents'
>;

export interface BookingBalanceSummary {
  totalPriceCents: number;
  paidCents: number;
  appliedPaidCents: number;
  remainingCents: number;
  changeCents: number;
  depositPaidCents: number;
  totalTipsCents: number;
  isFullyPaid: boolean;
  isUncollected: boolean;
  isPastUnclosed: boolean;
  hasDepositAwaitingReview: boolean;
  hasDepositMissingProof: boolean;
}

function toNonNegativeCents(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function isPastUnclosedBooking(
  booking: BookingPastUnclosedInput,
  nowMs: number = Date.now(),
): boolean {
  if (!isActiveBookingStatus(booking.status)) return false;
  const endMs = Date.parse(booking.endAt);
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) return false;
  return endMs < nowMs;
}

export function hasBookingProofSubmitted(booking: BookingProofInput): boolean {
  if (typeof booking.paymentProofUrl === 'string' && booking.paymentProofUrl.trim().length > 0) {
    return true;
  }
  return (
    booking.proofDeliveryMethod === 'web_upload' ||
    booking.proofDeliveryMethod === 'web_link' ||
    booking.proofDeliveryMethod === 'instagram_dm'
  );
}

export function isPendingDepositStatus(status: Booking['status']): boolean {
  return status === 'pending_confirmation' || status === 'pending_payment';
}

function isDepositSplit(split: BalanceSplitInput): boolean {
  if (split.method === 'online') return true;
  const ref = split.reference?.trim().toLowerCase() ?? '';
  return ref.startsWith('anticipo') || ref.includes('anticipo');
}

export function computeBookingBalance(
  booking: BookingBalanceInput,
  splits: readonly BalanceSplitInput[] = [],
  cashEntries: readonly BalanceCashEntryInput[] = [],
  nowMs: number = Date.now(),
): BookingBalanceSummary {
  const totalPriceCents = toNonNegativeCents(booking.totalPriceCents);

  let splitsPaidCents = 0;
  let splitsTipsCents = 0;
  let splitsDepositCents = 0;

  for (const split of splits) {
    if (split.bookingId !== booking.id) continue;
    const amt = toNonNegativeCents(split.amountCents);
    const tip = toNonNegativeCents(split.tipCents);
    splitsPaidCents += amt;
    splitsTipsCents += tip;
    if (amt > 0 && isDepositSplit(split)) {
      splitsDepositCents += amt;
    }
  }

  let cashPaidCents = 0;
  let cashTipsCents = 0;
  let cashDepositCents = 0;

  for (const entry of cashEntries) {
    if (entry.bookingId !== booking.id) continue;
    if (entry.entryType === 'expense') continue;
    const amt = toNonNegativeCents(entry.amountCents);
    const tip = toNonNegativeCents(entry.tipCents);
    cashPaidCents += amt;
    cashTipsCents += tip;
    if (entry.entryType === 'deposit') {
      cashDepositCents += amt;
    }
  }

  const paidCents = Math.max(splitsPaidCents, cashPaidCents);
  const totalTipsCents = Math.max(splitsTipsCents, cashTipsCents);
  const appliedPaidCents = Math.min(paidCents, totalPriceCents);
  const remainingCents = Math.max(0, totalPriceCents - paidCents);
  const changeCents = Math.max(0, paidCents - totalPriceCents);
  const depositPaidCents = Math.min(paidCents, Math.max(splitsDepositCents, cashDepositCents));

  const isFullyPaid = paidCents >= totalPriceCents;
  const isPastUnclosed = isPastUnclosedBooking(booking, nowMs);
  const isUncollected =
    totalPriceCents > 0 &&
    remainingCents > 0 &&
    (booking.status === 'completed' || isPastUnclosed);

  const pendingDeposit = isPendingDepositStatus(booking.status);
  const proofSubmitted = hasBookingProofSubmitted(booking);
  const hasDepositAwaitingReview = pendingDeposit && proofSubmitted;
  const hasDepositMissingProof = pendingDeposit && !proofSubmitted;

  return {
    totalPriceCents,
    paidCents,
    appliedPaidCents,
    remainingCents,
    changeCents,
    depositPaidCents,
    totalTipsCents,
    isFullyPaid,
    isUncollected,
    isPastUnclosed,
    hasDepositAwaitingReview,
    hasDepositMissingProof,
  };
}
