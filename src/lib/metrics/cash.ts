import { DEFAULT_RETAIL_COMMISSION_PERCENT } from '../caja/caja-config';
import type {
  AdminRole,
  CashRegisterEntry,
  PaymentSplit,
  StaffMember,
} from '../types';
import {
  isIsoInMetricRange,
  resolveMetricPeriodRange,
  type MetricCustomRange,
  type MetricDateRange,
  type MetricReportPeriod,
} from './periods';

export interface CashPeriodSummary {
  hasEntries: boolean;
  collectedCents: number;
  expensesCents: number;
  netCents: number;
  tipsCents: number;
  commissionsCents: number;
  ticketCount: number;
  averageTicketCents: number;
  cashCents: number;
  cashCount: number;
  digitalCents: number;
  cardCents: number;
  cardCount: number;
  transferCents: number;
  transferCount: number;
  giftCardCents: number;
  giftCardCount: number;
}

export type StaffCommissionRow = {
  id: string;
  name: string;
  percent: number;
  retailPercent: number;
  servicesCount: number;
  sales: number;
  serviceSales: number;
  serviceCommission: number;
  retailSales: number;
  retailCommission: number;
  otherCommission: number;
  commission: number;
  tips: number;
  splitTipsCents: number;
  splitTipsCount: number;
  totalPayout: number;
};

export interface CashDrawerBreakdown {
  openingFloatCents: number;
  cashSalesCents: number;
  cashTipsCents: number;
  cashExpensesCents: number;
  expectedCents: number;
}

export interface CashReconciliation {
  expectedCents: number;
  countedCents: number;
  diffCents: number;
  status: 'balanced' | 'over' | 'short';
  tone: 'success' | 'warning' | 'danger';
  shortLabel: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function computePercentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function computeCashPeriodSummary(
  entries: readonly CashRegisterEntry[],
): CashPeriodSummary {
  let collectedCents = 0;
  let expensesCents = 0;
  let tipsCents = 0;
  let commissionsCents = 0;
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
    commissionsCents += Math.max(0, entry.commissionCents);
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
    hasEntries: entries.length > 0,
    collectedCents,
    expensesCents,
    netCents: collectedCents - expensesCents,
    tipsCents,
    commissionsCents,
    ticketCount,
    averageTicketCents: ticketCount > 0 ? Math.round(collectedCents / ticketCount) : 0,
    cashCents,
    cashCount,
    digitalCents: cardCents + transferCents + giftCardCents,
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
  row: Pick<
    StaffCommissionRow,
    'serviceSales' | 'retailCommission' | 'otherCommission' | 'tips'
  >,
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
  period: MetricReportPeriod;
  custom?: MetricCustomRange | null;
  retailCommissionPercent?: number;
  viewerRole: AdminRole;
  viewerStaffId: string | null;
}): StaffCommissionRow[] {
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
  const range = resolveMetricPeriodRange(todayKey, period, custom);
  const retailPct = clampPercent(retailCommissionPercent);

  const visibleStaff =
    viewerRole === 'specialist'
      ? viewerStaffId
        ? staff.filter((st) => st.id === viewerStaffId)
        : []
      : staff;

  const scopedCashEntries = cashEntries.filter((entry) =>
    isIsoInMetricRange(entry.occurredAt, range, tz),
  );
  const scopedSplits = paymentSplits.filter((split) =>
    isIsoInMetricRange(split.createdAt, range, tz),
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

export function computeCashDrawer(params: {
  cashEntries: readonly CashRegisterEntry[];
  todayKey: string;
  tz: string;
  openingFloatCents?: number;
}): CashDrawerBreakdown {
  const range: MetricDateRange = { startKey: params.todayKey, endKey: params.todayKey };
  const openingFloatCents = Math.max(0, Math.round(params.openingFloatCents ?? 0));
  let cashSalesCents = 0;
  let cashTipsCents = 0;
  let cashExpensesCents = 0;
  for (const entry of params.cashEntries) {
    if (entry.paymentMethod !== 'cash') continue;
    if (!isIsoInMetricRange(entry.occurredAt, range, params.tz)) continue;
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
