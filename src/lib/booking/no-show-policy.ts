export const DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD = 2;
const FALLBACK_MANDATORY_DEPOSIT_CENTS = 20_000;

export interface NoShowPolicyEvaluation {
  requiresMandatoryDeposit: boolean;
  isFlagged: boolean;
  noShowCount: number;
  threshold: number;
  depositAmountCents: number;
  reason: string | null;
}

export function evaluateClientNoShowPolicy(params: {
  noShowCount: number;
  threshold?: number | null;
  baseDepositAmountCents: number;
}): NoShowPolicyEvaluation {
  const safeNoShows = Number.isFinite(params.noShowCount)
    ? Math.max(0, Math.floor(params.noShowCount))
    : 0;
  const resolvedThreshold =
    params.threshold === null || params.threshold === undefined
      ? DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD
      : Number.isFinite(params.threshold)
        ? Math.max(0, Math.floor(params.threshold))
        : DEFAULT_NO_SHOW_DEPOSIT_THRESHOLD;

  const safeBaseDeposit = Number.isFinite(params.baseDepositAmountCents)
    ? Math.max(0, Math.round(params.baseDepositAmountCents))
    : 0;

  if (resolvedThreshold <= 0) {
    return {
      requiresMandatoryDeposit: false,
      isFlagged: false,
      noShowCount: safeNoShows,
      threshold: 0,
      depositAmountCents: safeBaseDeposit,
      reason: null,
    };
  }

  const triggered = safeNoShows >= resolvedThreshold;
  const depositAmountCents = triggered
    ? safeBaseDeposit > 0
      ? safeBaseDeposit
      : FALLBACK_MANDATORY_DEPOSIT_CENTS
    : safeBaseDeposit;

  return {
    requiresMandatoryDeposit: triggered,
    isFlagged: triggered,
    noShowCount: safeNoShows,
    threshold: resolvedThreshold,
    depositAmountCents,
    reason: triggered
      ? `Esta cuenta registra ${safeNoShows} inasistencia(s) previas (umbral: ${resolvedThreshold}), por lo que requiere anticipo obligatorio para confirmar la cita.`
      : null,
  };
}
