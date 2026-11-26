import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
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
} from '@/lib/repositories/db';
import type { PaymentSplit } from '@/lib/types';

export const dynamic = 'force-dynamic';

function scopeByStaff<T extends { staffId: string | null }>(
  items: readonly T[],
  isSpecialist: boolean,
  ownStaffId: string | null,
): T[] {
  if (!isSpecialist) return [...items];
  return ownStaffId ? items.filter((item) => item.staffId === ownStaffId) : [];
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const repo = getRepository();
  const db = await repo.getSnapshot();
  const integration = getRuntimeIntegrationStatus();
  const isSpecialist = session.user.role === 'specialist';
  const ownStaffId = isSpecialist ? session.user.staffMemberId : null;
  const bookings =
    isSpecialist && !ownStaffId
      ? []
      : await repo.getBookingsWithRelations(session.user.role, session.user.staffMemberId);

  const now = new Date();
  const nowMs = now.getTime();
  const tz = db.settings.timezone || 'America/Mexico_City';
  const todayKey = getDateKeyInTimezone(now, tz);

  const todayBookings = bookings.filter(
    (b) =>
      getDateKeyInTimezone(new Date(b.startAt), tz) === todayKey &&
      b.status !== 'canceled',
  );
  const pendingConfirmations = bookings.filter(
    (b) => b.status === 'pending_confirmation' || b.status === 'pending_payment',
  );
  const completedCount = bookings.filter((b) => b.status === 'completed').length;
  const noShowCount = bookings.filter((b) => b.status === 'no_show').length;

  const cashEntries = scopeByStaff(db.cashEntries, isSpecialist, ownStaffId);
  const totalRevenueCents = cashEntries
    .filter((c) => c.entryType !== 'expense')
    .reduce((sum, c) => sum + c.amountCents, 0);
  const totalTipsCents = cashEntries.reduce((sum, c) => sum + c.tipCents, 0);
  const totalExpensesCents = cashEntries
    .filter((c) => c.entryType === 'expense')
    .reduce((sum, c) => sum + Math.abs(c.amountCents), 0);

  const visibleBookingIds = new Set(bookings.map((b) => b.id));
  const visibleClientIds = new Set(bookings.map((b) => b.clientId));

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
    : db.inventoryMovements.slice(0, 40);
  const scopedWaitlist = isSpecialist ? [] : db.waitlist;
  const scopedCoupons = isSpecialist ? [] : db.coupons;
  const scopedWorkflows = isSpecialist ? [] : db.workflows;
  const scopedAdminUsers = isSpecialist ? [] : db.adminUsers;
  const scopedNotifications = (
    isSpecialist
      ? db.notifications.filter((n) => visibleBookingIds.has(n.bookingId))
      : db.notifications
  ).slice(0, 60);

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
      : 5.0;

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
      label: 'Define los horarios fijos de tus especialistas',
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

  const pendingDeposits = pendingConfirmations.map((b) => ({
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
    depositAmountCents: b.depositAmountCents,
    totalPriceCents: b.totalPriceCents,
    proofDeliveryMethod: b.proofDeliveryMethod ?? (b.paymentProofUrl ? 'web_upload' : 'none'),
    paymentProofUrl: b.paymentProofUrl,
  }));

  const clientVisitStats = new Map<
    string,
    { totalVisits: number; lastPastVisitMs: number | null; hasUpcoming: boolean }
  >();
  for (const booking of bookings) {
    if (booking.status === 'canceled' || booking.status === 'no_show') continue;
    const startMs = new Date(booking.startAt).getTime();
    const stat = clientVisitStats.get(booking.clientId) ?? {
      totalVisits: 0,
      lastPastVisitMs: null,
      hasUpcoming: false,
    };
    if (booking.status === 'completed' || booking.status === 'confirmed') {
      stat.totalVisits += 1;
    }
    if (
      booking.status === 'completed' ||
      (booking.status === 'confirmed' && startMs <= nowMs)
    ) {
      if (stat.lastPastVisitMs === null || startMs > stat.lastPastVisitMs) {
        stat.lastPastVisitMs = startMs;
      }
    }
    if (
      (booking.status === 'confirmed' ||
        booking.status === 'pending_confirmation' ||
        booking.status === 'pending_payment') &&
      startMs > nowMs
    ) {
      stat.hasUpcoming = true;
    }
    clientVisitStats.set(booking.clientId, stat);
  }

  let returningClientsCount = 0;
  const inactiveClientsUnsorted = [];
  for (const [clientId, stat] of clientVisitStats.entries()) {
    if (stat.totalVisits >= 2) returningClientsCount += 1;
    if (stat.lastPastVisitMs !== null && !stat.hasUpcoming) {
      const daysSinceLastVisit = Math.floor((nowMs - stat.lastPastVisitMs) / 86_400_000);
      if (daysSinceLastVisit >= 30) {
        const client = scopedClients.find((c) => c.id === clientId);
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

  const uncollectedUnsorted = [];
  for (const b of bookings) {
    const isPastActive =
      isActiveBookingStatus(b.status) && new Date(b.endAt).getTime() < nowMs;
    if (b.status !== 'completed' && !isPastActive) continue;
    const summary = computeBookingPaymentSummary(
      b.totalPriceCents,
      splitsByBookingId.get(b.id) ?? [],
    );
    if (!summary.isUncollected) continue;
    uncollectedUnsorted.push({
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
    });
  }

  const uncollectedBookings = uncollectedUnsorted.toSorted(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
  );
  const recurringBlocks = scopeByStaff(db.recurringBlocks ?? [], isSpecialist, ownStaffId);

  const loyaltyPrograms = db.loyaltyPrograms ?? [];
  const loyaltyProgram =
    loyaltyPrograms.find((p) => p.isActive) ?? loyaltyPrograms[0] ?? null;
  const allLoyaltyStamps = db.loyaltyStamps ?? [];
  const loyaltyStamps = isSpecialist
    ? allLoyaltyStamps.filter((st) => visibleClientIds.has(st.clientId))
    : allLoyaltyStamps;

  const allNearRewardClients = await getNearRewardClientsAsync();
  const nearRewardClients = isSpecialist
    ? allNearRewardClients.filter((c) => visibleClientIds.has(c.clientId))
    : allNearRewardClients;

  const recentAuditLogs =
    session.user.role === 'owner' ? (db.auditLogs ?? []).slice(0, 50) : [];

  const whatsappMonthKey = getWhatsAppMonthKey(now, tz);
  const [whatsappUsage, whatsappTemplates] = await Promise.all([
    getWhatsAppMonthlyUsage(whatsappMonthKey),
    isSpecialist ? Promise.resolve([]) : getWhatsAppTemplates(),
  ]);

  const baseSettings = toAdminSettingsDTO(db.settings);
  const safeSettings = isSpecialist
    ? {
        ...baseSettings,
        defaultCommissionPercent: scopedStaff[0]?.commissionPercent ?? 0,
      }
    : baseSettings;

  return NextResponse.json({
    session,
    integration,
    serverNowIso: now.toISOString(),
    serverTodayKey: todayKey,
    settings: safeSettings,
    kpis: {
      todayBookingsCount: todayBookings.length,
      pendingConfirmationsCount: pendingConfirmations.length,
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
  });
}
