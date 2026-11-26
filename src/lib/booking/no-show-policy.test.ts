import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD,
  evaluateClientNoShowPolicy,
} from './no-show-policy';

describe('Client No-Show Deposit Policy (U2)', () => {
  it('does not flag clients below the configured threshold', () => {
    const res = evaluateClientNoShowPolicy({
      noShowCount: 1,
      threshold: 2,
      baseDepositAmountCents: 20_000,
    });
    expect(res.requiresMandatoryDeposit).toBe(false);
    expect(res.isFlagged).toBe(false);
    expect(res.noShowCount).toBe(1);
    expect(res.threshold).toBe(2);
    expect(res.reason).toBeNull();
  });

  it('requires mandatory deposit when noShowCount meets or exceeds default threshold', () => {
    const atThreshold = evaluateClientNoShowPolicy({
      noShowCount: DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD,
      baseDepositAmountCents: 25_000,
    });
    expect(atThreshold.requiresMandatoryDeposit).toBe(true);
    expect(atThreshold.isFlagged).toBe(true);
    expect(atThreshold.depositAmountCents).toBe(25_000);
    expect(atThreshold.reason).toContain('2 inasistencia');

    const fallbackDeposit = evaluateClientNoShowPolicy({
      noShowCount: 3,
      threshold: 2,
      baseDepositAmountCents: 0,
    });
    expect(fallbackDeposit.requiresMandatoryDeposit).toBe(true);
    expect(fallbackDeposit.depositAmountCents).toBe(20_000);
  });

  it('disables automatic enforcement when threshold is 0', () => {
    const disabled = evaluateClientNoShowPolicy({
      noShowCount: 5,
      threshold: 0,
      baseDepositAmountCents: 20_000,
    });
    expect(disabled.requiresMandatoryDeposit).toBe(false);
    expect(disabled.isFlagged).toBe(false);
    expect(disabled.threshold).toBe(0);
    expect(disabled.reason).toBeNull();
  });
});
