import { agendaHref } from '@/lib/admin-links';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { BookingWithRelations, ClientProfile } from '@/lib/types';
import type { ClientNoShowStats } from './clientasActions';
import type { ClientPackageRow } from './clientasTypes';
import { parseNailTechNotes, type NailTechProfile } from './nailTechProfile';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

export type ClientDirectoryFilter =
  | 'all'
  | 'vip'
  | 'package'
  | 'near_reward'
  | 'birthday'
  | 'alerts';

export type ClientDirectorySort = 'alpha' | 'visits' | 'spent' | 'last_visit';

export interface EnrichedClientMetrics {
  clientId: string;
  totalSpentCents: number;
  completedVisits: number;
  nonCanceledVisits: number;
  avgTicketCents: number;
  usualStaffId: string | null;
  usualStaffName: string | null;
  lastVisitAt: string | null;
  lastServiceName: string | null;
  activePackageSessions: number;
  hasActivePackage: boolean;
  isNearReward: boolean;
  isRewardReady: boolean;
  hasBirthdayThisMonth: boolean;
  effectiveNoShows: number;
  hasNoShowAlert: boolean;
  hasTechAlert: boolean;
  hasAnyAlert: boolean;
  isVip: boolean;
  daysSinceLastVisit: number | null;
  isInactive: boolean;
  techProfile: NailTechProfile;
  freeNotes: string;
}

export interface ClientDirectoryKpis {
  totalClients: number;
  vipClients: number;
  packageOrRewardClients: number;
  alertOrInactiveClients: number;
}

const VIP_MIN_COMPLETED_VISITS = 3;
const VIP_MIN_SPENT_CENTS = 150_000;
const DEFAULT_INACTIVE_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveUsualStaff(
  bookings: readonly BookingWithRelations[],
): { staffId: string; staffName: string } | null {
  const active = bookings.filter((b) => b.status !== 'canceled' && b.status !== 'no_show');
  const pool = active.length > 0 ? active : bookings.filter((b) => b.status !== 'canceled');
  if (pool.length === 0) return null;

  const stats = new Map<
    string,
    { staffId: string; staffName: string; count: number; latestMs: number }
  >();
  for (const booking of pool) {
    const startMs = Date.parse(booking.startAt);
    const safeMs = Number.isFinite(startMs) ? startMs : 0;
    const prev = stats.get(booking.staffId);
    if (!prev) {
      stats.set(booking.staffId, {
        staffId: booking.staffId,
        staffName: booking.staff.name,
        count: 1,
        latestMs: safeMs,
      });
    } else {
      prev.count += 1;
      if (safeMs > prev.latestMs) {
        prev.latestMs = safeMs;
        prev.staffName = booking.staff.name;
      }
    }
  }

  let best: { staffId: string; staffName: string; count: number; latestMs: number } | null = null;
  for (const entry of stats.values()) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.latestMs > best.latestMs) ||
      (entry.count === best.count &&
        entry.latestMs === best.latestMs &&
        entry.staffId.localeCompare(best.staffId) < 0)
    ) {
      best = entry;
    }
  }
  return best ? { staffId: best.staffId, staffName: best.staffName } : null;
}

export function computeSingleClientMetrics(params: {
  client: ClientProfile;
  bookings: readonly BookingWithRelations[];
  clientPackages: readonly ClientPackageRow[];
  loyalty: LoyaltySummary | null;
  noShowStats: ClientNoShowStats | null;
  noShowThreshold: number;
  currentMonth: string;
  nowMs?: number;
  inactiveDaysThreshold?: number;
}): EnrichedClientMetrics {
  const {
    client,
    bookings,
    clientPackages,
    loyalty,
    noShowStats,
    noShowThreshold,
    currentMonth,
    nowMs = Date.now(),
    inactiveDaysThreshold = DEFAULT_INACTIVE_DAYS,
  } = params;

  let totalSpentCents = 0;
  let completedVisits = 0;
  let nonCanceledVisits = 0;
  let bookingNoShows = 0;
  let lastVisitMs = -Infinity;
  let lastVisitAt: string | null = null;
  let lastServiceName: string | null = null;

  for (const booking of bookings) {
    if (booking.status === 'canceled') continue;
    nonCanceledVisits += 1;

    if (booking.status === 'no_show') {
      bookingNoShows += 1;
      continue;
    }

    if (booking.status === 'completed') {
      completedVisits += 1;
      totalSpentCents += Math.max(0, booking.totalPriceCents);
    }

    const startMs = Date.parse(booking.startAt);
    if (
      Number.isFinite(startMs) &&
      (booking.status === 'completed' || startMs <= nowMs) &&
      startMs > lastVisitMs
    ) {
      lastVisitMs = startMs;
      lastVisitAt = booking.startAt;
      lastServiceName = booking.service.name;
    }
  }

  const avgTicketCents =
    completedVisits > 0 ? Math.round(totalSpentCents / completedVisits) : 0;
  const usualStaff = resolveUsualStaff(bookings);

  let activePackageSessions = 0;
  for (const pkg of clientPackages) {
    if (pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0) {
      activePackageSessions += pkg.remainingSessions;
    }
  }

  const isRewardReady = Boolean(loyalty?.isRewardReady);
  const isNearReward = Boolean(
    loyalty &&
      (loyalty.isRewardReady ||
        (loyalty.remainingForReward > 0 &&
          loyalty.remainingForReward <= 2 &&
          loyalty.currentStamps > 0)),
  );
  const hasBirthdayThisMonth = Boolean(
    currentMonth && client.birthday && client.birthday.slice(5, 7) === currentMonth,
  );
  const effectiveNoShows =
    noShowStats?.noShowCount ?? Math.max(client.noShowCount, bookingNoShows);
  const safeThreshold = Math.max(1, noShowThreshold);
  const hasNoShowAlert = effectiveNoShows >= safeThreshold;

  const { profile: techProfile, freeNotes } = parseNailTechNotes(client.notes);
  const hasTechAlert = techProfile.alerts.length > 0;
  const hasAnyAlert = hasNoShowAlert || hasTechAlert;
  const isVip =
    completedVisits >= VIP_MIN_COMPLETED_VISITS || totalSpentCents >= VIP_MIN_SPENT_CENTS;

  const daysSinceLastVisit =
    lastVisitAt !== null && Number.isFinite(lastVisitMs)
      ? Math.max(0, Math.floor((nowMs - lastVisitMs) / MS_PER_DAY))
      : null;
  const isInactive =
    daysSinceLastVisit !== null && daysSinceLastVisit >= Math.max(1, inactiveDaysThreshold);

  return {
    clientId: client.id,
    totalSpentCents,
    completedVisits,
    nonCanceledVisits,
    avgTicketCents,
    usualStaffId: usualStaff?.staffId ?? null,
    usualStaffName: usualStaff?.staffName ?? null,
    lastVisitAt,
    lastServiceName,
    activePackageSessions,
    hasActivePackage: activePackageSessions > 0,
    isNearReward,
    isRewardReady,
    hasBirthdayThisMonth,
    effectiveNoShows,
    hasNoShowAlert,
    hasTechAlert,
    hasAnyAlert,
    isVip,
    daysSinceLastVisit,
    isInactive,
    techProfile,
    freeNotes,
  };
}

export function computeClientMetricsMap(params: {
  clients: readonly ClientProfile[];
  bookings: readonly BookingWithRelations[];
  clientPackagesByClientId: ReadonlyMap<string, readonly ClientPackageRow[]>;
  loyaltyByClientId: ReadonlyMap<string, LoyaltySummary>;
  noShowStatsByClient: ReadonlyMap<string, ClientNoShowStats>;
  noShowThreshold: number;
  currentMonth: string;
  nowMs?: number;
  inactiveDaysThreshold?: number;
}): Map<string, EnrichedClientMetrics> {
  const bookingsByClient = new Map<string, BookingWithRelations[]>();
  for (const booking of params.bookings) {
    const list = bookingsByClient.get(booking.clientId);
    if (list) list.push(booking);
    else bookingsByClient.set(booking.clientId, [booking]);
  }

  const result = new Map<string, EnrichedClientMetrics>();
  for (const client of params.clients) {
    result.set(
      client.id,
      computeSingleClientMetrics({
        client,
        bookings: bookingsByClient.get(client.id) ?? [],
        clientPackages: params.clientPackagesByClientId.get(client.id) ?? [],
        loyalty: params.loyaltyByClientId.get(client.id) ?? null,
        noShowStats: params.noShowStatsByClient.get(client.id) ?? null,
        noShowThreshold: params.noShowThreshold,
        currentMonth: params.currentMonth,
        nowMs: params.nowMs,
        inactiveDaysThreshold: params.inactiveDaysThreshold,
      }),
    );
  }
  return result;
}

export function computeClientDirectoryKpis(
  clients: readonly ClientProfile[],
  metricsByClientId: ReadonlyMap<string, EnrichedClientMetrics>,
): ClientDirectoryKpis {
  let vipClients = 0;
  let packageOrRewardClients = 0;
  let alertOrInactiveClients = 0;

  for (const client of clients) {
    const metrics = metricsByClientId.get(client.id);
    if (!metrics) continue;
    if (metrics.isVip) vipClients += 1;
    if (metrics.hasActivePackage || metrics.isNearReward || metrics.isRewardReady) {
      packageOrRewardClients += 1;
    }
    if (metrics.hasAnyAlert || metrics.isInactive) {
      alertOrInactiveClients += 1;
    }
  }

  return {
    totalClients: clients.length,
    vipClients,
    packageOrRewardClients,
    alertOrInactiveClients,
  };
}

function matchesDirectoryFilter(
  filter: ClientDirectoryFilter,
  metrics: EnrichedClientMetrics | undefined,
): boolean {
  if (filter === 'all') return true;
  if (!metrics) return false;
  if (filter === 'vip') return metrics.isVip;
  if (filter === 'package') return metrics.hasActivePackage;
  if (filter === 'near_reward') return metrics.isNearReward || metrics.isRewardReady;
  if (filter === 'birthday') return metrics.hasBirthdayThisMonth;
  return metrics.hasAnyAlert;
}

export function filterAndSortClients(params: {
  clients: readonly ClientProfile[];
  metricsByClientId: ReadonlyMap<string, EnrichedClientMetrics>;
  query: string;
  filter: ClientDirectoryFilter;
  sort: ClientDirectorySort;
}): ClientProfile[] {
  const { clients, metricsByClientId, query, filter, sort } = params;
  const trimmed = query.trim();
  const normalizedQuery = normalizeSearchText(trimmed);
  const queryDigits = trimmed.replace(/\D/g, '');

  const filtered = clients.filter((client) => {
    const metrics = metricsByClientId.get(client.id);
    if (!matchesDirectoryFilter(filter, metrics)) return false;
    if (!normalizedQuery) return true;

    const phoneDigits = client.phoneE164.replace(/\D/g, '');
    if (queryDigits.length >= 4 && phoneDigits.includes(queryDigits)) return true;

    const searchable = [
      client.fullName,
      client.phoneE164,
      client.email ?? '',
      client.instagramHandle ?? '',
      client.notes,
      metrics?.usualStaffName ?? '',
      metrics?.lastServiceName ?? '',
    ];
    return searchable.some((field) => normalizeSearchText(field).includes(normalizedQuery));
  });

  const compareAlpha = (a: ClientProfile, b: ClientProfile) =>
    a.fullName.localeCompare(b.fullName, 'es');

  if (sort === 'alpha') {
    return filtered.toSorted(compareAlpha);
  }

  if (sort === 'visits') {
    return filtered.toSorted((a, b) => {
      const ma = metricsByClientId.get(a.id);
      const mb = metricsByClientId.get(b.id);
      const completedDiff = (mb?.completedVisits ?? 0) - (ma?.completedVisits ?? 0);
      if (completedDiff !== 0) return completedDiff;
      const nonCanceledDiff = (mb?.nonCanceledVisits ?? 0) - (ma?.nonCanceledVisits ?? 0);
      if (nonCanceledDiff !== 0) return nonCanceledDiff;
      return compareAlpha(a, b);
    });
  }

  if (sort === 'spent') {
    return filtered.toSorted((a, b) => {
      const ma = metricsByClientId.get(a.id);
      const mb = metricsByClientId.get(b.id);
      const spentDiff = (mb?.totalSpentCents ?? 0) - (ma?.totalSpentCents ?? 0);
      if (spentDiff !== 0) return spentDiff;
      const visitsDiff = (mb?.completedVisits ?? 0) - (ma?.completedVisits ?? 0);
      if (visitsDiff !== 0) return visitsDiff;
      return compareAlpha(a, b);
    });
  }

  return filtered.toSorted((a, b) => {
    const ma = metricsByClientId.get(a.id);
    const mb = metricsByClientId.get(b.id);
    const aMs = ma?.lastVisitAt ? Date.parse(ma.lastVisitAt) : -Infinity;
    const bMs = mb?.lastVisitAt ? Date.parse(mb.lastVisitAt) : -Infinity;
    if (bMs !== aMs) return bMs - aMs;
    return compareAlpha(a, b);
  });
}

export function buildClientNewBookingUrl(params: {
  fullName: string;
  phoneE164: string;
  usualStaffId?: string | null;
  instagramHandle?: string | null;
}): string {
  return agendaHref({
    new: true,
    clientName: params.fullName.trim() || undefined,
    clientPhone: params.phoneE164.trim() || undefined,
    staffId: params.usualStaffId || undefined,
    clientInstagram: params.instagramHandle?.trim() || undefined,
  });
}
