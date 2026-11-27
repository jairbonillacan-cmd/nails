import { hasBookingProofSubmitted } from '@/lib/booking/balance';
import { getDateKeyInTimezone } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import type { BookingWithRelations, InventoryItem, StaffMember, WaitlistEntry } from '@/lib/types';
import type { AdminOverviewPayload } from '../AdminProvider';

export type DashboardPeriod = 'today' | '7d' | '30d';

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

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map((chunk) => Number.parseInt(chunk, 10));
  const dt = new Date(
    Date.UTC(parts[0] || 2026, (parts[1] || 1) - 1, (parts[2] || 1) + deltaDays, 12, 0, 0),
  );
  return dt.toISOString().slice(0, 10);
}

function shortWeekdayLabel(dateKey: string): string {
  const formatted = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00Z`));
  return capitalizeFirst(formatted.replace(/\./g, '').slice(0, 3));
}

export function computePercentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
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

export function hasPendingDepositProof(deposit: {
  proofDeliveryMethod: 'web_upload' | 'web_link' | 'instagram_dm' | 'none';
  paymentProofUrl: string | null;
}): boolean {
  return hasBookingProofSubmitted(deposit);
}

export function formatPendingDepositsBreakdown(
  awaitingReviewCount: number,
  missingProofCount: number,
): string {
  if (awaitingReviewCount > 0 && missingProofCount > 0) {
    return `${awaitingReviewCount} por revisar · ${missingProofCount} sin comprobante`;
  }
  if (awaitingReviewCount > 0) {
    return `${awaitingReviewCount} ${awaitingReviewCount === 1 ? 'comprobante' : 'comprobantes'} por revisar`;
  }
  if (missingProofCount > 0) {
    return `${missingProofCount} sin comprobante`;
  }
  return 'Todo revisado';
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
  let uncollectedTotalCents = 0;
  for (const item of data.uncollectedBookings) {
    uncollectedByBookingId.set(item.bookingId, item);
    uncollectedTotalCents += item.remainingCents;
  }

  let pendingDepositsTotalCents = 0;
  let depositsAwaitingReviewCount = 0;
  let depositsMissingProofCount = 0;
  let depositsAwaitingReviewCents = 0;
  let depositsMissingProofCents = 0;
  for (const item of data.pendingDeposits) {
    const amountCents = Math.max(0, item.depositAmountCents);
    pendingDepositsTotalCents += amountCents;
    if (hasPendingDepositProof(item)) {
      depositsAwaitingReviewCount += 1;
      depositsAwaitingReviewCents += amountCents;
    } else {
      depositsMissingProofCount += 1;
      depositsMissingProofCents += amountCents;
    }
  }

  const waitingList = data.waitlist.filter((entry) => entry.status === 'waiting');
  const lowStock = roleCanAccess(role, 'inventory')
    ? data.inventory.filter((item) => item.isActive && item.stockQuantity <= item.minStockAlert)
    : [];

  const nonCanceledBookings = data.bookings
    .filter((booking) => booking.status !== 'canceled')
    .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const bookingDateKey = (booking: BookingWithRelations) =>
    getDateKeyInTimezone(new Date(booking.startAt), tz);
  const entryDateKey = (occurredAt: string) =>
    getDateKeyInTimezone(new Date(occurredAt), tz);

  const todayBookings = nonCanceledBookings.filter((booking) => bookingDateKey(booking) === todayKey);
  const tomorrowBookings = nonCanceledBookings.filter(
    (booking) => bookingDateKey(booking) === tomorrowKey,
  );

  const upcomingTodayCount = todayBookings.filter(
    (booking) =>
      booking.status !== 'completed' &&
      booking.status !== 'no_show' &&
      new Date(booking.endAt).getTime() >= serverNowMs,
  ).length;

  const windowDays = period === 'today' ? 1 : period === '7d' ? 7 : 30;
  const currentStartKey = shiftDateKey(todayKey, -(windowDays - 1));
  const prevEndKey = shiftDateKey(currentStartKey, -1);
  const prevStartKey = shiftDateKey(prevEndKey, -(windowDays - 1));

  const todayCashEntries = data.cashEntries.filter((entry) => entryDateKey(entry.occurredAt) === todayKey);
  const periodCashEntries = data.cashEntries.filter((entry) => {
    const key = entryDateKey(entry.occurredAt);
    return key >= currentStartKey && key <= todayKey;
  });
  const hasTodayEntries = todayCashEntries.length > 0;
  const hasPeriodEntries = periodCashEntries.length > 0;

  let cashIncomeCents = 0;
  let digitalIncomeCents = 0;
  let periodExpensesCents = 0;
  let commissionsCents = 0;
  let tipsCents = 0;

  for (const entry of periodCashEntries) {
    if (entry.entryType === 'expense') {
      periodExpensesCents += Math.abs(entry.amountCents);
    } else if (entry.paymentMethod === 'cash') {
      cashIncomeCents += entry.amountCents;
    } else {
      digitalIncomeCents += entry.amountCents;
    }
    commissionsCents += entry.commissionCents;
    tipsCents += entry.tipCents;
  }

  const todayRevenueCents = todayCashEntries
    .filter((entry) => entry.entryType !== 'expense')
    .reduce((sum, entry) => sum + entry.amountCents, 0);
  const todayExpensesCents = todayCashEntries
    .filter((entry) => entry.entryType === 'expense')
    .reduce((sum, entry) => sum + Math.abs(entry.amountCents), 0);
  const todayTipsCents = todayCashEntries.reduce((sum, entry) => sum + entry.tipCents, 0);

  const sumCashRange = (startKey: string, endKey: string) =>
    data.cashEntries.reduce((sum, entry) => {
      if (entry.entryType === 'expense') return sum;
      const key = entryDateKey(entry.occurredAt);
      return key >= startKey && key <= endKey ? sum + entry.amountCents : sum;
    }, 0);

  const currentBookings = nonCanceledBookings.filter((booking) => {
    const key = bookingDateKey(booking);
    return key >= currentStartKey && key <= todayKey;
  });
  const prevBookingsCount = nonCanceledBookings.filter((booking) => {
    const key = bookingDateKey(booking);
    return key >= prevStartKey && key <= prevEndKey;
  }).length;

  const periodRevenueCents = sumCashRange(currentStartKey, todayKey);
  const prevRevenueCents = sumCashRange(prevStartKey, prevEndKey);
  const periodConfirmedCount = currentBookings.filter(
    (booking) => booking.status === 'confirmed' || booking.status === 'completed',
  ).length;

  const periodLabel =
    period === 'today' ? 'Hoy' : period === '7d' ? 'Últimos 7 días' : 'Últimos 30 días';
  const compareLabel =
    period === 'today' ? 'vs ayer' : period === '7d' ? 'vs 7 días previos' : 'vs 30 días previos';

  const dailySeries: DailySeriesPoint[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const key = shiftDateKey(todayKey, offset);
    const revenueCents = data.cashEntries.reduce((sum, entry) => {
      if (entry.entryType === 'expense') return sum;
      return entryDateKey(entry.occurredAt) === key ? sum + entry.amountCents : sum;
    }, 0);
    const bookingsCount = nonCanceledBookings.filter((booking) => bookingDateKey(booking) === key).length;
    dailySeries.push({
      dateKey: key,
      shortLabel: shortWeekdayLabel(key),
      revenueCents,
      bookingsCount,
      isToday: offset === 0,
    });
  }

  const totalTodayBookings = todayBookings.length;
  const staffTodayLoad: StaffTodayLoad[] = activeStaff.map((member) => {
    const todayCount = todayBookings.filter((booking) => booking.staffId === member.id).length;
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
    uncollectedTotalCents,
    pendingDepositsTotalCents,
    depositsAwaitingReviewCount,
    depositsMissingProofCount,
    depositsAwaitingReviewCents,
    depositsMissingProofCents,
    waitingList,
    lowStock,
    todayBookings,
    tomorrowBookings,
    upcomingTodayCount,
    totalAttentionCount,
    cash: {
      hasTodayEntries,
      hasPeriodEntries,
      cashIncomeCents,
      digitalIncomeCents,
      expensesCents: periodExpensesCents,
      commissionsCents,
      tipsCents,
      periodNetCashCents: cashIncomeCents + digitalIncomeCents - periodExpensesCents,
      todayNetCashCents: todayRevenueCents - todayExpensesCents,
      todayTipsCents,
    },
    periodMetrics: {
      period,
      periodLabel,
      compareLabel,
      revenueCents: periodRevenueCents,
      prevRevenueCents,
      revenueDeltaPercent: computePercentDelta(periodRevenueCents, prevRevenueCents),
      bookingsCount: currentBookings.length,
      confirmedCount: periodConfirmedCount,
      prevBookingsCount,
      bookingsDeltaPercent: computePercentDelta(currentBookings.length, prevBookingsCount),
    },
    dailySeries,
    staffTodayLoad,
  };
}
