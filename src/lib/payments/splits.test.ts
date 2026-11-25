import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeBookingPaymentSummary,
  validatePaymentSplits,
  type PaymentSplitInput,
} from './splits';
import type { PaymentSplitMethod } from '../types';

describe('Payment Splits Pure Domain (N3)', () => {
  it('computes partial, exact split, overpayment change, and uncollected states accurately', () => {
    const unpaid = computeBookingPaymentSummary(45000, []);
    expect(unpaid.paidCents).toBe(0);
    expect(unpaid.remainingCents).toBe(45000);
    expect(unpaid.changeCents).toBe(0);
    expect(unpaid.isFullyPaid).toBe(false);
    expect(unpaid.isUncollected).toBe(true);

    const partial = computeBookingPaymentSummary(45000, [{ amountCents: 20000, tipCents: 0 }]);
    expect(partial.paidCents).toBe(20000);
    expect(partial.remainingCents).toBe(25000);
    expect(partial.isFullyPaid).toBe(false);
    expect(partial.isUncollected).toBe(true);

    const exactSplit = computeBookingPaymentSummary(50000, [
      { amountCents: 30000, tipCents: 5000 },
      { amountCents: 20000, tipCents: 2000 },
    ]);
    expect(exactSplit.paidCents).toBe(50000);
    expect(exactSplit.remainingCents).toBe(0);
    expect(exactSplit.changeCents).toBe(0);
    expect(exactSplit.totalTipsCents).toBe(7000);
    expect(exactSplit.isFullyPaid).toBe(true);
    expect(exactSplit.isUncollected).toBe(false);

    const withChange = computeBookingPaymentSummary(35000, [{ amountCents: 40000, tipCents: 0 }]);
    expect(withChange.isFullyPaid).toBe(true);
    expect(withChange.isUncollected).toBe(false);
    expect(withChange.remainingCents).toBe(0);
    expect(withChange.changeCents).toBe(5000);

    const freeService = computeBookingPaymentSummary(0, []);
    expect(freeService.isFullyPaid).toBe(true);
    expect(freeService.isUncollected).toBe(false);
  });

  it('validates split payloads and rejects malformed or negative entries', () => {
    const valid = validatePaymentSplits(
      [
        { method: 'cash', amountCents: 20000, tipCents: 3000, tipStaffId: 'staff-karla' },
        { method: 'card', amountCents: 15000, tipCents: 0, reference: 'TERM-01' },
      ],
      35000,
    );
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.summary.isFullyPaid).toBe(true);
      expect(valid.summary.totalTipsCents).toBe(3000);
    }

    const empty = validatePaymentSplits([], 35000);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('EMPTY_SPLITS');

    const negAmt = validatePaymentSplits([{ method: 'cash', amountCents: -100 }], 35000);
    expect(negAmt.ok).toBe(false);
    if (!negAmt.ok) expect(negAmt.code).toBe('NEGATIVE_AMOUNT');

    const negTip = validatePaymentSplits(
      [{ method: 'card', amountCents: 35000, tipCents: -50 }],
      35000,
    );
    expect(negTip.ok).toBe(false);
    if (!negTip.ok) expect(negTip.code).toBe('NEGATIVE_TIP');

    const zero = validatePaymentSplits([{ method: 'transfer', amountCents: 0, tipCents: 0 }], 35000);
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.code).toBe('ZERO_TOTAL');

    const badTotal = validatePaymentSplits([{ method: 'cash', amountCents: 1000 }], -1);
    expect(badTotal.ok).toBe(false);
    if (!badTotal.ok) expect(badTotal.code).toBe('INVALID_BOOKING_TOTAL');
  });

  it('Property (N3): split sums, remaining, change, and leak flags stay algebraically exact', () => {
    const methodArb = fc.constantFrom<PaymentSplitMethod>(
      'cash',
      'card',
      'transfer',
      'giftcard',
      'online',
    );
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500_000 }),
        fc.array(
          fc.record({
            method: methodArb,
            amountCents: fc.integer({ min: 1, max: 200_000 }),
            tipCents: fc.integer({ min: 0, max: 50_000 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (totalPriceCents, splits: PaymentSplitInput[]) => {
          const result = validatePaymentSplits(splits, totalPriceCents);
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const expectedPaid = splits.reduce((sum, s) => sum + s.amountCents, 0);
          const expectedTips = splits.reduce((sum, s) => sum + (s.tipCents ?? 0), 0);

          expect(result.summary.paidCents).toBe(expectedPaid);
          expect(result.summary.totalTipsCents).toBe(expectedTips);
          expect(result.summary.paidCents + result.summary.remainingCents - result.summary.changeCents).toBe(
            totalPriceCents,
          );
          expect(result.summary.isFullyPaid).toBe(expectedPaid >= totalPriceCents);
          expect(result.summary.isUncollected).toBe(
            totalPriceCents > 0 && expectedPaid < totalPriceCents,
          );
        },
      ),
      { numRuns: 150 },
    );
  });
});
