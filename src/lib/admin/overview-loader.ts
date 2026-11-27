import type { AdminSession } from '@/lib/auth/admin-session';
import { isActiveBookingStatus } from '@/lib/booking/state-machine';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getDateKeyInTimezone } from '@/lib/format';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { computeBookingPaymentSummary } from '@/lib/payments/splits';
import {
  toAdminCalendarConnectionDTO,
  toAdminSettingsDTO,
} from '@/lib/public-dto';
import {
  getNearRewardClientsAsync,
  getRepository,
  getWhatsAppMonthlyUsage,
  getWhatsAppTemplates,
  getWhatsAppUnreadSummary,
  hydrateBookingsWithRelationsFromDb,
} from '@/lib/repositories/db';
import type { BookingWithRelations, ClientProfile, PaymentSplit } from '@/lib/types';
import type { AdminOverviewPayload } from './overview-types';

function scopeByStaff<T extends { staffId: string | null }>(
  items: readonly T[],
  isSpecialist: boolean,
  ownStaffId: string | null,
): T[] {
  if (!isSpecialist) return [...items];
  return ownStaffId ? items.filter((item) => item.staffId === ownStaffId) : [];
}

export async function buildAdminOverviewPayload(
  session: AdminSession,
): Promise<AdminOverviewPayload> {
  const repo = getRepository();
  const db = await repo.getSnapshot();
  const integration = getRuntimeIntegrationStatus();
  const isSpecialist = session.user.role === 'specialist';
  const ownStaffId = isSpecialist ? session.user.staffMemberId : null;
  const bookings =
    isSpecialist && !ownStaffId
      ? []
      : hydrateBookingsWithRelationsFromDb(
          db,
          session.user.role,
          session.user.staffMemberId,
        );

  const now = new Date();
  const nowMs = now.getTime();
  const tz = db.settings.timezone || 'America/Mexico_City';
  const todayKey = getDateKeyInTimezone(now, tz);

  let todayBookingsCount = 0;
  let completedCount = 0;
  let noShowCount = 0;
  const visibleBookingIds = new Set<string>();
  const visibleClientIds = new Set<string>();
  const pendingDeposits: AdminOverviewPayload['pendingDeposits'] = [];
  const clientVisitStats = new Map<
    string,
    { totalVisits: number; lastPastVisitMs: number | null; hasUpcoming: boolean }
  >();
  const uncollectedCandidates: Array<{ booking: BookingWithRelations; startMs: number }> = [];

  for (const booking of bookings) {
    visibleBookingIds.add(booking.id);
    visibleClientIds.add(booking.clientId);

    const startDate = new Date(booking.startAt);
    const startMs = startDate.getTime();
    const status = booking.status;

    if (status !== 'canceled' && getDateKeyInTimezone(startDate, tz) === todayKey) {
      todayBookingsCount += 1;
    }

    if (status === 'pending_confirmation' || status === 'pending_payment') {
      pendingDeposits.push({
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status,
        clientId: booking.clientId,
        clientName: booking.client.fullName,
        clientPhone: booking.client.phoneE164,
        clientInstagram: booking.clientInstagram ?? booking.client.instagramHandle ?? null,
        serviceName: booking.service.name,
        staffId: booking.staffId,
        staffName: booking.staff.name,
        startAt: booking.startAt,
        depositAmountCents: booking.depositAmountCents,
        totalPriceCents: booking.totalPriceCents,
        proofDeliveryMethod:
          booking.proofDeliveryMethod ?? (booking.paymentProofUrl ? 'web_upload' : 'none'),
        paymentProofUrl: booking.paymentProofUrl,
      });
    } else if (status === 'completed') {
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

    if (
      status === 'completed' ||
      (isActiveBookingStatus(status) && new Date(booking.endAt).getTime() < nowMs)
    ) {
      uncollectedCandidates.push({ booking, startMs });
    }
  }

  const cashEntries = scopeByStaff(db.cashEntries, isSpecialist, ownStaffId);
  let totalRevenueCents = 0;
  let totalTipsCents = 0;
  let totalExpensesCents = 0;
  for (const entry of cashEntries) {
    if (entry.entryType === 'expense') {
      totalExpensesCents += Math.abs(entry.amountCents);
    } else {
      totalRevenueCents += entry.amountCents;
    }
    totalTipsCents += entry.tipCents;
  }

  const scopedStaff = isSpecialist
    ? ownStaffId
      ? db.staff.filter((s) => s.id === ownStaffId)
      : []
    : db.staff;
  const scopedSchedules = scopeByStaff(db.schedules, isSpecialist, ownStaffId);
  const scopedDateOverrides = scopeByStaff(db.dateOverrides, isSpecialist, ownStaffId);
  const scopedCalendarConnections = scopeByStaff(
    db.calendarConnections,
    isSpecialist,
    ownStaffId,
  ).map(toAdminCalendarConnectionDTO);
  const scopedClients = isSpecialist
    ? db.clients.filter((c) => visibleClientIds.has(c.id))
    : db.clients;
  const scopedClientsById = new Map<string, ClientProfile>();
  for (const client of scopedClients) {
    scopedClientsById.set(client.id, client);
  }
  const scopedReviews = isSpecialist
    ? db.reviews.filter(
        (r) =>
          (ownStaffId !== null && r.staffId === ownStaffId) ||
          (r.staffId === null && visibleBookingIds.has(r.bookingId)),
      )
    : db.reviews;
  const scopedInventory = isSpecialist ? [] : db.inventory;
  const scopedInventoryMovements = isSpecialist
    ? []
    : db.inventoryMovements.slice(0, 30);
  const scopedWaitlist = isSpecialist ? [] : db.waitlist;
  const scopedCoupons = isSpecialist ? [] : db.coupons;
  const scopedWorkflows = isSpecialist ? [] : db.workflows;
  const scopedAdminUsers = isSpecialist ? [] : db.adminUsers;
  const scopedNotifications = (
    isSpecialist
      ? db.notifications.filter((n) => n.bookingId !== null && visibleBookingIds.has(n.bookingId))
      : db.notifications
  ).slice(0, 30);

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
      done: Boolean(db.settings.onboardingCompleted && db.settings.name.trim().length >= 2),
    },
    {
      id: 'services-catalog',
      label: 'Configura tus servicios, precios base y duración',
      href: '/admin/servicios',
      done: db.services.some((s) => s.isActive),
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
      href: '/admin/marca',
      done: Boolean(db.settings.depositClabe.trim() && db.settings.depositBankName.trim()),
    },
    {
      id: 'instagram-brand',
      label: 'Vincula el Instagram y estilo de tu marca',
      href: '/admin/marca',
      done: Boolean(db.settings.instagramHandle.trim()),
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

  const paymentSplits = (db.paymentSplits ?? []).filter((s) =>
    visibleBookingIds.has(s.bookingId),
  );
  const splitsByBookingId = new Map<string, PaymentSplit[]>();
  for (const split of paymentSplits) {
    const list = splitsByBookingId.get(split.bookingId) ?? [];
    list.push(split);
    splitsByBookingId.set(split.bookingId, list);
  }

  const uncollectedWithTime: Array<{
    item: AdminOverviewPayload['uncollectedBookings'][number];
    startMs: number;
  }> = [];
  for (const { booking: b, startMs } of uncollectedCandidates) {
    const summary = computeBookingPaymentSummary(
      b.totalPriceCents,
      splitsByBookingId.get(b.id) ?? [],
    );
    if (!summary.isUncollected) continue;
    uncollectedWithTime.push({
      startMs,
      item: {
        bookingId: b.id,
        bookingCode: b.bookingCode,
        status: b.status,
        clientId: b.clientId,
        clientName: b.client.fullName,
        clientPhone: b.client.phoneE164,
        clientInstagram: b.clientInstagram ?? b.client.instagramHandle ?? null,
        serviceName: b.service.name,
        staffId: b.staffId,
        staffName: b.staff.name,
        startAt: b.startAt,
        endAt: b.endAt,
        totalPriceCents: summary.totalPriceCents,
        paidCents: summary.paidCents,
        remainingCents: summary.remainingCents,
      },
    });
  }

  const uncollectedBookings = uncollectedWithTime
    .toSorted((a, b) => b.startMs - a.startMs)
    .map(({ item }) => item);
  const recurringBlocks = scopeByStaff(db.recurringBlocks ?? [], isSpecialist, ownStaffId);

  const loyaltyPrograms = db.loyaltyPrograms ?? [];
  const loyaltyProgram =
    loyaltyPrograms.find((p) => p.isActive) ?? loyaltyPrograms[0] ?? null;
  const allLoyaltyStamps = db.loyaltyStamps ?? [];
  const loyaltyStamps = isSpecialist
    ? allLoyaltyStamps.filter((st) => visibleClientIds.has(st.clientId))
    : allLoyaltyStamps;

  const allNearRewardClients = await getNearRewardClientsAsync(db);
  const nearRewardClients = isSpecialist
    ? allNearRewardClients.filter((c) => visibleClientIds.has(c.clientId))
    : allNearRewardClients;

  const recentAuditLogs =
    session.user.role === 'owner' ? (db.auditLogs ?? []).slice(0, 40) : [];

  const whatsappMonthKey = getWhatsAppMonthKey(now, tz);
  const [whatsappUsage, whatsappTemplates, whatsappInboxSummary] = await Promise.all([
    getWhatsAppMonthlyUsage(whatsappMonthKey),
    isSpecialist ? Promise.resolve([]) : getWhatsAppTemplates(),
    isSpecialist
      ? Promise.resolve(undefined)
      : getWhatsAppUnreadSummary({
          role: session.user.role,
          staffMemberId: session.user.staffMemberId,
          nowMs,
        }),
  ]);

  const baseSettings = toAdminSettingsDTO(db.settings);
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
    recurringBlocks,
    loyaltyProgram,
    loyaltyStamps,
    recentAuditLogs,
    bookings,
    services: db.services,
    categories: db.categories,
    addons: db.addons,
    staff: scopedStaff,
    adminUsers: scopedAdminUsers,
    schedules: scopedSchedules,
    dateOverrides: scopedDateOverrides,
    calendarConnections: scopedCalendarConnections,
    clients: scopedClients,
    workflows: scopedWorkflows,
    notifications: scopedNotifications,
    gallery: db.gallery,
    coupons: scopedCoupons,
    waitlist: scopedWaitlist,
    reviews: scopedReviews,
    inventory: scopedInventory,
    inventoryMovements: scopedInventoryMovements,
    cashEntries,
    whatsappUsage,
    whatsappTemplates,
    ...(whatsappInboxSummary ? { whatsappInboxSummary } : {}),
  };
}
