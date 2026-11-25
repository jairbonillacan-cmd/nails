import { getDateKeyInTimezone } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import type { BookingWithRelations, InventoryItem, StaffMember, WaitlistEntry } from '@/lib/types';
import type { AdminOverviewPayload } from '../AdminProvider';

type UncollectedBookingItem = AdminOverviewPayload['uncollectedBookings'][number];

interface DashboardCashMetrics {
  hasTodayEntries: boolean;
  cashIncomeCents: number;
  digitalIncomeCents: number;
  commissionsCents: number;
  tipsCents: number;
  todayNetCashCents: number;
  todayTipsCents: number;
}

export interface DashboardMetrics {
  tz: string;
  serverNowMs: number;
  todayKey: string;
  tomorrowKey: string;
  headerDateLabel: string;
  activeStaff: StaffMember[];
  staffColorIndex: Map<string, number>;
  uncollectedByBookingId: Map<string, UncollectedBookingItem>;
  uncollectedTotalCents: number;
  waitingList: WaitlistEntry[];
  lowStock: InventoryItem[];
  todayBookings: BookingWithRelations[];
  tomorrowBookings: BookingWithRelations[];
  upcomingTodayCount: number;
  totalAttentionCount: number;
  cash: DashboardCashMetrics;
}

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

export function buildDashboardMetrics(data: AdminOverviewPayload): DashboardMetrics {
  const tz = data.settings.timezone || 'America/Mexico_City';
  const serverNowDate = new Date(data.serverNowIso);
  const serverNowMs = serverNowDate.getTime();
  const todayKey = data.serverTodayKey || getDateKeyInTimezone(serverNowDate, tz);
  const tomorrowKey = getDateKeyInTimezone(new Date(serverNowMs + 86_400_000), tz);
  const role = data.session.user.role;

  const activeStaff = data.staff.filter((member) => member.isActive);
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

  const waitingList = data.waitlist.filter((entry) => entry.status === 'waiting');
  const lowStock = roleCanAccess(role, 'inventory')
    ? data.inventory.filter((item) => item.isActive && item.stockQuantity <= item.minStockAlert)
    : [];

  const nonCanceledBookings = data.bookings
    .filter((booking) => booking.status !== 'canceled')
    .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const todayBookings = nonCanceledBookings.filter(
    (booking) => getDateKeyInTimezone(new Date(booking.startAt), tz) === todayKey,
  );
  const tomorrowBookings = nonCanceledBookings.filter(
    (booking) => getDateKeyInTimezone(new Date(booking.startAt), tz) === tomorrowKey,
  );

  const upcomingTodayCount = todayBookings.filter(
    (booking) =>
      booking.status !== 'completed' &&
      booking.status !== 'no_show' &&
      new Date(booking.endAt).getTime() >= serverNowMs,
  ).length;

  const todayCashEntries = data.cashEntries.filter(
    (entry) => getDateKeyInTimezone(new Date(entry.occurredAt), tz) === todayKey,
  );
  const hasTodayEntries = todayCashEntries.length > 0;
  const activeCashEntries = hasTodayEntries ? todayCashEntries : data.cashEntries;

  let cashIncomeCents = 0;
  let digitalIncomeCents = 0;
  let commissionsCents = 0;
  let tipsCents = 0;

  for (const entry of activeCashEntries) {
    if (entry.entryType !== 'expense') {
      if (entry.paymentMethod === 'cash') {
        cashIncomeCents += entry.amountCents;
      } else {
        digitalIncomeCents += entry.amountCents;
      }
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
    headerDateLabel: formatHeaderDate(data.serverNowIso, tz),
    activeStaff,
    staffColorIndex,
    uncollectedByBookingId,
    uncollectedTotalCents,
    waitingList,
    lowStock,
    todayBookings,
    tomorrowBookings,
    upcomingTodayCount,
    totalAttentionCount,
    cash: {
      hasTodayEntries,
      cashIncomeCents,
      digitalIncomeCents,
      commissionsCents,
      tipsCents,
      todayNetCashCents: todayRevenueCents - todayExpensesCents,
      todayTipsCents,
    },
  };
}
