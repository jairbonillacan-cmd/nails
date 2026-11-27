import type { ISODateString } from '@astryxdesign/core/Calendar';
import type { FilterPillOption } from '@/components/ui/FilterPillBar';
import type { StatusTagTone } from '@/components/ui/StatusTag';
import { formatCurrency, formatDateKeyDisplay } from '@/lib/format';
import {
  UNIFIED_PERIOD_OPTIONS,
  computeCashDrawer,
  computeCashPeriodSummary,
  computeCashReconciliation,
  computeCommissionsByStaff,
  computeEntryCommissionCents,
  computeTodayExpectedCashCents,
  formatMetricPeriodLabel,
  isIsoInMetricPeriod,
  isIsoInMetricRange,
  previewStaffCommission,
  resolveMetricPeriodRange,
  type CashDrawerBreakdown,
  type CashPeriodSummary,
  type CashReconciliation,
  type MetricCustomRange,
  type MetricPeriod,
} from '@/lib/metrics';
import type {
  CajaCloseSummaryPrefs,
  CashRegisterEntry,
  Coupon,
  PaymentMethod,
} from '@/lib/types';
import {
  paymentMethodLabel,
  type CommissionStaffRow,
  type SplitDetailRow,
} from './cajaTypes';

export type CajaPeriod = MetricPeriod;
export type CajaMethodFilter = 'all' | 'cash' | 'card' | 'transfer';
export type MovementTypeFilter = 'all' | 'income' | 'deposits' | 'expenses';
export type CajaCustomRange = MetricCustomRange;
export type CajaPeriodSummary = CashPeriodSummary;

export {
  computeCashDrawer,
  computeCashPeriodSummary as computeCajaPeriodSummary,
  computeCashReconciliation,
  computeCommissionsByStaff,
  computeEntryCommissionCents,
  computeTodayExpectedCashCents,
  formatMetricPeriodLabel as cajaPeriodLabel,
  isIsoInMetricPeriod as isIsoInCajaPeriod,
  previewStaffCommission,
  resolveMetricPeriodRange as getCajaPeriodRange,
};

export const CAJA_PERIOD_OPTIONS: readonly FilterPillOption<CajaPeriod>[] = UNIFIED_PERIOD_OPTIONS;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDateString(value: string): value is ISODateString {
  return DATE_KEY_RE.test(value);
}

export function toIsoDateValue(value: string | null | undefined): ISODateString | undefined {
  const clean = value?.trim() ?? '';
  return isIsoDateString(clean) ? clean : undefined;
}

export function getCajaPeriodStartKey(
  todayKey: string,
  period: CajaPeriod,
  custom?: CajaCustomRange | null,
): string | null {
  return resolveMetricPeriodRange(todayKey, period, custom).startKey;
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
  clientPhone?: string;
  staffName: string;
}

export function isCashEntryEditable(entry: CashRegisterEntry): boolean {
  return entry.bookingId === null;
}

export interface CajaFilterScope {
  period: CajaPeriod;
  custom?: CajaCustomRange | null;
  todayKey: string;
  tz: string;
}

export function filterCashEntries(
  entries: readonly CashRegisterEntry[],
  options: CajaFilterScope & {
    method: CajaMethodFilter;
    entryType?: MovementTypeFilter;
    query: string;
    bookingLookup?: ReadonlyMap<string, CajaBookingSearchMeta>;
  },
): CashRegisterEntry[] {
  const { method, entryType = 'all', query, tz, bookingLookup } = options;
  const range = resolveMetricPeriodRange(options.todayKey, options.period, options.custom);
  const cleanQuery = normalizeSearchToken(query);

  return entries
    .filter((entry) => {
      if (!isIsoInMetricRange(entry.occurredAt, range, tz)) return false;
      if (method !== 'all' && entry.paymentMethod !== method) return false;
      if (entryType === 'deposits' && entry.entryType !== 'deposit') return false;
      if (entryType === 'expenses' && entry.entryType !== 'expense') return false;
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
  options: CajaFilterScope & { method: CajaMethodFilter; query: string },
): SplitDetailRow[] {
  const { method, query, tz } = options;
  const range = resolveMetricPeriodRange(options.todayKey, options.period, options.custom);
  const cleanQuery = normalizeSearchToken(query);

  return splits.filter((row) => {
    if (!isIsoInMetricRange(row.createdAt, range, tz)) return false;
    if (method !== 'all' && row.method !== method) return false;
    if (!cleanQuery) return true;
    const haystack = normalizeSearchToken(
      [row.clientName, row.bookingCode, row.reference ?? '', row.tipStaffName ?? ''].join(' '),
    );
    return haystack.includes(cleanQuery);
  });
}

export interface CashMovementDraft {
  entryType: 'expense' | 'product_sale' | 'service_income';
  description: string;
  amountMxn: number;
  method: PaymentMethod;
  staffId: string | null;
}

export interface CommissionPayoutDraft extends CashMovementDraft {
  entryType: 'expense';
  staffName: string;
  periodLabel: string;
  serviceCommissionCents: number;
  retailCommissionCents: number;
  otherCommissionCents: number;
  tipsCents: number;
  totalCents: number;
}

export function buildCommissionPayoutDraft(
  row: CommissionStaffRow,
  period: CajaPeriod,
  custom?: CajaCustomRange | null,
  todayKey?: string,
): CommissionPayoutDraft {
  const periodLabel = formatMetricPeriodLabel(period, custom, todayKey);
  const totalCents = Math.max(0, row.totalPayout);
  return {
    entryType: 'expense',
    description: `Pago de comisiones y propinas · ${row.name} (${periodLabel})`,
    amountMxn: Number((totalCents / 100).toFixed(2)),
    method: 'cash',
    staffId: row.id,
    staffName: row.name,
    periodLabel,
    serviceCommissionCents: row.serviceCommission,
    retailCommissionCents: row.retailCommission,
    otherCommissionCents: row.otherCommission,
    tipsCents: row.tips,
    totalCents,
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
  const isMaxUsesReached = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses;
  if (isGiftCardEmpty || isMaxUsesReached) {
    return { status: 'exhausted', label: 'Agotado', tone: 'warning' };
  }
  return { status: 'active', label: 'Activo', tone: 'success' };
}

export type CouponListFilter = 'all' | 'coupon' | 'gift_card' | 'active' | 'inactive';

export const COUPON_LIST_FILTER_OPTIONS: readonly FilterPillOption<CouponListFilter>[] = [
  { value: 'all', label: 'Todos' },
  { value: 'coupon', label: 'Cupones' },
  { value: 'gift_card', label: 'Tarjetas' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Pausados o vencidos' },
];

export function filterCoupons(
  coupons: readonly Coupon[],
  options: { filter: CouponListFilter; query: string; nowMs: number },
): Coupon[] {
  const cleanQuery = normalizeSearchToken(options.query);
  return coupons.filter((coupon) => {
    const status = classifyCouponStatus(coupon, options.nowMs).status;
    if (options.filter === 'coupon' && coupon.kind !== 'coupon') return false;
    if (options.filter === 'gift_card' && coupon.kind !== 'gift_card') return false;
    if (options.filter === 'active' && status !== 'active') return false;
    if (options.filter === 'inactive' && status === 'active') return false;
    if (!cleanQuery) return true;
    return normalizeSearchToken(`${coupon.code} ${coupon.recipientName ?? ''}`).includes(
      cleanQuery,
    );
  });
}

const COUPON_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCouponCode(
  kind: 'coupon' | 'gift_card',
  random: () => number,
  existingCodes: readonly string[] = [],
): string {
  const prefix = kind === 'gift_card' ? 'REGALO' : 'PROMO';
  const taken = new Set(existingCodes.map((code) => code.trim().toUpperCase()));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let suffix = '';
    for (let i = 0; i < 5; i += 1) {
      const idx = Math.min(
        COUPON_CODE_ALPHABET.length - 1,
        Math.floor(Math.max(0, random()) * COUPON_CODE_ALPHABET.length),
      );
      suffix += COUPON_CODE_ALPHABET[idx];
    }
    const candidate = `${prefix}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${prefix}-${String(taken.size + 1).padStart(5, '0')}`;
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

export function describeCouponPreview(
  input: CouponEditorInput,
  currency: 'MXN' | 'USD',
): { headline: string; details: string[] } {
  const money = (mxn: number) =>
    formatCurrency(Math.round((Number.isFinite(mxn) ? Math.max(0, mxn) : 0) * 100), currency);
  const code = input.code.trim().toUpperCase() || 'TU-CÓDIGO';
  const isGiftCard = input.kind === 'gift_card';
  const isFixed = isGiftCard || input.discountType === 'fixed_cents';
  const headline = isGiftCard
    ? `${code}: tarjeta de regalo con ${money(input.value)} de saldo`
    : isFixed
      ? `${code}: ${money(input.value)} de descuento`
      : `${code}: ${Math.round(Number.isFinite(input.value) ? input.value : 0)}% de descuento`;

  const details: string[] = [];
  if (isGiftCard && input.id) {
    details.push(`Saldo disponible: ${money(input.remainingBalanceMxn)}`);
  }
  details.push(
    input.minSubtotalMxn > 0
      ? `Aplica en compras desde ${money(input.minSubtotalMxn)}`
      : 'Aplica sin compra mínima',
  );
  const trimmedDate = input.expiresDate.trim();
  details.push(
    DATE_KEY_RE.test(trimmedDate)
      ? `Vence el ${formatDateKeyDisplay(trimmedDate, 'long')}`
      : 'No vence',
  );
  if (isGiftCard) details.push('Se descuenta del saldo hasta agotarlo');
  details.push(
    Number.isFinite(input.maxUses) && input.maxUses > 0
      ? `Hasta ${Math.round(input.maxUses)} ${Math.round(input.maxUses) === 1 ? 'canje' : 'canjes'} en total`
      : 'Canjes ilimitados',
  );
  if (input.recipientName.trim()) details.push(`Para ${input.recipientName.trim()}`);
  if (!input.isActive) details.push('Pausado: no se acepta en nuevas reservas');
  return { headline, details };
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

  const discountValue = isFixed ? Math.round(input.value * 100) : Math.round(input.value);

  const remainingBalanceCents =
    input.kind === 'gift_card'
      ? input.id
        ? Math.max(
            0,
            Math.round(
              (Number.isFinite(input.remainingBalanceMxn) ? input.remainingBalanceMxn : 0) * 100,
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
    if (!DATE_KEY_RE.test(trimmedDate)) {
      return { ok: false, error: 'Elige una fecha de vencimiento válida.' };
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

  if (input.id) data.id = input.id;

  return { ok: true, data };
}

export interface PackageEconomics {
  perSessionCents: number;
  regularTotalCents: number;
  savingsCents: number;
  savingsPercent: number;
  isMoreExpensive: boolean;
}

export function computePackageEconomics(params: {
  priceCents: number;
  totalSessions: number;
  servicePriceCents: number | null;
}): PackageEconomics {
  const sessions = Math.max(1, Math.round(params.totalSessions || 1));
  const price = Math.max(0, Math.round(params.priceCents));
  const unit = Math.max(0, Math.round(params.servicePriceCents ?? 0));
  const regularTotalCents = unit * sessions;
  const savingsCents = regularTotalCents - price;
  return {
    perSessionCents: Math.round(price / sessions),
    regularTotalCents,
    savingsCents,
    savingsPercent:
      regularTotalCents > 0 ? Math.round((savingsCents / regularTotalCents) * 100) : 0,
    isMoreExpensive: regularTotalCents > 0 && price > regularTotalCents,
  };
}

export function buildCashAdjustmentDraft(
  reconciliation: CashReconciliation,
  note: string,
  todayKey: string,
): CashMovementDraft | null {
  if (reconciliation.status === 'balanced') return null;
  const cleanNote = note.replace(/\s+/g, ' ').trim().slice(0, 120);
  const label = reconciliation.status === 'short' ? 'Faltante' : 'Sobrante';
  const base = `Ajuste de arqueo · ${label} (${todayKey})`;
  return {
    entryType: reconciliation.status === 'short' ? 'expense' : 'service_income',
    description: cleanNote ? `${base} · ${cleanNote}` : base,
    amountMxn: Number((Math.abs(reconciliation.diffCents) / 100).toFixed(2)),
    method: 'cash',
    staffId: null,
  };
}

export function suggestQuickAmounts(
  entries: readonly CashRegisterEntry[],
  entryType: 'expense' | 'product_sale' | 'service_income',
  fallbackMxn: readonly number[] = [100, 150, 200, 300],
  limit = 4,
): number[] {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    if (entry.bookingId !== null || entry.entryType !== entryType) continue;
    const mxn = Math.round(Math.abs(entry.amountCents) / 100);
    if (mxn <= 0) continue;
    counts.set(mxn, (counts.get(mxn) ?? 0) + 1);
  }
  const frequent = [...counts.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([amount]) => amount);
  const merged: number[] = [];
  for (const amount of [...frequent, ...fallbackMxn]) {
    if (merged.length >= limit) break;
    if (!merged.includes(amount)) merged.push(amount);
  }
  return merged.toSorted((a, b) => a - b);
}

export function formatCashCloseWhatsAppSummary(params: {
  salonName: string;
  todayKey: string;
  currency: 'MXN' | 'USD';
  todaySummary: CajaPeriodSummary;
  drawer?: CashDrawerBreakdown;
  expectedCashCents: number;
  countedMxn: number;
  closeNote?: string;
  prefs?: CajaCloseSummaryPrefs;
  staffRows?: readonly CommissionStaffRow[];
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
    drawer,
    expectedCashCents,
    countedMxn,
    closeNote,
    prefs = { includeStaffBreakdown: true, includeTips: true, includePending: true },
    staffRows = [],
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
  if (prefs.includeTips) {
    lines.push(`• Propinas: ${money(todaySummary.tipsCents)}`);
  }
  lines.push(
    `• Gastos: ${money(todaySummary.expensesCents)}`,
    `• Neto del día: ${money(todaySummary.netCents)}`,
    '',
    '*Arqueo de efectivo*',
  );
  if (drawer && drawer.openingFloatCents > 0) {
    lines.push(`• Fondo inicial: ${money(drawer.openingFloatCents)}`);
  }
  if (drawer) {
    lines.push(
      `• Cobros en efectivo: ${money(drawer.cashSalesCents + drawer.cashTipsCents)}`,
      `• Gastos en efectivo: -${money(drawer.cashExpensesCents)}`,
    );
  }
  lines.push(
    `• Efectivo esperado: ${money(reconciliation.expectedCents)}`,
    `• Efectivo contado: ${money(reconciliation.countedCents)}`,
    `• Diferencia: ${diffDisplay}`,
  );
  const cleanNote = closeNote?.replace(/\s+/g, ' ').trim();
  if (cleanNote) lines.push(`• Nota: ${cleanNote}`);

  const payingRows = staffRows.filter((row) => row.totalPayout > 0);
  if (prefs.includeStaffBreakdown && payingRows.length > 0) {
    lines.push('', '*Por profesional*');
    for (const row of payingRows) {
      lines.push(
        prefs.includeTips
          ? `• ${row.name}: ${money(row.commission)} comisión + ${money(row.tips)} propinas = ${money(row.totalPayout)}`
          : `• ${row.name}: ${money(row.commission)} comisión`,
      );
    }
  }

  if (prefs.includePending) {
    if (uncollectedCount > 0 || pendingDepositsCount > 0) {
      lines.push('', '*Pendientes*');
      if (uncollectedCount > 0) {
        lines.push(`• Citas sin cobrar: ${uncollectedCount} (${money(uncollectedTotalCents)})`);
      }
      if (pendingDepositsCount > 0) {
        lines.push(
          `• Anticipos por confirmar: ${pendingDepositsCount} (${money(pendingDepositsTotalCents)})`,
        );
      }
    } else {
      lines.push('', '*Pendientes*', '• Sin saldos pendientes por cobrar');
    }
  }

  return lines.join('\n');
}
