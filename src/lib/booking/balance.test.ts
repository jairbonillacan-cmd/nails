import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BookingStatus, CashRegisterEntry, PaymentSplitMethod } from '../types';
import {
  computeBookingBalance,
  hasBookingProofSubmitted,
  isPastUnclosedBooking,
  type BalanceCashEntryInput,
  type BalanceSplitInput,
  type BookingBalanceInput,
} from './balance';

const BASE_NOW_MS = Date.parse('2026-11-27T21:00:00.000Z');

function makeBooking(overrides: Partial<BookingBalanceInput> = {}): BookingBalanceInput {
  return {
    id: 'bk-1001',
    status: 'confirmed',
    totalPriceCents: 46000,
    depositAmountCents: 20000,
    endAt: '2026-11-27T18:15:00.000Z',
    paymentProofUrl: null,
    proofDeliveryMethod: 'web_upload',
    ...overrides,
  };
}

describe('Booking Balance Pure Domain (Phase 0 · C1/C2)', () => {
  it('computes NL-1042 with verified $200 deposit as $200 paid and $260 remaining without double-counting mirrored cash entries', () => {
    const booking = makeBooking();
    const depositSplit: BalanceSplitInput = {
      bookingId: 'bk-1001',
      method: 'transfer',
      amountCents: 20000,
      tipCents: 0,
      reference: 'Anticipo SPEI aprobado',
    };
    const depositCash: BalanceCashEntryInput = {
      bookingId: 'bk-1001',
      entryType: 'deposit',
      amountCents: 20000,
      tipCents: 0,
    };

    const withBoth = computeBookingBalance(booking, [depositSplit], [depositCash], BASE_NOW_MS);
    const withSplitsOnly = computeBookingBalance(booking, [depositSplit], [], BASE_NOW_MS);
    const withCashOnly = computeBookingBalance(booking, [], [depositCash], BASE_NOW_MS);

    for (const summary of [withBoth, withSplitsOnly, withCashOnly]) {
      expect(summary.totalPriceCents).toBe(46000);
      expect(summary.paidCents).toBe(20000);
      expect(summary.appliedPaidCents).toBe(20000);
      expect(summary.remainingCents).toBe(26000);
      expect(summary.changeCents).toBe(0);
      expect(summary.depositPaidCents).toBe(20000);
      expect(summary.isFullyPaid).toBe(false);
      expect(summary.isPastUnclosed).toBe(true);
      expect(summary.isUncollected).toBe(true);
      expect(summary.hasDepositAwaitingReview).toBe(false);
      expect(summary.hasDepositMissingProof).toBe(false);
    }
  });

  it('ignores splits and cash entries belonging to other bookings and ignores expense entries', () => {
    const booking = makeBooking({ id: 'bk-target', totalPriceCents: 45000 });
    const splits: BalanceSplitInput[] = [
      { bookingId: 'bk-other', method: 'card', amountCents: 45000, tipCents: 5000 },
    ];
    const cashEntries: BalanceCashEntryInput[] = [
      { bookingId: 'bk-target', entryType: 'expense', amountCents: 20000, tipCents: 0 },
      { bookingId: 'bk-other', entryType: 'service_income', amountCents: 45000, tipCents: 0 },
    ];

    const summary = computeBookingBalance(booking, splits, cashEntries, BASE_NOW_MS);
    expect(summary.paidCents).toBe(0);
    expect(summary.remainingCents).toBe(45000);
    expect(summary.totalTipsCents).toBe(0);
    expect(summary.isUncollected).toBe(true);
  });

  it('reconciles cash-only completion entries without payment splits so completed bookings are not flagged uncollected', () => {
    const booking = makeBooking({
      id: 'bk-completed-cash',
      status: 'completed',
      totalPriceCents: 35000,
    });
    const cashEntries: BalanceCashEntryInput[] = [
      { bookingId: 'bk-completed-cash', entryType: 'deposit', amountCents: 20000, tipCents: 0 },
      { bookingId: 'bk-completed-cash', entryType: 'service_income', amountCents: 15000, tipCents: 4000 },
    ];

    const summary = computeBookingBalance(booking, [], cashEntries, BASE_NOW_MS);
    expect(summary.paidCents).toBe(35000);
    expect(summary.appliedPaidCents).toBe(35000);
    expect(summary.remainingCents).toBe(0);
    expect(summary.depositPaidCents).toBe(20000);
    expect(summary.totalTipsCents).toBe(4000);
    expect(summary.isFullyPaid).toBe(true);
    expect(summary.isUncollected).toBe(false);
    expect(summary.isPastUnclosed).toBe(false);
  });

  it('separates awaiting-review vs missing-proof pending deposits accurately', () => {
    const withUpload = makeBooking({
      status: 'pending_confirmation',
      endAt: '2026-11-29T18:00:00.000Z',
      paymentProofUrl: '/api/media/proofs/spei.png',
      proofDeliveryMethod: 'web_upload',
    });
    const withDm = makeBooking({
      status: 'pending_confirmation',
      endAt: '2026-11-29T18:00:00.000Z',
      paymentProofUrl: null,
      proofDeliveryMethod: 'instagram_dm',
    });
    const missingProof = makeBooking({
      status: 'pending_payment',
      endAt: '2026-11-29T18:00:00.000Z',
      paymentProofUrl: null,
      proofDeliveryMethod: 'none',
    });

    expect(hasBookingProofSubmitted(withUpload)).toBe(true);
    expect(hasBookingProofSubmitted(withDm)).toBe(true);
    expect(hasBookingProofSubmitted(missingProof)).toBe(false);

    const uploadSummary = computeBookingBalance(withUpload, [], [], BASE_NOW_MS);
    expect(uploadSummary.hasDepositAwaitingReview).toBe(true);
    expect(uploadSummary.hasDepositMissingProof).toBe(false);
    expect(uploadSummary.isUncollected).toBe(false);

    const missingSummary = computeBookingBalance(missingProof, [], [], BASE_NOW_MS);
    expect(missingSummary.hasDepositAwaitingReview).toBe(false);
    expect(missingSummary.hasDepositMissingProof).toBe(true);
    expect(missingSummary.isUncollected).toBe(false);
  });

  it('identifies past unclosed active bookings while excluding future, completed, canceled, and no_show bookings', () => {
    expect(
      isPastUnclosedBooking(
        { status: 'confirmed', endAt: '2026-11-27T18:15:00.000Z' },
        BASE_NOW_MS,
      ),
    ).toBe(true);
    expect(
      isPastUnclosedBooking(
        { status: 'confirmed', endAt: '2026-11-28T18:15:00.000Z' },
        BASE_NOW_MS,
      ),
    ).toBe(false);
    expect(
      isPastUnclosedBooking(
        { status: 'completed', endAt: '2026-11-27T18:15:00.000Z' },
        BASE_NOW_MS,
      ),
    ).toBe(false);
    expect(
      isPastUnclosedBooking(
        { status: 'canceled', endAt: '2026-11-27T18:15:00.000Z' },
        BASE_NOW_MS,
      ),
    ).toBe(false);
    expect(
      isPastUnclosedBooking(
        { status: 'no_show', endAt: '2026-11-27T18:15:00.000Z' },
        BASE_NOW_MS,
      ),
    ).toBe(false);
  });

  it('Property (C1): appliedPaidCents + remainingCents === totalPriceCents, remainingCents >= 0, and mirrored ledgers are idempotent', () => {
    const statusArb = fc.constantFrom<BookingStatus>(
      'pending_payment',
      'pending_confirmation',
      'confirmed',
      'completed',
      'canceled',
      'no_show',
    );
    const methodArb = fc.constantFrom<PaymentSplitMethod>(
      'cash',
      'card',
      'transfer',
      'giftcard',
      'online',
    );
    const entryTypeArb = fc.constantFrom<CashRegisterEntry['entryType']>(
      'service_income',
      'deposit',
      'product_sale',
      'gift_card_sale',
      'expense',
    );

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        statusArb,
        fc.boolean(),
        fc.array(
          fc.record({
            method: methodArb,
            amountCents: fc.integer({ min: 0, max: 200_000 }),
            tipCents: fc.integer({ min: 0, max: 50_000 }),
            isDeposit: fc.boolean(),
          }),
          { minLength: 0, maxLength: 6 },
        ),
        fc.array(
          fc.record({
            entryType: entryTypeArb,
            amountCents: fc.integer({ min: -50_000, max: 200_000 }),
            tipCents: fc.integer({ min: 0, max: 50_000 }),
          }),
          { minLength: 0, maxLength: 6 },
        ),
        (totalPriceCents, depositAmountCents, status, isPast, rawSplits, rawCash) => {
          const booking = makeBooking({
            status,
            totalPriceCents,
            depositAmountCents,
            endAt: isPast ? '2026-11-27T18:00:00.000Z' : '2026-11-29T18:00:00.000Z',
          });

          const splits: BalanceSplitInput[] = rawSplits.map((s) => ({
            bookingId: booking.id,
            method: s.method,
            amountCents: s.amountCents,
            tipCents: s.tipCents,
            reference: s.isDeposit ? 'Anticipo SPEI aprobado' : 'Cobro salón',
          }));

          const cashEntries: BalanceCashEntryInput[] = rawCash.map((e) => ({
            bookingId: booking.id,
            entryType: e.entryType,
            amountCents: e.amountCents,
            tipCents: e.tipCents,
          }));

          const summary = computeBookingBalance(booking, splits, cashEntries, BASE_NOW_MS);

          expect(summary.remainingCents).toBeGreaterThanOrEqual(0);
          expect(summary.appliedPaidCents).toBeGreaterThanOrEqual(0);
          expect(summary.appliedPaidCents).toBeLessThanOrEqual(summary.totalPriceCents);
          expect(summary.appliedPaidCents + summary.remainingCents).toBe(summary.totalPriceCents);
          expect(summary.paidCents + summary.remainingCents - summary.changeCents).toBe(
            summary.totalPriceCents,
          );
          expect(summary.depositPaidCents).toBeLessThanOrEqual(summary.paidCents);
          expect(summary.hasDepositAwaitingReview && summary.hasDepositMissingProof).toBe(false);

          const mirroredCash: BalanceCashEntryInput[] = splits.map((s) => ({
            bookingId: s.bookingId,
            entryType:
              s.method === 'online' || (s.reference ?? '').toLowerCase().includes('anticipo')
                ? 'deposit'
                : 'service_income',
            amountCents: s.amountCents,
            tipCents: s.tipCents,
          }));

          const splitsOnly = computeBookingBalance(booking, splits, [], BASE_NOW_MS);
          const cashOnly = computeBookingBalance(booking, [], mirroredCash, BASE_NOW_MS);
          const bothMirrored = computeBookingBalance(booking, splits, mirroredCash, BASE_NOW_MS);

          expect(bothMirrored).toEqual(splitsOnly);
          expect(bothMirrored).toEqual(cashOnly);
        },
      ),
      { numRuns: 150 },
    );
  });
});
