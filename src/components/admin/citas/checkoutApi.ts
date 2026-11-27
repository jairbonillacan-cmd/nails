import type { BookingPaymentSummary } from '@/lib/payments/splits';
import type {
  InventoryItem,
  LoyaltyStamp,
  PaymentSplit,
  PaymentSplitMethod,
} from '@/lib/types';
import type { ClientPackageSummaryRow } from './CheckoutLoyaltySection';
import type { CompletedCheckoutState } from './CheckoutReceiptView';
import type { SplitRowDraft } from './PaymentSplitsEditor';

export function buildNextSplitRow(
  rows: readonly SplitRowDraft[],
  remainingCents: number,
): SplitRowDraft {
  const remainingForNewRow = Number((remainingCents / 100).toFixed(2));
  const usedMethods = new Set(rows.map((r) => r.method));
  const nextMethod: PaymentSplitMethod = !usedMethods.has('cash')
    ? 'cash'
    : !usedMethods.has('transfer')
      ? 'transfer'
      : 'card';
  return {
    id: `split-${Date.now()}-${rows.length + 1}`,
    method: nextMethod,
    amountMxn: remainingForNewRow,
    reference: '',
  };
}

export function computeCheckoutDraftMetrics(params: {
  bookingTotalCents: number;
  priorPaidCents: number;
  priorTipsCents?: number;
  selectedExtraItem: InventoryItem | null;
  extraQuantity: number;
  selectedPackage: ClientPackageSummaryRow | null;
  isSplitMode: boolean;
  singleMethod: 'cash' | 'transfer' | 'card';
  rows: SplitRowDraft[];
  tipMxn: number;
}) {
  const extraQty = params.selectedExtraItem
    ? Math.max(1, Math.min(50, Math.round(params.extraQuantity || 1)))
    : 0;
  const extraTotalCents = params.selectedExtraItem
    ? Math.round(params.selectedExtraItem.retailPriceCents * extraQty)
    : 0;
  const effectiveTotalCents = params.bookingTotalCents + extraTotalCents;
  const heroRemainingCents = params.selectedPackage
    ? Math.max(0, extraTotalCents)
    : Math.max(0, effectiveTotalCents - params.priorPaidCents);
  const heroRemainingMxn = Number((heroRemainingCents / 100).toFixed(2));
  const draftTipCents = Math.max(0, Math.round((params.tipMxn || 0) * 100));

  const effectiveRows: SplitRowDraft[] = params.isSplitMode
    ? params.rows
    : [{ id: 'single-1', method: params.singleMethod, amountMxn: heroRemainingMxn, reference: '' }];

  const draftSplitsForPreview = effectiveRows.map((row, index) => ({
    amountCents: Math.max(0, Math.round((row.amountMxn || 0) * 100)),
    tipCents: index === 0 ? draftTipCents : 0,
  }));
  const draftChargeCents = draftSplitsForPreview.reduce((sum, s) => sum + s.amountCents, 0);
  const combinedPaidCents = Math.max(0, Math.round(params.priorPaidCents)) + draftChargeCents;
  const combinedTipsCents = Math.max(0, Math.round(params.priorTipsCents ?? 0)) + draftTipCents;
  const combinedRemainingCents = Math.max(0, effectiveTotalCents - combinedPaidCents);
  const combinedChangeCents = Math.max(0, combinedPaidCents - effectiveTotalCents);
  const combinedSummary: BookingPaymentSummary = {
    totalPriceCents: effectiveTotalCents,
    paidCents: combinedPaidCents,
    remainingCents: combinedRemainingCents,
    changeCents: combinedChangeCents,
    totalTipsCents: combinedTipsCents,
    isFullyPaid: combinedPaidCents >= effectiveTotalCents,
    isUncollected: effectiveTotalCents > 0 && combinedPaidCents < effectiveTotalCents,
  };

  return {
    extraQty,
    extraTotalCents,
    effectiveTotalCents,
    heroRemainingCents,
    heroRemainingMxn,
    draftTipCents,
    effectiveRows,
    combinedSummary,
    draftChargeCents,
  };
}

export async function fetchActiveClientPackages(
  clientId: string,
  serviceId: string,
  signal: AbortSignal,
): Promise<ClientPackageSummaryRow[]> {
  const res = await fetch(`/api/admin/packages?clientId=${encodeURIComponent(clientId)}`, {
    cache: 'no-store',
    signal,
  });
  if (signal.aborted || !res.ok) return [];
  const json = (await res.json()) as { clientPackages?: ClientPackageSummaryRow[] };
  if (signal.aborted) return [];
  return (json.clientPackages ?? [])
    .filter((pkg) => pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0)
    .toSorted((a, b) => {
      const aMatch = a.serviceId === serviceId ? 0 : 1;
      const bMatch = b.serviceId === serviceId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return b.remainingSessions - a.remainingSessions;
    });
}

export async function submitCheckoutSplitRequest(params: {
  bookingId: string;
  bookingStaffId: string;
  effectiveRows: SplitRowDraft[];
  draftTipCents: number;
  tipStaffId: string;
  extraItem: { inventoryItemId: string; quantity: number } | null;
  redeemLoyaltyReward: boolean;
  selectedPackage: ClientPackageSummaryRow | null;
  fallbackSummary: BookingPaymentSummary;
}): Promise<{ ok: true; state: CompletedCheckoutState } | { ok: false; error: string }> {
  const payloadSplits = params.effectiveRows.map((row, index) => ({
    method: row.method,
    amountCents: Math.max(0, Math.round((row.amountMxn || 0) * 100)),
    tipCents: index === 0 ? params.draftTipCents : 0,
    tipStaffId:
      index === 0 && params.draftTipCents > 0
        ? params.tipStaffId || params.bookingStaffId
        : null,
    ...(row.reference.trim() ? { reference: row.reference.trim() } : {}),
  }));

  let res: Response;
  try {
    res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        action: 'checkout_split',
        bookingId: params.bookingId,
        splits: payloadSplits,
        extraItem: params.extraItem,
        markCompleted: true,
        redeemLoyaltyReward: params.redeemLoyaltyReward,
        ...(params.selectedPackage ? { redeemClientPackageId: params.selectedPackage.id } : {}),
      }),
    });
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      ok: false,
      error: isTimeout
        ? 'El registro del cobro tardó demasiado. Intenta de nuevo en unos segundos.'
        : 'Sin conexión. No se pudo registrar el cobro.',
    };
  }

  const json = (await res.json().catch(() => null)) as {
    error?: string;
    code?: string;
    summary?: BookingPaymentSummary;
    splits?: PaymentSplit[];
    stampAwarded?: LoyaltyStamp | null;
  } | null;

  if (!res.ok) {
    return {
      ok: false,
      error:
        res.status === 403 && json?.code === 'PAST_BOOKING_LOCKED'
          ? json.error || 'Esta cita ya pasó y está bloqueada; solo la Dueña puede cobrarla.'
          : json?.error || 'No se pudo registrar el cobro.',
    };
  }

  return {
    ok: true,
    state: {
      summary: json?.summary ?? params.fallbackSummary,
      splitsCount: json?.splits?.length ?? payloadSplits.length,
      stampAwarded: json?.stampAwarded ?? null,
      redeemedReward: params.redeemLoyaltyReward,
      redeemedPackageName: params.selectedPackage?.packageName ?? null,
    },
  };
}
