import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from '../demo-seed';
import { canAwardStamp, computeClientLoyaltySummary } from './stamps';
import type { LoyaltyProgram, LoyaltyStamp } from '../types';

function makeProgram(overrides: Partial<LoyaltyProgram> = {}): LoyaltyProgram {
  return {
    id: 'loy-1',
    isActive: true,
    name: 'Tarjeta de Sellos LAIKONA',
    stampsRequired: 8,
    rewardType: 'percent_discount',
    rewardServiceId: null,
    discountPercent: 50,
    maxDiscountCents: 25000,
    validDays: 90,
    ...overrides,
  };
}

function makeStamp(
  id: string,
  clientId: string,
  stampedDate: string,
  programId = 'loy-1',
): LoyaltyStamp {
  return {
    id,
    clientId,
    bookingId: `bk-${id}`,
    programId,
    stampedDate,
    createdAt: `${stampedDate}T18:00:00.000Z`,
  };
}

describe('Loyalty Stamps Pure Domain (N4)', () => {
  it('enforces max 1 stamp per client per program per calendar day', () => {
    const existing = [
      makeStamp('s-1', 'client-sofia', '2026-11-10'),
      makeStamp('s-2', 'client-paula', '2026-11-10'),
    ];

    expect(
      canAwardStamp(existing, {
        clientId: 'client-sofia',
        programId: 'loy-1',
        stampedDate: '2026-11-10',
      }),
    ).toBe(false);

    expect(
      canAwardStamp(existing, {
        clientId: 'client-sofia',
        programId: 'loy-1',
        stampedDate: '2026-11-11',
      }),
    ).toBe(true);

    expect(
      canAwardStamp(existing, {
        clientId: 'client-sofia',
        programId: 'loy-2',
        stampedDate: '2026-11-10',
      }),
    ).toBe(true);

    expect(
      canAwardStamp(existing, {
        clientId: '',
        programId: 'loy-1',
        stampedDate: '2026-11-11',
      }),
    ).toBe(false);
  });

  it('computes near-reward and ready states accurately including demo seed Sofia 6/8', () => {
    const db = createInitialDemoDatabase();
    const program = db.loyaltyPrograms?.[0];
    const stamps = db.loyaltyStamps ?? [];
    if (!program) throw new Error('Expected seeded loyalty program');

    const sofia = computeClientLoyaltySummary(program, stamps, 'client-sofia');
    expect(sofia.programName).toBe('Tarjeta de Sellos LAIKONA');
    expect(sofia.currentStamps).toBe(6);
    expect(sofia.stampsRequired).toBe(8);
    expect(sofia.remainingForReward).toBe(2);
    expect(sofia.isNearReward).toBe(true);
    expect(sofia.isRewardReady).toBe(false);
    expect(sofia.redemptionsAvailable).toBe(0);
    expect(sofia.rewardLabel).toBe('50% de descuento en tu siguiente cita');

    const freshClient = computeClientLoyaltySummary(program, stamps, 'client-new');
    expect(freshClient.currentStamps).toBe(0);
    expect(freshClient.remainingForReward).toBe(8);
    expect(freshClient.isNearReward).toBe(false);
    expect(freshClient.isRewardReady).toBe(false);

    const freeServiceProgram = makeProgram({
      rewardType: 'free_service',
      rewardServiceId: 'srv-rubber',
      discountPercent: null,
      stampsRequired: 5,
    });
    const fiveStamps = [
      makeStamp('1', 'c-1', '2026-01-01'),
      makeStamp('1-dup', 'c-1', '2026-01-01'),
      makeStamp('2', 'c-1', '2026-01-15'),
      makeStamp('3', 'c-1', '2026-02-01'),
      makeStamp('4', 'c-1', '2026-02-15'),
      makeStamp('5', 'c-1', '2026-03-01'),
    ];
    const readySummary = computeClientLoyaltySummary(
      freeServiceProgram,
      fiveStamps,
      'c-1',
      'Rubber',
    );
    expect(readySummary.totalStamps).toBe(5);
    expect(readySummary.currentStamps).toBe(5);
    expect(readySummary.remainingForReward).toBe(0);
    expect(readySummary.isRewardReady).toBe(true);
    expect(readySummary.isNearReward).toBe(false);
    expect(readySummary.redemptionsAvailable).toBe(1);
    expect(readySummary.rewardLabel).toBe('Rubber gratis');
  });

  it('Property (N4): invariants hold across arbitrary stamp histories and thresholds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.array(fc.integer({ min: 1, max: 28 }), { minLength: 0, maxLength: 30 }),
        fc.integer({ min: 1, max: 28 }),
        (stampsRequired, days, probeDay) => {
          const program = makeProgram({ stampsRequired });
          const stamps = days.map((day, idx) =>
            makeStamp(`st-${idx}`, 'client-x', `2026-06-${String(day).padStart(2, '0')}`),
          );
          const uniqueDaySet = new Set(days);
          const summary = computeClientLoyaltySummary(program, stamps, 'client-x');

          expect(summary.totalStamps).toBe(uniqueDaySet.size);
          expect(summary.currentStamps).toBeGreaterThanOrEqual(0);
          expect(summary.currentStamps).toBeLessThanOrEqual(stampsRequired);
          expect(summary.currentStamps + summary.remainingForReward).toBe(stampsRequired);
          expect(summary.redemptionsAvailable).toBe(Math.floor(uniqueDaySet.size / stampsRequired));
          expect(summary.isRewardReady).toBe(summary.redemptionsAvailable > 0);
          expect(summary.isNearReward).toBe(
            summary.remainingForReward > 0 && summary.remainingForReward <= 2,
          );

          const probeDate = `2026-06-${String(probeDay).padStart(2, '0')}`;
          expect(
            canAwardStamp(stamps, {
              clientId: 'client-x',
              programId: program.id,
              stampedDate: probeDate,
            }),
          ).toBe(!uniqueDaySet.has(probeDay));
        },
      ),
      { numRuns: 150 },
    );
  });
});
