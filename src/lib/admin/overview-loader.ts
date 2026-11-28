import { ajustesHref } from '@/lib/admin-links';
import type { AdminSession } from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getDateKeyInTimezone } from '@/lib/format';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import {
  computeCashPeriodSummary,
  selectPendingDeposits,
  selectTodayAgenda,
  selectUncollectedBookings,
} from '@/lib/metrics';
import {
  PublicLoyaltySummarySchema,
  toAdminCalendarConnectionDTO,
  toAdminSettingsDTO,
} from '@/lib/public-dto';
import { getRepository } from '@/lib/repositories/db';
import type { ClientProfile } from '@/lib/types';
import type { AdminOverviewPayload } from './overview-types';

export async function buildAdminOverviewPayload(
  session: AdminSession,
): Promise<AdminOverviewPayload> {
  const now = new Date();
  const nowMs = now.getTime();
  const repo = getRepository();
  const data = await repo.getAdminOverviewData({
    role: session.user.role,
    staffMemberId: session.user.staffMemberId,
    nowMs,
  });
  const integration = getRuntimeIntegrationStatus();
  const isSpecialist = session.user.role === 'specialist';
  const tz = data.settings.timezone || 'America/Mexico_City';
  const todayKey = getDateKeyInTimezone(now, tz);

  const bookings = data.bookings;
  const cashEntries = data.cashEntries;
  const paymentSplits = data.paymentSplits;

  let completedCount = 0;
  let noShowCount = 0;
  const clientVisitStats = new Map<
    string,
    { totalVisits: number; lastPastVisitMs: number | null; hasUpcoming: boolean }
  >();

  const pendingDeposits = selectPendingDeposits(bookings);
  const uncollectedBookings = selectUncollectedBookings({
    bookings,
    paymentSplits,
    cashEntries,
    nowMs,
  });
  const todayAgenda = selectTodayAgenda({
    bookings,
    todayKey,
    timezone: tz,
    nowMs,
  });
  const todayBookingsCount = todayAgenda.todayCount;

  for (const booking of bookings) {
    const startMs = Date.parse(booking.startAt);
    const status = booking.status;

    if (status === 'completed') {
      completedCount += 1;
    } else if (status === 'no_show') {
      noShowCount += 1;
    }

    if (status !== 'canceled' && status !== 'no_show') {
      const stat = clientVisitStats.get(booking.clientId) ?? {
        totalVisits: 0,
        lastPastVisitMs: null,
        hasUpcoming: false,
      };
      if (status === 'completed' || status === 'confirmed') {
        stat.totalVisits += 1;
      }
      if (status === 'completed' || (status === 'confirmed' && startMs <= nowMs)) {
        if (stat.lastPastVisitMs === null || startMs > stat.lastPastVisitMs) {
          stat.lastPastVisitMs = startMs;
        }
      }
      if (
        (status === 'confirmed' ||
          status === 'pending_confirmation' ||
          status === 'pending_payment') &&
        startMs > nowMs
      ) {
        stat.hasUpcoming = true;
      }
      clientVisitStats.set(booking.clientId, stat);
    }
  }

  const cashSummary = computeCashPeriodSummary(cashEntries);
  const totalRevenueCents = cashSummary.collectedCents;
  const totalTipsCents = cashSummary.tipsCents;
  const totalExpensesCents = cashSummary.expensesCents;

  const scopedStaff = data.staff;
  const scopedSchedules = data.schedules;
  const scopedDateOverrides = data.dateOverrides;
  const scopedCalendarConnections = data.calendarConnections.map(
    toAdminCalendarConnectionDTO,
  );
  const scopedClients = data.clients;
  const scopedClientsById = new Map<string, ClientProfile>();
  for (const client of scopedClients) {
    scopedClientsById.set(client.id, client);
  }
  const scopedReviews = data.reviews;
  const scopedInventory = data.inventory;
  const scopedInventoryMovements = data.inventoryMovements;
  const scopedWaitlist = data.waitlist;
  const scopedCoupons = data.coupons;
  const scopedWorkflows = data.workflows;
  const scopedAdminUsers = data.adminUsers;
  const scopedNotifications = data.notifications;

  const lowStockItems = scopedInventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );
  const avgRating =
    scopedReviews.length > 0
      ? Number(
          (
            scopedReviews.reduce((sum, r) => sum + r.rating, 0) / scopedReviews.length
          ).toFixed(1),
        )
      : 0;

  const checklistSteps = [
    {
      id: 'salon-profile',
      label: 'Completa el asistente inicial del estudio',
      href: '/admin/onboarding',
      done: Boolean(
        data.settings.onboardingCompleted && data.settings.name.trim().length >= 2,
      ),
    },
    {
      id: 'services-catalog',
      label: 'Configura tus servicios, precios base y duración',
      href: '/admin/servicios',
      done: data.services.some((s) => s.isActive),
    },
    {
      id: 'staff-schedules',
      label: 'Define los horarios fijos de tus profesionales',
      href: '/admin/disponibilidad',
      done: scopedSchedules.some((sc) => sc.rules.length > 0),
    },
    {
      id: 'deposit-bank',
      label: 'Configura banco y CLABE para anticipo SPEI',
      href: ajustesHref({ tab: 'cobro', focus: 'clabe' }),
      done: Boolean(
        data.settings.depositClabe.trim() && data.settings.depositBankName.trim(),
      ),
    },
    {
      id: 'instagram-brand',
      label: 'Vincula el Instagram y estilo de tu marca',
      href: '/admin/marca',
      done: Boolean(data.settings.instagramHandle.trim()),
    },
    {
      id: 'first-booking',
      label: 'Registra o recibe tu primera cita en agenda',
      href: '/admin/citas',
      done: bookings.length > 0,
    },
  ];

  const onboardingChecklist = {
    completedCount: checklistSteps.filter((s) => s.done).length,
    totalCount: checklistSteps.length,
    steps: checklistSteps,
  };

  let returningClientsCount = 0;
  const inactiveClientsUnsorted = [];
  for (const [clientId, stat] of clientVisitStats.entries()) {
    if (stat.totalVisits >= 2) returningClientsCount += 1;
    if (stat.lastPastVisitMs !== null && !stat.hasUpcoming) {
      const daysSinceLastVisit = Math.floor((nowMs - stat.lastPastVisitMs) / 86_400_000);
      if (daysSinceLastVisit >= 30) {
        const client = scopedClientsById.get(clientId);
        if (client) {
          inactiveClientsUnsorted.push({
            clientId: client.id,
            fullName: client.fullName,
            phoneE164: client.phoneE164,
            instagramHandle: client.instagramHandle ?? null,
            lastVisitAt: new Date(stat.lastPastVisitMs).toISOString(),
            daysSinceLastVisit,
            totalVisits: stat.totalVisits,
          });
        }
      }
    }
  }

  const retention = {
    returningClientsCount,
    inactiveClients: inactiveClientsUnsorted.toSorted(
      (a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit,
    ),
  };

  const activeLoyaltyProgram = data.loyaltyPrograms.find((p) => p.isActive) ?? null;
  const loyaltyProgram = activeLoyaltyProgram ?? data.loyaltyPrograms[0] ?? null;
  const loyaltyStamps = data.loyaltyStamps;

  let nearRewardClients: AdminOverviewPayload['nearRewardClients'] = [];
  if (activeLoyaltyProgram) {
    const rewardServiceName = activeLoyaltyProgram.rewardServiceId
      ? data.services.find((s) => s.id === activeLoyaltyProgram.rewardServiceId)?.name ??
        null
      : null;
    const collected: AdminOverviewPayload['nearRewardClients'] = [];
    for (const client of scopedClients) {
      const summary = PublicLoyaltySummarySchema.parse(
        computeClientLoyaltySummary(
          activeLoyaltyProgram,
          loyaltyStamps,
          client.id,
          rewardServiceName,
        ),
      );
      if (summary.isNearReward || summary.isRewardReady) {
        collected.push({
          clientId: client.id,
          fullName: client.fullName,
          phoneE164: client.phoneE164,
          instagramHandle: client.instagramHandle ?? null,
          summary,
        });
      }
    }
    nearRewardClients = collected.toSorted((a, b) => {
      const diff = a.summary.remainingForReward - b.summary.remainingForReward;
      return diff !== 0 ? diff : b.summary.currentStamps - a.summary.currentStamps;
    });
  }

  const baseSettings = toAdminSettingsDTO(data.settings);
  const safeSettings = isSpecialist
    ? {
        ...baseSettings,
        defaultCommissionPercent: scopedStaff[0]?.commissionPercent ?? 0,
      }
    : baseSettings;

  return {
    session,
    integration,
    serverNowIso: now.toISOString(),
    serverTodayKey: todayKey,
    settings: safeSettings,
    kpis: {
      todayBookingsCount,
      pendingConfirmationsCount: pendingDeposits.length,
      totalRevenueCents,
      totalTipsCents,
      totalExpensesCents,
      netCashCents: totalRevenueCents - totalExpensesCents,
      lowStockCount: lowStockItems.length,
      waitlistCount: scopedWaitlist.filter((w) => w.status === 'waiting').length,
      noShowRatePercent:
        completedCount + noShowCount > 0
          ? Math.round((noShowCount / (completedCount + noShowCount)) * 100)
          : 0,
      avgRating,
      reviewsCount: scopedReviews.length,
    },
    onboardingChecklist,
    pendingDeposits,
    retention,
    uncollectedBookings,
    nearRewardClients,
    paymentSplits,
    recurringBlocks: data.recurringBlocks,
    loyaltyProgram,
    loyaltyStamps,
    recentAuditLogs: data.recentAuditLogs,
    bookings,
    services: data.services,
    categories: data.categories,
    addons: data.addons,
    staff: scopedStaff,
    adminUsers: scopedAdminUsers,
    schedules: scopedSchedules,
    dateOverrides: scopedDateOverrides,
    calendarConnections: scopedCalendarConnections,
    clients: scopedClients,
    workflows: scopedWorkflows,
    notifications: scopedNotifications,
    gallery: data.gallery,
    coupons: scopedCoupons,
    waitlist: scopedWaitlist,
    reviews: scopedReviews,
    inventory: scopedInventory,
    inventoryMovements: scopedInventoryMovements,
    cashEntries,
    whatsappUsage: data.whatsappUsage,
    whatsappTemplates: data.whatsappTemplates,
    ...(data.whatsappInboxSummary
      ? { whatsappInboxSummary: data.whatsappInboxSummary }
      : {}),
  };
}
