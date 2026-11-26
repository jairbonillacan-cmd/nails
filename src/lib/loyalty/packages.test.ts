import { describe, expect, it } from 'vitest';
import {
  canRedeemPackageSession,
  computeClientPackageBalance,
  isPackageExpired,
} from './packages';

describe('Session Packages Domain Ledger (U5)', () => {
  const nowMs = new Date('2026-11-25T18:00:00.000Z').getTime();

  it('computes remaining sessions and active redeemability accurately', () => {
    const balance = computeClientPackageBalance(
      {
        totalSessions: 4,
        usedSessions: 1,
        expiresAt: '2027-03-01T00:00:00.000Z',
        status: 'active',
      },
      nowMs,
    );
    expect(balance.totalSessions).toBe(4);
    expect(balance.usedSessions).toBe(1);
    expect(balance.remainingSessions).toBe(3);
    expect(balance.isExpired).toBe(false);
    expect(balance.canRedeem).toBe(true);
    expect(balance.effectiveStatus).toBe('active');
    expect(
      canRedeemPackageSession(
        {
          totalSessions: 4,
          usedSessions: 1,
          expiresAt: null,
          status: 'active',
        },
        nowMs,
      ),
    ).toBe(true);
  });

  it('marks expired, exhausted, and canceled packages as non-redeemable', () => {
    expect(
      isPackageExpired({ expiresAt: '2026-11-20T00:00:00.000Z' }, nowMs),
    ).toBe(true);
    expect(isPackageExpired({ expiresAt: null }, nowMs)).toBe(false);

    const expired = computeClientPackageBalance(
      {
        totalSessions: 4,
        usedSessions: 1,
        expiresAt: '2026-11-20T00:00:00.000Z',
        status: 'active',
      },
      nowMs,
    );
    expect(expired.isExpired).toBe(true);
    expect(expired.canRedeem).toBe(false);
    expect(expired.effectiveStatus).toBe('expired');

    const exhausted = computeClientPackageBalance(
      {
        totalSessions: 4,
        usedSessions: 4,
        expiresAt: '2027-03-01T00:00:00.000Z',
        status: 'active',
      },
      nowMs,
    );
    expect(exhausted.remainingSessions).toBe(0);
    expect(exhausted.canRedeem).toBe(false);
    expect(exhausted.effectiveStatus).toBe('exhausted');

    const canceled = computeClientPackageBalance(
      {
        totalSessions: 4,
        usedSessions: 0,
        expiresAt: '2027-03-01T00:00:00.000Z',
        status: 'canceled',
      },
      nowMs,
    );
    expect(canceled.canRedeem).toBe(false);
    expect(canceled.effectiveStatus).toBe('canceled');
  });
});
