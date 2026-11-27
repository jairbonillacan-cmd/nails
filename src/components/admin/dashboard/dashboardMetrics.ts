import { getDateKeyInTimezone } from '@/lib/format';
import {
  computeCashPeriodSummary,
  computePercentDelta,
  formatMetricCompareLabel,
  formatMetricPeriodLabel,
  formatPendingDepositsBreakdown,
  isIsoInMetricRange,
  resolveMetricPeriodRange,
  resolvePreviousMetricPeriodRange,
  selectReceivablesSummary,
  selectTodayAgenda,
  shiftMetricDateKey,
  type MetricPeriod,
} from '@/lib/metrics';
import { roleCanAccess } from '@/lib/rbac';
import type { BookingWithRelations, InventoryItem, StaffMember, WaitlistEntry } from '@/lib/types';
import type { AdminOverviewPayload } from '../AdminProvider';

export type DashboardPeriod = MetricPeriod;

export { computePercentDelta, formatPendingDepositsBreakdown };

type UncollectedBookingItem = AdminOverviewPayload['uncollectedBookings'][number];

interface DashboardCashMetrics {
  hasTodayEntries: boolean;
  hasPeriodEntries: boolean;
  cashIncomeCents: number;
  digitalIncomeCents: number;
  expensesCents: number;
  commissionsCents: number;
  tipsCents: number;
  periodNetCashCents: number;
  todayNetCashCents: number;
  todayTipsCents: number;
}

interface DailySeriesPoint {
  dateKey: string;
  shortLabel: string;
  revenueCents: number;
  bookingsCount: number;
  isToday: boolean;
}

interface StaffTodayLoad {
  id: string;
  name: string;
  firstName: string;
  colorIdx: number;
  todayCount: number;
  sharePercent: number;
}

interface DashboardPeriodMetrics {
  period: DashboardPeriod;
  periodLabel: string;
  compareLabel: string;
  revenueCents: number;
  prevRevenueCents: number;
  revenueDeltaPercent: number | null;
  bookingsCount: number;
  confirmedCount: number;
  prevBookingsCount: number;
  bookingsDeltaPercent: number | null;
}

export interface DashboardMetrics {
  tz: string;
  serverNowMs: number;
  todayKey: string;
  tomorrowKey: string;
  greetingLabel: string;
  headerDateLabel: string;
  activeStaff: StaffMember[];
  staffColorIndex: Map<string, number>;
  uncollectedByBookingId: Map<string, UncollectedBookingItem>;
  uncollectedTotalCents: number;
  pendingDepositsTotalCents: number;
  depositsAwaitingReviewCount: number;
  depositsMissingProofCount: number;
  depositsAwaitingReviewCents: number;
  depositsMissingProofCents: number;
  waitingList: WaitlistEntry[];
  lowStock: InventoryItem[];
  todayBookings: BookingWithRelations[];
  tomorrowBookings: BookingWithRelations[];
  upcomingTodayCount: number;
  totalAttentionCount: number;
  cash: DashboardCashMetrics;
  periodMetrics: DashboardPeriodMetrics;
  dailySeries: DailySeriesPoint[];
  staffTodayLoad: StaffTodayLoad[];
}

const DAY_MS = 86_400_000;

function capitalizeFirst(value: string): string {
  if (!value) return value;
  return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
}

function formatHeaderDate(iso: string, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
  return capitalizeFirst(formatted.replace(/,/g, ''));
}

function resolveGreeting(iso: string, timeZone: string): string {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).format(new Date(iso));
  const hour = Number.parseInt(hourStr, 10);
  if (!Number.isFinite(hour) || hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function shortWeekdayLabel(dateKey: string): string {
  const formatted = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00Z`));
  return capitalizeFirst(formatted.replace(/\./g, '').slice(0, 3));
}

export function getDisplayBookingUrl(appUrl: string): string {
  const cleaned = appUrl.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!cleaned || cleaned.startsWith('localhost') || cleaned.startsWith('127.0.0.1')) {
    return '/reservar';
  }
  return `${cleaned}/reservar`;
}

export function isDisplayableProofUrl(url: string | null): url is string {
  if (!url) return false;
  return url.startsWith('/api/media/') || url.startsWith('https://');
}

export function buildDashboardMetrics(
  data: AdminOverviewPayload,
  period: DashboardPeriod = '7d',
): DashboardMetrics {
  const tz = data.settings.timezone || 'America/Mexico_City';
  const serverNowDate = new Date(data.serverNowIso);
  const serverNowMs = serverNowDate.getTime();
  const todayKey = data.serverTodayKey || getDateKeyInTimezone(serverNowDate, tz);
  const tomorrowKey = getDateKeyInTimezone(new Date(serverNowMs + DAY_MS), tz);
  const role = data.session.user.role;

  const activeStaff = data.staff
    .filter((member) => member.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder);
  const staffColorIndex = new Map<string, number>();
  activeStaff.forEach((member, idx) => {
    staffColorIndex.set(member.id, idx % 4);
  });

  const uncollectedByBookingId = new Map<string, UncollectedBookingItem>();
  for (const item of data.uncollectedBookings) {
    uncollectedByBookingId.set(item.bookingId, item);
  }

  const receivables = selectReceivablesSummary({
    uncollectedBookings: data.uncollectedBookings,
    pendingDeposits: data.pendingDeposits,
  });

  const waitingList = data.waitlist.filter((entry) => entry.status === 'waiting');
  const lowStock = roleCanAccess(role, 'inventory')
    ? data.inventory.filter((item) => item.isActive && item.stockQuantity <= item.minStockAlert)
    : [];

  const nonCanceledBookings = data.bookings
    .filter((booking) => booking.status !== 'canceled')
    .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const agenda = selectTodayAgenda({
    bookings: nonCanceledBookings,
    todayKey,
    tomorrowKey,
    timezone: tz,
    nowMs: serverNowMs,
  });

  const bookingDateKey = (booking: BookingWithRelations) =>
    getDateKeyInTimezone(new Date(booking.startAt), tz);
  const entryDateKey = (occurredAt: string) =>
    getDateKeyInTimezone(new Date(occurredAt), tz);

  const currentRange = resolveMetricPeriodRange(todayKey, period);
  const previousRange = resolvePreviousMetricPeriodRange(todayKey, period);
  const todayRange = resolveMetricPeriodRange(todayKey, 'today');

  const todayCashEntries = data.cashEntries.filter((entry) =>
    isIsoInMetricRange(entry.occurredAt, todayRange, tz),
  );
  const periodCashEntries = data.cashEntries.filter((entry) =>
    isIsoInMetricRange(entry.occurredAt, currentRange, tz),
  );
  const prevCashEntries = previousRange
    ? data.cashEntries.filter((entry) => isIsoInMetricRange(entry.occurredAt, previousRange, tz))
    : [];

  const todayCashSummary = computeCashPeriodSummary(todayCashEntries);
  const periodCashSummary = computeCashPeriodSummary(periodCashEntries);
  const prevCashSummary = computeCashPeriodSummary(prevCashEntries);

  const currentBookings = nonCanceledBookings.filter((booking) =>
    isIsoInMetricRange(booking.startAt, currentRange, tz),
  );
  const prevBookingsCount = previousRange
    ? nonCanceledBookings.filter((booking) =>
        isIsoInMetricRange(booking.startAt, previousRange, tz),
      ).length
    : 0;
  const periodConfirmedCount = currentBookings.filter(
    (booking) => booking.status === 'confirmed' || booking.status === 'completed',
  ).length;

  const dailySeries: DailySeriesPoint[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const key = shiftMetricDateKey(todayKey, offset);
    const revenueCents = data.cashEntries.reduce((sum, entry) => {
      if (entry.entryType === 'expense') return sum;
      return entryDateKey(entry.occurredAt) === key ? sum + entry.amountCents : sum;
    }, 0);
    const bookingsCount = nonCanceledBookings.filter(
      (booking) => bookingDateKey(booking) === key,
    ).length;
    dailySeries.push({
      dateKey: key,
      shortLabel: shortWeekdayLabel(key),
      revenueCents,
      bookingsCount,
      isToday: offset === 0,
    });
  }

  const totalTodayBookings = agenda.todayBookings.length;
  const staffTodayLoad: StaffTodayLoad[] = activeStaff.map((member) => {
    const todayCount = agenda.todayBookings.filter((booking) => booking.staffId === member.id).length;
    const sharePercent =
      totalTodayBookings > 0 ? Math.round((todayCount / totalTodayBookings) * 100) : 0;
    return {
      id: member.id,
      name: member.name,
      firstName: member.name.trim().split(/\s+/)[0] || member.name,
      colorIdx: staffColorIndex.get(member.id) ?? 0,
      todayCount,
      sharePercent,
    };
  });

  const totalAttentionCount =
    data.pendingDeposits.length +
    data.uncollectedBookings.length +
    waitingList.length +
    lowStock.length;

  return {
    tz,
    serverNowMs,
    todayKey,
    tomorrowKey,
    greetingLabel: resolveGreeting(data.serverNowIso, tz),
    headerDateLabel: formatHeaderDate(data.serverNowIso, tz),
    activeStaff,
    staffColorIndex,
    uncollectedByBookingId,
    uncollectedTotalCents: receivables.uncollectedTotalCents,
    pendingDepositsTotalCents: receivables.pendingDepositsTotalCents,
    depositsAwaitingReviewCount: receivables.awaitingReviewCount,
    depositsMissingProofCount: receivables.missingProofCount,
    depositsAwaitingReviewCents: receivables.awaitingReviewCents,
    depositsMissingProofCents: receivables.missingProofCents,
    waitingList,
    lowStock,
    todayBookings: agenda.todayBookings,
    tomorrowBookings: agenda.tomorrowBookings,
    upcomingTodayCount: agenda.upcomingTodayCount,
    totalAttentionCount,
    cash: {
      hasTodayEntries: todayCashSummary.hasEntries,
      hasPeriodEntries: periodCashSummary.hasEntries,
      cashIncomeCents: periodCashSummary.cashCents,
      digitalIncomeCents: periodCashSummary.digitalCents,
      expensesCents: periodCashSummary.expensesCents,
      commissionsCents: periodCashSummary.commissionsCents,
      tipsCents: periodCashSummary.tipsCents,
      periodNetCashCents: periodCashSummary.netCents,
      todayNetCashCents: todayCashSummary.netCents,
      todayTipsCents: todayCashSummary.tipsCents,
    },
    periodMetrics: {
      period,
      periodLabel: formatMetricPeriodLabel(period, null, todayKey),
      compareLabel: formatMetricCompareLabel(period),
      revenueCents: periodCashSummary.collectedCents,
      prevRevenueCents: prevCashSummary.collectedCents,
      revenueDeltaPercent: previousRange
        ? computePercentDelta(periodCashSummary.collectedCents, prevCashSummary.collectedCents)
        : null,
      bookingsCount: currentBookings.length,
      confirmedCount: periodConfirmedCount,
      prevBookingsCount,
      bookingsDeltaPercent: previousRange
        ? computePercentDelta(currentBookings.length, prevBookingsCount)
        : null,
    },
    dailySeries,
    staffTodayLoad,
  };
}
