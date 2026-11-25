import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getBookingsWithRelations, getSnapshot } from '@/lib/repositories/db';
import { getDateKeyInTimezone } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const db = getSnapshot();
  const integration = getRuntimeIntegrationStatus();
  const bookings =
    session.user.role === 'specialist' && !session.user.staffMemberId
      ? []
      : getBookingsWithRelations(session.user.role, session.user.staffMemberId);

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

  const cashEntries =
    session.user.role === 'specialist'
      ? session.user.staffMemberId
        ? db.cashEntries.filter((c) => c.staffId === session.user.staffMemberId)
        : []
      : db.cashEntries;

  const totalRevenueCents = cashEntries
    .filter((c) => c.entryType !== 'expense')
    .reduce((sum, c) => sum + c.amountCents, 0);
  const totalTipsCents = cashEntries.reduce((sum, c) => sum + c.tipCents, 0);
  const totalExpensesCents = cashEntries
    .filter((c) => c.entryType === 'expense')
    .reduce((sum, c) => sum + Math.abs(c.amountCents), 0);

  const lowStockItems = db.inventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );
  const avgRating =
    db.reviews.length > 0
      ? Number(
          (
            db.reviews.reduce((sum, r) => sum + r.rating, 0) / db.reviews.length
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
      done: db.schedules.some((sc) => sc.rules.length > 0),
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
      done: db.bookings.length > 0,
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
  const inactiveClientsUnsorted: Array<{
    clientId: string;
    fullName: string;
    phoneE164: string;
    instagramHandle: string | null;
    lastVisitAt: string;
    daysSinceLastVisit: number;
    totalVisits: number;
  }> = [];

  for (const [clientId, stat] of clientVisitStats.entries()) {
    if (stat.totalVisits >= 2) {
      returningClientsCount += 1;
    }
    if (stat.lastPastVisitMs !== null && !stat.hasUpcoming) {
      const daysSinceLastVisit = Math.floor((nowMs - stat.lastPastVisitMs) / 86_400_000);
      if (daysSinceLastVisit >= 30) {
        const client = db.clients.find((c) => c.id === clientId);
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

  return NextResponse.json({
    session,
    integration,
    serverNowIso: now.toISOString(),
    serverTodayKey: todayKey,
    settings: db.settings,
    kpis: {
      todayBookingsCount: todayBookings.length,
      pendingConfirmationsCount: pendingConfirmations.length,
      totalRevenueCents,
      totalTipsCents,
      totalExpensesCents,
      netCashCents: totalRevenueCents - totalExpensesCents,
      lowStockCount: lowStockItems.length,
      waitlistCount: db.waitlist.filter((w) => w.status === 'waiting').length,
      noShowRatePercent:
        completedCount + noShowCount > 0
          ? Math.round((noShowCount / (completedCount + noShowCount)) * 100)
          : 0,
      avgRating,
      reviewsCount: db.reviews.length,
    },
    onboardingChecklist,
    pendingDeposits,
    retention,
    bookings,
    services: db.services,
    categories: db.categories,
    addons: db.addons,
    staff: db.staff,
    adminUsers: db.adminUsers,
    schedules: db.schedules,
    dateOverrides: db.dateOverrides,
    calendarConnections: db.calendarConnections,
    clients: db.clients,
    workflows: db.workflows,
    notifications: db.notifications.slice(0, 60),
    gallery: db.gallery,
    coupons: db.coupons,
    waitlist: db.waitlist,
    reviews: db.reviews,
    inventory: db.inventory,
    inventoryMovements: db.inventoryMovements.slice(0, 40),
    cashEntries,
  });
}
