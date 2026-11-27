import type { ISODateString } from '@astryxdesign/core/Calendar';
import { DEFAULT_RETAIL_COMMISSION_PERCENT } from '@/lib/caja/caja-config';
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
  CajaCloseSummaryPrefs,
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

export type CajaPeriod = 'today' | '7d' | 'month' | 'last_month' | 'custom' | 'all';
export type CajaMethodFilter = 'all' | 'cash' | 'card' | 'transfer';
export type MovementTypeFilter = 'all' | 'income' | 'deposits' | 'expenses';

export interface CajaCustomRange {
  fromKey: string;
  toKey: string;
}

export interface CajaDateRange {
  startKey: string | null;
  endKey: string | null;
}

export const CAJA_PERIOD_OPTIONS: readonly FilterPillOption<CajaPeriod>[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
  { value: 'custom', label: 'Fechas' },
  { value: 'all', label: 'Todo' },
];


const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDateKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && DATE_KEY_RE.test(value.trim());
}

function isIsoDateString(value: string): value is ISODateString {
  return DATE_KEY_RE.test(value);
}

export function toIsoDateValue(value: string | null | undefined): ISODateString | undefined {
  const clean = value?.trim() ?? '';
  return isIsoDateString(clean) ? clean : undefined;
}

function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

export function getCajaPeriodRange(
  todayKey: string,
  period: CajaPeriod,
  custom?: CajaCustomRange | null,
): CajaDateRange {
  if (period === 'all') return { startKey: null, endKey: null };
  if (period === 'today') return { startKey: todayKey, endKey: todayKey };
  if (period === '7d') return { startKey: shiftDateKey(todayKey, -6), endKey: todayKey };
  if (period === 'month') {
    return { startKey: isDateKey(todayKey) ? monthStartKey(todayKey) : todayKey, endKey: todayKey };
  }
  if (period === 'last_month') {
    if (!isDateKey(todayKey)) return { startKey: todayKey, endKey: todayKey };
    const lastDayPrev = shiftDateKey(monthStartKey(todayKey), -1);
    return { startKey: monthStartKey(lastDayPrev), endKey: lastDayPrev };
  }
  const from = isDateKey(custom?.fromKey) ? custom.fromKey.trim() : null;
  const to = isDateKey(custom?.toKey) ? custom.toKey.trim() : null;
  if (from && to && from > to) return { startKey: to, endKey: from };
  return { startKey: from, endKey: to };
}

export function getCajaPeriodStartKey(
  todayKey: string,
  period: CajaPeriod,
  custom?: CajaCustomRange | null,
): string | null {
  return getCajaPeriodRange(todayKey, period, custom).startKey;
}

function formatRangeKey(key: string): string {
  return formatDateKeyDisplay(key, 'short').replace(/^[^,]+,\s*/, '');
}

export function cajaPeriodLabel(
  period: CajaPeriod,
  custom?: CajaCustomRange | null,
  todayKey?: string,
): string {
  if (period === 'today') return 'Hoy';
  if (period === '7d') return 'Últimos 7 días';
  if (period === 'month') return 'Este mes';
  if (period === 'last_month') return 'Mes pasado';
  if (period === 'all') return 'Histórico';
  const range = getCajaPeriodRange(todayKey ?? '', 'custom', custom);
  if (range.startKey && range.endKey) {
    return range.startKey === range.endKey
      ? formatRangeKey(range.startKey)
      : `${formatRangeKey(range.startKey)} – ${formatRangeKey(range.endKey)}`;
  }
  if (range.startKey) return `Desde ${formatRangeKey(range.startKey)}`;
  if (range.endKey) return `Hasta ${formatRangeKey(range.endKey)}`;
  return 'Rango personalizado';
}

function isIsoInCajaRange(iso: string, range: CajaDateRange, tz: string): boolean {
  if (!range.startKey && !range.endKey) return true;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  const entryKey = getDateKeyInTimezone(parsed, tz);
  if (range.startKey && entryKey < range.startKey) return false;
  if (range.endKey && entryKey > range.endKey) return false;
  return true;
}

export function isIsoInCajaPeriod(
  iso: string,
  todayKey: string,
  tz: string,
  period: CajaPeriod,
  custom?: CajaCustomRange | null,
): boolean {
  return isIsoInCajaRange(iso, getCajaPeriodRange(todayKey, period, custom), tz);
}

function normalizeSearchToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
  const range = getCajaPeriodRange(options.todayKey, options.period, options.custom);
  const cleanQuery = normalizeSearchToken(query);

  return entries
    .filter((entry) => {
      if (!isIsoInCajaRange(entry.occurredAt, range, tz)) return false;
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
  const range = getCajaPeriodRange(options.todayKey, options.period, options.custom);
  const cleanQuery = normalizeSearchToken(query);

  return splits.filter((row) => {
    if (!isIsoInCajaRange(row.createdAt, range, tz)) return false;
    if (method !== 'all' && row.method !== method) return false;
    if (!cleanQuery) return true;
    const haystack = normalizeSearchToken(
      [row.clientName, row.bookingCode, row.reference ?? '', row.tipStaffName ?? ''].join(' '),
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function computeEntryCommissionCents(
  entry: CashRegisterEntry,
  commissionPercent: number,
  retailCommissionPercent: number = DEFAULT_RETAIL_COMMISSION_PERCENT,
): number {
  if (entry.entryType === 'expense') return 0;
  const amount = Math.max(0, entry.amountCents);
  if (entry.entryType === 'service_income') {
    return Math.round((amount * clampPercent(commissionPercent)) / 100);
  }
  if (entry.entryType === 'product_sale') {
    return Math.round((amount * clampPercent(retailCommissionPercent)) / 100);
  }
  return Math.max(0, entry.commissionCents);
}

export function previewStaffCommission(
  row: Pick<CommissionStaffRow, 'serviceSales' | 'retailCommission' | 'otherCommission' | 'tips'>,
  servicePercent: number,
): { serviceCommission: number; commission: number; totalPayout: number } {
  const serviceCommission = Math.round((row.serviceSales * clampPercent(servicePercent)) / 100);
  const commission = serviceCommission + row.retailCommission + row.otherCommission;
  return { serviceCommission, commission, totalPayout: commission + row.tips };
}

export function computeCommissionsByStaff(params: {
  staff: readonly StaffMember[];
  cashEntries: readonly CashRegisterEntry[];
  paymentSplits: readonly PaymentSplit[];
  todayKey: string;
  tz: string;
  period: CajaPeriod;
  custom?: CajaCustomRange | null;
  retailCommissionPercent?: number;
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
    custom,
    retailCommissionPercent = DEFAULT_RETAIL_COMMISSION_PERCENT,
    viewerRole,
    viewerStaffId,
  } = params;
  const range = getCajaPeriodRange(todayKey, period, custom);
  const retailPct = clampPercent(retailCommissionPercent);

  const visibleStaff =
    viewerRole === 'specialist'
      ? viewerStaffId
        ? staff.filter((st) => st.id === viewerStaffId)
        : []
      : staff;

  const scopedCashEntries = cashEntries.filter((entry) =>
    isIsoInCajaRange(entry.occurredAt, range, tz),
  );
  const scopedSplits = paymentSplits.filter((split) =>
    isIsoInCajaRange(split.createdAt, range, tz),
  );

  return visibleStaff
    .map((st) => {
      const entries = scopedCashEntries.filter(
        (entry) => entry.staffId === st.id && entry.entryType !== 'expense',
      );
      let serviceSales = 0;
      let retailSales = 0;
      let retailCommission = 0;
      let otherCommission = 0;
      let tips = 0;
      for (const entry of entries) {
        const amount = Math.max(0, entry.amountCents);
        tips += Math.max(0, entry.tipCents);
        if (entry.entryType === 'service_income') {
          serviceSales += amount;
        } else if (entry.entryType === 'product_sale') {
          retailSales += amount;
          retailCommission += computeEntryCommissionCents(entry, st.commissionPercent, retailPct);
        } else {
          otherCommission += computeEntryCommissionCents(entry, st.commissionPercent, retailPct);
        }
      }
      const sales = entries.reduce((sum, entry) => sum + Math.max(0, entry.amountCents), 0);
      const serviceCommission = Math.round(
        (serviceSales * clampPercent(st.commissionPercent)) / 100,
      );
      const commission = serviceCommission + retailCommission + otherCommission;
      const splitTipsEntries = scopedSplits.filter(
        (split) => split.tipStaffId === st.id && split.tipCents > 0,
      );
      const splitTipsCents = splitTipsEntries.reduce((sum, item) => sum + item.tipCents, 0);
      return {
        id: st.id,
        name: st.name,
        percent: st.commissionPercent,
        retailPercent: retailPct,
        servicesCount: entries.filter((entry) => entry.amountCents > 0).length,
        sales,
        serviceSales,
        serviceCommission,
        retailSales,
        retailCommission,
        otherCommission,
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
  const periodLabel = cajaPeriodLabel(period, custom, todayKey);
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

export interface CashDrawerBreakdown {
  openingFloatCents: number;
  cashSalesCents: number;
  cashTipsCents: number;
  cashExpensesCents: number;
  expectedCents: number;
}

export function computeCashDrawer(params: {
  cashEntries: readonly CashRegisterEntry[];
  todayKey: string;
  tz: string;
  openingFloatCents?: number;
}): CashDrawerBreakdown {
  const range: CajaDateRange = { startKey: params.todayKey, endKey: params.todayKey };
  const openingFloatCents = Math.max(0, Math.round(params.openingFloatCents ?? 0));
  let cashSalesCents = 0;
  let cashTipsCents = 0;
  let cashExpensesCents = 0;
  for (const entry of params.cashEntries) {
    if (entry.paymentMethod !== 'cash') continue;
    if (!isIsoInCajaRange(entry.occurredAt, range, params.tz)) continue;
    if (entry.entryType === 'expense') {
      cashExpensesCents += Math.abs(entry.amountCents);
      continue;
    }
    cashSalesCents += entry.amountCents;
    cashTipsCents += Math.max(0, entry.tipCents);
  }
  return {
    openingFloatCents,
    cashSalesCents,
    cashTipsCents,
    cashExpensesCents,
    expectedCents: openingFloatCents + cashSalesCents + cashTipsCents - cashExpensesCents,
  };
}

export function computeTodayExpectedCashCents(
  cashEntries: readonly CashRegisterEntry[],
  todayKey: string,
  tz: string,
  openingFloatCents = 0,
): number {
  return computeCashDrawer({ cashEntries, todayKey, tz, openingFloatCents }).expectedCents;
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
