import {
  computeBookingBalance,
  hasBookingProofSubmitted,
  isPastUnclosedBooking,
  isPendingDepositStatus,
  type BalanceCashEntryInput,
  type BalanceSplitInput,
} from '../booking/balance';
import { getDateKeyInTimezone } from '../format';
import type { BookingStatus, BookingWithRelations } from '../types';

type UncollectedBookingSelectorItem = {
  bookingId: string;
  bookingCode: string;
  status: BookingStatus;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientInstagram: string | null;
  serviceName: string;
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  totalPriceCents: number;
  paidCents: number;
  remainingCents: number;
  depositPaidCents: number;
  isPastUnclosed: boolean;
};

type PendingDepositSelectorItem = {
  bookingId: string;
  bookingCode: string;
  status: BookingStatus;
  clientId: string;
  clientName: string;
  clientPhone: string;
  clientInstagram: string | null;
  serviceName: string;
  staffId: string;
  staffName: string;
  startAt: string;
  depositAmountCents: number;
  totalPriceCents: number;
  proofDeliveryMethod: 'web_upload' | 'web_link' | 'instagram_dm' | 'none';
  paymentProofUrl: string | null;
  proofSubmitted: boolean;
  awaitingReview: boolean;
  missingProof: boolean;
};

type PendingDepositBreakdownInput = {
  depositAmountCents: number;
  proofDeliveryMethod?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none' | null;
  paymentProofUrl?: string | null;
  awaitingReview?: boolean;
};

interface PendingDepositsBreakdown<T extends PendingDepositBreakdownInput = PendingDepositBreakdownInput> {
  totalCount: number;
  totalCents: number;
  awaitingReviewCount: number;
  awaitingReviewCents: number;
  missingProofCount: number;
  missingProofCents: number;
  awaitingReview: T[];
  missingProof: T[];
  summaryLabel: string;
}

interface ReceivablesSummary {
  uncollectedCount: number;
  uncollectedTotalCents: number;
  pastUnclosedCount: number;
  completedUnpaidCount: number;
  pendingDepositsCount: number;
  pendingDepositsTotalCents: number;
  awaitingReviewCount: number;
  awaitingReviewCents: number;
  missingProofCount: number;
  missingProofCents: number;
  depositsBreakdownLabel: string;
}

interface TodayAgendaSelection<T extends Pick<BookingWithRelations, 'startAt' | 'endAt' | 'status'> = BookingWithRelations> {
  todayBookings: T[];
  tomorrowBookings: T[];
  upcomingTodayCount: number;
  pastUnclosedTodayCount: number;
  todayCount: number;
}

export function formatPendingDepositsBreakdown(
  awaitingReviewCount: number,
  missingProofCount: number,
): string {
  if (awaitingReviewCount > 0 && missingProofCount > 0) {
    return `${awaitingReviewCount} por revisar · ${missingProofCount} sin comprobante`;
  }
  if (awaitingReviewCount > 0) {
    return `${awaitingReviewCount} ${awaitingReviewCount === 1 ? 'comprobante' : 'comprobantes'} por revisar`;
  }
  if (missingProofCount > 0) {
    return `${missingProofCount} sin comprobante`;
  }
  return 'Todo revisado';
}

export function selectPendingDeposits(
  bookings: readonly BookingWithRelations[],
): PendingDepositSelectorItem[] {
  const pending: PendingDepositSelectorItem[] = [];
  for (const booking of bookings) {
    if (!isPendingDepositStatus(booking.status)) continue;
    const proofSubmitted = hasBookingProofSubmitted(booking);
    pending.push({
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      status: booking.status,
      clientId: booking.clientId,
      clientName: booking.client.fullName,
      clientPhone: booking.client.phoneE164,
      clientInstagram: booking.clientInstagram ?? booking.client.instagramHandle ?? null,
      serviceName: booking.service.name,
      staffId: booking.staffId,
      staffName: booking.staff.name,
      startAt: booking.startAt,
      depositAmountCents: booking.depositAmountCents,
      totalPriceCents: booking.totalPriceCents,
      proofDeliveryMethod:
        booking.proofDeliveryMethod ?? (booking.paymentProofUrl ? 'web_upload' : 'none'),
      paymentProofUrl: booking.paymentProofUrl,
      proofSubmitted,
      awaitingReview: proofSubmitted,
      missingProof: !proofSubmitted,
    });
  }
  return pending;
}

export function selectPendingDepositsBreakdown<T extends PendingDepositBreakdownInput>(
  pendingDeposits: readonly T[],
): PendingDepositsBreakdown<T> {
  let totalCents = 0;
  let awaitingReviewCents = 0;
  let missingProofCents = 0;
  const awaitingReview: T[] = [];
  const missingProof: T[] = [];

  for (const item of pendingDeposits) {
    const amountCents = Math.max(0, Math.round(item.depositAmountCents || 0));
    totalCents += amountCents;
    const hasProof =
      typeof item.awaitingReview === 'boolean'
        ? item.awaitingReview
        : hasBookingProofSubmitted(item);
    if (hasProof) {
      awaitingReview.push(item);
      awaitingReviewCents += amountCents;
    } else {
      missingProof.push(item);
      missingProofCents += amountCents;
    }
  }

  return {
    totalCount: pendingDeposits.length,
    totalCents,
    awaitingReviewCount: awaitingReview.length,
    awaitingReviewCents,
    missingProofCount: missingProof.length,
    missingProofCents,
    awaitingReview,
    missingProof,
    summaryLabel: formatPendingDepositsBreakdown(awaitingReview.length, missingProof.length),
  };
}

export function selectUncollectedBookings(params: {
  bookings: readonly BookingWithRelations[];
  paymentSplits: readonly BalanceSplitInput[];
  cashEntries: readonly BalanceCashEntryInput[];
  nowMs: number;
}): UncollectedBookingSelectorItem[] {
  const splitsByBookingId = new Map<string, BalanceSplitInput[]>();
  for (const split of params.paymentSplits) {
    const list = splitsByBookingId.get(split.bookingId) ?? [];
    list.push(split);
    splitsByBookingId.set(split.bookingId, list);
  }

  const cashByBookingId = new Map<string, BalanceCashEntryInput[]>();
  for (const entry of params.cashEntries) {
    if (!entry.bookingId) continue;
    const list = cashByBookingId.get(entry.bookingId) ?? [];
    list.push(entry);
    cashByBookingId.set(entry.bookingId, list);
  }

  const rows: Array<{ startMs: number; item: UncollectedBookingSelectorItem }> = [];
  for (const booking of params.bookings) {
    const balance = computeBookingBalance(
      booking,
      splitsByBookingId.get(booking.id) ?? [],
      cashByBookingId.get(booking.id) ?? [],
      params.nowMs,
    );
    if (!balance.isUncollected) continue;
    rows.push({
      startMs: Date.parse(booking.startAt) || 0,
      item: {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: booking.status,
        clientId: booking.clientId,
        clientName: booking.client.fullName,
        clientPhone: booking.client.phoneE164,
        clientInstagram: booking.clientInstagram ?? booking.client.instagramHandle ?? null,
        serviceName: booking.service.name,
        staffId: booking.staffId,
        staffName: booking.staff.name,
        startAt: booking.startAt,
        endAt: booking.endAt,
        totalPriceCents: balance.totalPriceCents,
        paidCents: balance.appliedPaidCents,
        remainingCents: balance.remainingCents,
        depositPaidCents: balance.depositPaidCents,
        isPastUnclosed: balance.isPastUnclosed,
      },
    });
  }

  return rows.toSorted((a, b) => b.startMs - a.startMs).map(({ item }) => item);
}

export function selectReceivablesSummary(params: {
  uncollectedBookings: ReadonlyArray<{
    remainingCents: number;
    status?: BookingStatus;
    isPastUnclosed?: boolean;
  }>;
  pendingDeposits: readonly PendingDepositBreakdownInput[];
}): ReceivablesSummary {
  let uncollectedTotalCents = 0;
  let pastUnclosedCount = 0;
  let completedUnpaidCount = 0;

  for (const row of params.uncollectedBookings) {
    uncollectedTotalCents += Math.max(0, Math.round(row.remainingCents || 0));
    if (row.isPastUnclosed || (row.status && row.status !== 'completed')) {
      pastUnclosedCount += 1;
    } else {
      completedUnpaidCount += 1;
    }
  }

  const deposits = selectPendingDepositsBreakdown(params.pendingDeposits);

  return {
    uncollectedCount: params.uncollectedBookings.length,
    uncollectedTotalCents,
    pastUnclosedCount,
    completedUnpaidCount,
    pendingDepositsCount: deposits.totalCount,
    pendingDepositsTotalCents: deposits.totalCents,
    awaitingReviewCount: deposits.awaitingReviewCount,
    awaitingReviewCents: deposits.awaitingReviewCents,
    missingProofCount: deposits.missingProofCount,
    missingProofCents: deposits.missingProofCents,
    depositsBreakdownLabel: deposits.summaryLabel,
  };
}

export function selectTodayAgenda<
  T extends Pick<BookingWithRelations, 'startAt' | 'endAt' | 'status'>,
>(params: {
  bookings: readonly T[];
  todayKey: string;
  tomorrowKey?: string;
  timezone: string;
  nowMs: number;
}): TodayAgendaSelection<T> {
  const nonCanceled = params.bookings
    .filter((booking) => booking.status !== 'canceled')
    .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  const todayBookings: T[] = [];
  const tomorrowBookings: T[] = [];
  let upcomingTodayCount = 0;
  let pastUnclosedTodayCount = 0;

  for (const booking of nonCanceled) {
    const key = getDateKeyInTimezone(new Date(booking.startAt), params.timezone);
    if (key === params.todayKey) {
      todayBookings.push(booking);
      if (isPastUnclosedBooking(booking, params.nowMs)) {
        pastUnclosedTodayCount += 1;
      } else if (
        booking.status !== 'completed' &&
        booking.status !== 'no_show' &&
        Date.parse(booking.endAt) >= params.nowMs
      ) {
        upcomingTodayCount += 1;
      }
    } else if (params.tomorrowKey && key === params.tomorrowKey) {
      tomorrowBookings.push(booking);
    }
  }

  return {
    todayBookings,
    tomorrowBookings,
    upcomingTodayCount,
    pastUnclosedTodayCount,
    todayCount: todayBookings.length,
  };
}
