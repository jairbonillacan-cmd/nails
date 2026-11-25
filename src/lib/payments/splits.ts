import type { PaymentSplit, PaymentSplitMethod } from '../types';

export interface BookingPaymentSummary {
  totalPriceCents: number;
  paidCents: number;
  remainingCents: number;
  changeCents: number;
  totalTipsCents: number;
  isFullyPaid: boolean;
  isUncollected: boolean;
}

export interface PaymentSplitInput {
  method: PaymentSplitMethod;
  amountCents: number;
  tipCents?: number;
  tipStaffId?: string | null;
  reference?: string;
}

type PaymentSplitsErrorCode =
  | 'EMPTY_SPLITS'
  | 'INVALID_METHOD'
  | 'NEGATIVE_AMOUNT'
  | 'NEGATIVE_TIP'
  | 'ZERO_TOTAL'
  | 'INVALID_BOOKING_TOTAL';

export type PaymentSplitsValidationResult =
  | {
      ok: true;
      summary: BookingPaymentSummary;
    }
  | {
      ok: false;
      code: PaymentSplitsErrorCode;
      message: string;
    };

const VALID_SPLIT_METHODS = new Set<string>([
  'cash',
  'card',
  'transfer',
  'giftcard',
  'online',
]);

export function computeBookingPaymentSummary(
  totalPriceCents: number,
  splits: readonly Pick<PaymentSplit, 'amountCents' | 'tipCents'>[],
): BookingPaymentSummary {
  const safeTotal = Number.isFinite(totalPriceCents)
    ? Math.max(0, Math.round(totalPriceCents))
    : 0;

  let paidCents = 0;
  let totalTipsCents = 0;

  for (const split of splits) {
    if (Number.isFinite(split.amountCents) && split.amountCents > 0) {
      paidCents += Math.round(split.amountCents);
    }
    if (Number.isFinite(split.tipCents) && split.tipCents > 0) {
      totalTipsCents += Math.round(split.tipCents);
    }
  }

  const remainingCents = Math.max(0, safeTotal - paidCents);
  const changeCents = Math.max(0, paidCents - safeTotal);
  const isFullyPaid = paidCents >= safeTotal;
  const isUncollected = safeTotal > 0 && paidCents < safeTotal;

  return {
    totalPriceCents: safeTotal,
    paidCents,
    remainingCents,
    changeCents,
    totalTipsCents,
    isFullyPaid,
    isUncollected,
  };
}

export function validatePaymentSplits(
  splits: readonly PaymentSplitInput[],
  totalPriceCents: number,
): PaymentSplitsValidationResult {
  if (!Number.isFinite(totalPriceCents) || !Number.isInteger(totalPriceCents) || totalPriceCents < 0) {
    return {
      ok: false,
      code: 'INVALID_BOOKING_TOTAL',
      message: 'El total de la cita debe ser un entero mayor o igual a cero.',
    };
  }

  if (splits.length === 0) {
    return {
      ok: false,
      code: 'EMPTY_SPLITS',
      message: 'Agrega al menos una forma de pago para registrar el cobro.',
    };
  }

  const normalized: Array<{ amountCents: number; tipCents: number }> = [];
  let sumAmount = 0;
  let sumTip = 0;

  for (const split of splits) {
    if (!VALID_SPLIT_METHODS.has(split.method)) {
      return {
        ok: false,
        code: 'INVALID_METHOD',
        message: 'Método de pago no válido.',
      };
    }

    if (!Number.isFinite(split.amountCents) || !Number.isInteger(split.amountCents) || split.amountCents < 0) {
      return {
        ok: false,
        code: 'NEGATIVE_AMOUNT',
        message: 'Los montos de cobro no pueden ser negativos ni decimales.',
      };
    }

    const tipCents = split.tipCents ?? 0;
    if (!Number.isFinite(tipCents) || !Number.isInteger(tipCents) || tipCents < 0) {
      return {
        ok: false,
        code: 'NEGATIVE_TIP',
        message: 'Las propinas no pueden ser negativas ni decimales.',
      };
    }

    sumAmount += split.amountCents;
    sumTip += tipCents;
    normalized.push({ amountCents: split.amountCents, tipCents });
  }

  if (sumAmount === 0 && sumTip === 0 && totalPriceCents > 0) {
    return {
      ok: false,
      code: 'ZERO_TOTAL',
      message: 'El cobro debe ser mayor a $0 MXN.',
    };
  }

  return {
    ok: true,
    summary: computeBookingPaymentSummary(totalPriceCents, normalized),
  };
}
