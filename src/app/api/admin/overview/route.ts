import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getBookingsWithRelations, getSnapshot } from '@/lib/repositories/db';
import { getDateKeyInTimezone } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const db = getSnapshot();
  const integration = getRuntimeIntegrationStatus();
  const bookings = getBookingsWithRelations(
    session.user.role,
    session.user.staffMemberId,
  );

  const now = new Date();
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
    session.user.role === 'specialist' && session.user.staffMemberId
      ? db.cashEntries.filter((c) => c.staffId === session.user.staffMemberId)
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
