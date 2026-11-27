import { shiftDateKey } from '@/components/admin/citas/scheduleGridGeometry';
import type { FilterPillOption } from '@/components/ui/FilterPillBar';
import type { StatusTagTone } from '@/components/ui/StatusTag';
import {
  formatCurrency,
  formatDateKeyDisplay,
  getDateKeyInTimezone,
} from '@/lib/format';
import type {
  AdminRole,
  CashRegisterEntry,
  Coupon,
  PaymentMethod,
  PaymentSplit,
  StaffMember,
} from '@/lib/types';
import {
  paymentMethodLabel,
  type CommissionStaffRow,
  type SplitDetailRow,
} from './cajaTypes';

export type CajaPeriod = 'today' | '7d' | 'month' | 'all';
export type CajaMethodFilter = 'all' | 'cash' | 'card' | 'transfer';
export type MovementTypeFilter = 'all' | 'income' | 'deposits' | 'expenses';

export const CAJA_PERIOD_OPTIONS: readonly FilterPillOption<CajaPeriod>[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'all', label: 'Todo' },
];

export const CAJA_METHOD_FILTER_OPTIONS: readonly FilterPillOption<CajaMethodFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

export const NAIL_SALON_EXPENSE_PRESETS: readonly string[] = [
  'Geles / acrílico',
  'Limas y desechables',
  'Esterilización',
  'Renta / servicios',
  'Pago a profesional',
];

export function cajaPeriodLabel(period: CajaPeriod): string {
  if (period === 'today') return 'Hoy';
  if (period === '7d') return 'Últimos 7 días';
  if (period === 'month') return 'Este mes';
  return 'Histórico';
}

export function getCajaPeriodStartKey(
  todayKey: string,
  period: CajaPeriod,
): string | null {
  if (period === 'today') return todayKey;
  if (period === '7d') return shiftDateKey(todayKey, -6);
  if (period === 'month') {
    const match = /^(\d{4}-\d{2})-\d{2}$/.exec(todayKey.trim());
    if (match) return `${match[1]}-01`;
    return todayKey;
  }
  return null;
}

export function isIsoInCajaPeriod(
  iso: string,
  todayKey: string,
  tz: string,
  period: CajaPeriod,
): boolean {
  if (period === 'all') return true;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  const entryKey = getDateKeyInTimezone(parsed, tz);
  if (period === 'today') return entryKey === todayKey;
  const startKey = getCajaPeriodStartKey(todayKey, period);
  if (!startKey) return true;
  return entryKey >= startKey && entryKey <= todayKey;
}

function normalizeSearchToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export interface CajaBookingSearchMeta {
  bookingCode: string;
  clientName: string;
  staffName: string;
}

export function isCashEntryEditable(entry: CashRegisterEntry): boolean {
  return entry.bookingId === null;
}

export function filterCashEntries(
  entries: readonly CashRegisterEntry[],
  options: {
    period: CajaPeriod;
    method: CajaMethodFilter;
    entryType?: MovementTypeFilter;
    query: string;
    todayKey: string;
    tz: string;
    bookingLookup?: ReadonlyMap<string, CajaBookingSearchMeta>;
  },
): CashRegisterEntry[] {
  const {
    period,
    method,
    entryType = 'all',
    query,
    todayKey,
    tz,
    bookingLookup,
  } = options;
  const cleanQuery = normalizeSearchToken(query);

  return entries
    .filter((entry) => {
      if (!isIsoInCajaPeriod(entry.occurredAt, todayKey, tz, period)) {
        return false;
      }
      if (method !== 'all' && entry.paymentMethod !== method) {
        return false;
      }
      if (entryType === 'deposits' && entry.entryType !== 'deposit') {
        return false;
      }
      if (entryType === 'expenses' && entry.entryType !== 'expense') {
        return false;
      }
      if (
        entryType === 'income' &&
        (entry.entryType === 'expense' || entry.entryType === 'deposit')
      ) {
        return false;
      }
      if (!cleanQuery) return true;
      const linked = entry.bookingId ? bookingLookup?.get(entry.bookingId) : undefined;
      const haystack = normalizeSearchToken(
        [
          entry.description,
          entry.recordedBy,
          paymentMethodLabel(entry.paymentMethod),
          linked?.bookingCode ?? '',
          linked?.clientName ?? '',
          linked?.staffName ?? '',
        ].join(' '),
      );
      return haystack.includes(cleanQuery);
    })
    .toSorted(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
}

export function filterSplitDetails(
  splits: readonly SplitDetailRow[],
  options: {
    period: CajaPeriod;
    method: CajaMethodFilter;
    query: string;
    todayKey: string;
    tz: string;
  },
): SplitDetailRow[] {
  const { period, method, query, todayKey, tz } = options;
  const cleanQuery = normalizeSearchToken(query);

  return splits.filter((row) => {
    if (!isIsoInCajaPeriod(row.createdAt, todayKey, tz, period)) {
      return false;
    }
    if (method !== 'all' && row.method !== method) {
      return false;
    }
    if (!cleanQuery) return true;
    const haystack = normalizeSearchToken(
      [
        row.clientName,
        row.bookingCode,
        row.reference ?? '',
        row.tipStaffName ?? '',
      ].join(' '),
    );
    return haystack.includes(cleanQuery);
  });
}

export interface CajaPeriodSummary {
  collectedCents: number;
  expensesCents: number;
  netCents: number;
  tipsCents: number;
  ticketCount: number;
  averageTicketCents: number;
  cashCents: number;
  cashCount: number;
  cardCents: number;
  cardCount: number;
  transferCents: number;
  transferCount: number;
  giftCardCents: number;
  giftCardCount: number;
}

export function computeCajaPeriodSummary(
  entries: readonly CashRegisterEntry[],
): CajaPeriodSummary {
  let collectedCents = 0;
  let expensesCents = 0;
  let tipsCents = 0;
  let ticketCount = 0;
  let cashCents = 0;
  let cashCount = 0;
  let cardCents = 0;
  let cardCount = 0;
  let transferCents = 0;
  let transferCount = 0;
  let giftCardCents = 0;
  let giftCardCount = 0;

  for (const entry of entries) {
    tipsCents += Math.max(0, entry.tipCents);
    if (entry.entryType === 'expense') {
      expensesCents += Math.abs(entry.amountCents);
      continue;
    }
    const positiveAmount = Math.max(0, entry.amountCents);
    collectedCents += positiveAmount;
    ticketCount += 1;
    if (entry.paymentMethod === 'cash') {
      cashCents += positiveAmount;
      cashCount += 1;
    } else if (entry.paymentMethod === 'card') {
      cardCents += positiveAmount;
      cardCount += 1;
    } else if (entry.paymentMethod === 'transfer') {
      transferCents += positiveAmount;
      transferCount += 1;
    } else {
      giftCardCents += positiveAmount;
      giftCardCount += 1;
    }
  }

  return {
    collectedCents,
    expensesCents,
    netCents: collectedCents - expensesCents,
    tipsCents,
    ticketCount,
    averageTicketCents: ticketCount > 0 ? Math.round(collectedCents / ticketCount) : 0,
    cashCents,
    cashCount,
    cardCents,
    cardCount,
    transferCents,
    transferCount,
    giftCardCents,
    giftCardCount,
  };
}

export function computeEntryCommissionCents(
  entry: CashRegisterEntry,
  commissionPercent: number,
): number {
  if (entry.entryType === 'expense') return 0;
  if (entry.entryType === 'service_income') {
    const safePct = Math.max(0, Math.min(100, commissionPercent));
    return Math.round((Math.max(0, entry.amountCents) * safePct) / 100);
  }
  return Math.max(0, entry.commissionCents);
}

export function computeCommissionsByStaff(params: {
  staff: readonly StaffMember[];
  cashEntries: readonly CashRegisterEntry[];
  paymentSplits: readonly PaymentSplit[];
  todayKey: string;
  tz: string;
  period: CajaPeriod;
  viewerRole: AdminRole;
  viewerStaffId: string | null;
}): CommissionStaffRow[] {
  const {
    staff,
    cashEntries,
    paymentSplits,
    todayKey,
    tz,
    period,
    viewerRole,
    viewerStaffId,
  } = params;

  const visibleStaff =
    viewerRole === 'specialist'
      ? viewerStaffId
        ? staff.filter((st) => st.id === viewerStaffId)
        : []
      : staff;

  const scopedCashEntries = cashEntries.filter((entry) =>
    isIsoInCajaPeriod(entry.occurredAt, todayKey, tz, period),
  );
  const scopedSplits = paymentSplits.filter((split) =>
    isIsoInCajaPeriod(split.createdAt, todayKey, tz, period),
  );

  return visibleStaff
    .map((st) => {
      const entries = scopedCashEntries.filter(
        (entry) => entry.staffId === st.id && entry.entryType !== 'expense',
      );
      const sales = entries.reduce((sum, entry) => sum + Math.max(0, entry.amountCents), 0);
      const commission = entries.reduce(
        (sum, entry) => sum + computeEntryCommissionCents(entry, st.commissionPercent),
        0,
      );
      const tips = entries.reduce((sum, entry) => sum + Math.max(0, entry.tipCents), 0);
      const splitTipsEntries = scopedSplits.filter(
        (split) => split.tipStaffId === st.id && split.tipCents > 0,
      );
      const splitTipsCents = splitTipsEntries.reduce(
        (sum, item) => sum + item.tipCents,
        0,
      );
      return {
        id: st.id,
        name: st.name,
        percent: st.commissionPercent,
        servicesCount: entries.filter((entry) => entry.amountCents > 0).length,
        sales,
        commission,
        tips,
        splitTipsCents,
        splitTipsCount: splitTipsEntries.length,
        totalPayout: commission + tips,
      };
    })
    .toSorted(
      (a, b) =>
        b.totalPayout - a.totalPayout ||
        b.sales - a.sales ||
        a.name.localeCompare(b.name, 'es'),
    );
}

export interface CashMovementDraft {
  entryType: 'expense' | 'product_sale' | 'service_income';
  description: string;
  amountMxn: number;
  method: PaymentMethod;
  staffId: string | null;
}

export function buildCommissionPayoutDraft(
  row: CommissionStaffRow,
  period: CajaPeriod,
): CashMovementDraft {
  return {
    entryType: 'expense',
    description: `Pago de comisiones y propinas · ${row.name} (${cajaPeriodLabel(period)})`,
    amountMxn: Number((Math.max(0, row.totalPayout) / 100).toFixed(2)),
    method: 'cash',
    staffId: row.id,
  };
}

export interface CouponStatusMeta {
  status: 'active' | 'paused' | 'exhausted' | 'expired';
  label: string;
  tone: StatusTagTone;
}

export function classifyCouponStatus(coupon: Coupon, nowMs: number): CouponStatusMeta {
  if (!coupon.isActive) {
    return { status: 'paused', label: 'Pausado', tone: 'neutral' };
  }
  if (coupon.expiresAt) {
    const expiresMs = Date.parse(coupon.expiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs < nowMs) {
      return { status: 'expired', label: 'Vencido', tone: 'danger' };
    }
  }
  const isGiftCardEmpty =
    coupon.kind === 'gift_card' && (coupon.remainingBalanceCents ?? 0) <= 0;
  const isMaxUsesReached =
    coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
  if (isGiftCardEmpty || isMaxUsesReached) {
    return { status: 'exhausted', label: 'Agotado', tone: 'warning' };
  }
  return { status: 'active', label: 'Activo', tone: 'success' };
}

export interface CouponEditorInput {
  id?: string;
  code: string;
  kind: 'coupon' | 'gift_card';
  discountType: 'percent' | 'fixed_cents';
  value: number;
  remainingBalanceMxn: number;
  minSubtotalMxn: number;
  maxUses: number;
  expiresDate: string;
  recipientName: string;
  isActive: boolean;
}

export interface CouponPayloadData {
  id?: string;
  code: string;
  kind: 'coupon' | 'gift_card';
  discountType: 'percent' | 'fixed_cents';
  discountValue: number;
  remainingBalanceCents: number | null;
  maxUses: number | null;
  minSubtotalCents: number;
  expiresAt: string | null;
  recipientName: string | null;
  isActive: boolean;
}

export function formatExpiryDateInput(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(expiresAt.trim());
  return match?.[1] ?? '';
}

export function validateCouponEditorInput(
  input: CouponEditorInput,
): { ok: true; data: CouponPayloadData } | { ok: false; error: string } {
  const cleanCode = input.code.trim().toUpperCase();
  if (cleanCode.length < 2) {
    return { ok: false, error: 'Escribe un código de al menos 2 caracteres.' };
  }
  if (cleanCode.length > 40) {
    return { ok: false, error: 'El código no puede tener más de 40 caracteres.' };
  }

  const isFixed = input.kind === 'gift_card' || input.discountType === 'fixed_cents';
  if (!Number.isFinite(input.value) || input.value <= 0) {
    return { ok: false, error: 'Ingresa un valor mayor a 0.' };
  }
  if (!isFixed && (input.value < 1 || input.value > 100)) {
    return { ok: false, error: 'El descuento en porcentaje debe estar entre 1% y 100%.' };
  }

  const discountValue = isFixed
    ? Math.round(input.value * 100)
    : Math.round(input.value);

  const remainingBalanceCents =
    input.kind === 'gift_card'
      ? input.id
        ? Math.max(
            0,
            Math.round(
              (Number.isFinite(input.remainingBalanceMxn)
                ? input.remainingBalanceMxn
                : 0) * 100,
            ),
          )
        : discountValue
      : null;

  const minSubtotalCents = Math.max(
    0,
    Math.round((Number.isFinite(input.minSubtotalMxn) ? input.minSubtotalMxn : 0) * 100),
  );

  const maxUses =
    Number.isFinite(input.maxUses) && input.maxUses > 0
      ? Math.min(100_000, Math.round(input.maxUses))
      : null;

  const trimmedDate = input.expiresDate.trim();
  let expiresAt: string | null = null;
  if (trimmedDate.length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      return { ok: false, error: 'La fecha de vencimiento debe tener formato AAAA-MM-DD.' };
    }
    const parsed = Date.parse(`${trimmedDate}T23:59:59.000Z`);
    if (Number.isNaN(parsed)) {
      return { ok: false, error: 'Ingresa una fecha de vencimiento válida.' };
    }
    expiresAt = `${trimmedDate}T23:59:59.000Z`;
  }

  const data: CouponPayloadData = {
    code: cleanCode,
    kind: input.kind,
    discountType: isFixed ? 'fixed_cents' : 'percent',
    discountValue,
    remainingBalanceCents,
    maxUses,
    minSubtotalCents,
    expiresAt,
    recipientName: input.recipientName.trim() || null,
    isActive: input.isActive,
  };

  if (input.id) {
    data.id = input.id;
  }

  return { ok: true, data };
}

export function computeTodayExpectedCashCents(
  cashEntries: readonly CashRegisterEntry[],
  todayKey: string,
  tz: string,
): number {
  return cashEntries
    .filter(
      (entry) =>
        entry.paymentMethod === 'cash' &&
        isIsoInCajaPeriod(entry.occurredAt, todayKey, tz, 'today'),
    )
    .reduce(
      (sum, entry) =>
        sum +
        (entry.entryType === 'expense'
          ? -Math.abs(entry.amountCents)
          : entry.amountCents + entry.tipCents),
      0,
    );
}

export interface CashReconciliation {
  expectedCents: number;
  countedCents: number;
  diffCents: number;
  status: 'balanced' | 'over' | 'short';
  tone: 'success' | 'warning' | 'danger';
  shortLabel: string;
}

export function computeCashReconciliation(
  expectedCents: number,
  countedMxn: number,
): CashReconciliation {
  const safeCounted = Number.isFinite(countedMxn) ? Math.max(0, countedMxn) : 0;
  const countedCents = Math.round(safeCounted * 100);
  const diffCents = countedCents - expectedCents;
  if (diffCents === 0) {
    return {
      expectedCents,
      countedCents,
      diffCents: 0,
      status: 'balanced',
      tone: 'success',
      shortLabel: 'Cuadra',
    };
  }
  if (diffCents > 0) {
    return {
      expectedCents,
      countedCents,
      diffCents,
      status: 'over',
      tone: 'warning',
      shortLabel: 'Sobrante',
    };
  }
  return {
    expectedCents,
    countedCents,
    diffCents,
    status: 'short',
    tone: 'danger',
    shortLabel: 'Faltante',
  };
}

export function formatCashCloseWhatsAppSummary(params: {
  salonName: string;
  todayKey: string;
  currency: 'MXN' | 'USD';
  todaySummary: CajaPeriodSummary;
  expectedCashCents: number;
  countedMxn: number;
  uncollectedCount: number;
  uncollectedTotalCents: number;
  pendingDepositsCount: number;
  pendingDepositsTotalCents: number;
}): string {
  const {
    salonName,
    todayKey,
    currency,
    todaySummary,
    expectedCashCents,
    countedMxn,
    uncollectedCount,
    uncollectedTotalCents,
    pendingDepositsCount,
    pendingDepositsTotalCents,
  } = params;
  const reconciliation = computeCashReconciliation(expectedCashCents, countedMxn);
  const money = (cents: number) => formatCurrency(cents, currency);
  const diffDisplay =
    reconciliation.status === 'balanced'
      ? `${money(0)} (Caja cuadrada)`
      : reconciliation.status === 'over'
        ? `+${money(reconciliation.diffCents)} (Sobrante)`
        : `-${money(Math.abs(reconciliation.diffCents))} (Faltante)`;

  const lines: string[] = [
    `*Corte de caja — ${salonName}*`,
    `Fecha: ${formatDateKeyDisplay(todayKey, 'long')}`,
    '',
    '*Resumen del día*',
    `• Total cobrado: ${money(todaySummary.collectedCents)} (${todaySummary.ticketCount} ${todaySummary.ticketCount === 1 ? 'movimiento' : 'movimientos'})`,
    `• Efectivo: ${money(todaySummary.cashCents)} (${todaySummary.cashCount})`,
    `• Tarjeta: ${money(todaySummary.cardCents)} (${todaySummary.cardCount})`,
    `• Transferencia: ${money(todaySummary.transferCents)} (${todaySummary.transferCount})`,
  ];

  if (todaySummary.giftCardCents > 0) {
    lines.push(
      `• Tarjeta de regalo: ${money(todaySummary.giftCardCents)} (${todaySummary.giftCardCount})`,
    );
  }

  lines.push(
    `• Propinas: ${money(todaySummary.tipsCents)}`,
    `• Gastos: ${money(todaySummary.expensesCents)}`,
    `• Neto del día: ${money(todaySummary.netCents)}`,
    '',
    '*Arqueo de efectivo*',
    `• Efectivo esperado: ${money(reconciliation.expectedCents)}`,
    `• Efectivo contado: ${money(reconciliation.countedCents)}`,
    `• Diferencia: ${diffDisplay}`,
  );

  if (uncollectedCount > 0 || pendingDepositsCount > 0) {
    lines.push('', '*Pendientes*');
    if (uncollectedCount > 0) {
      lines.push(
        `• Citas sin cobrar: ${uncollectedCount} (${money(uncollectedTotalCents)})`,
      );
    }
    if (pendingDepositsCount > 0) {
      lines.push(
        `• Anticipos por confirmar: ${pendingDepositsCount} (${money(pendingDepositsTotalCents)})`,
      );
    }
  } else {
    lines.push('', '*Pendientes*', '• Sin saldos pendientes por cobrar');
  }

  return lines.join('\n');
}
