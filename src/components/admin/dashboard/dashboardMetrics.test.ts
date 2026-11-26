import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import type { AdminOverviewPayload } from '../AdminProvider';
import { buildDashboardMetrics, computePercentDelta } from './dashboardMetrics';

function buildFixturePayload(): AdminOverviewPayload {
  const db = createInitialDemoDatabase();
  const owner = db.adminUsers[0]!;
  const bookingsWithRelations = db.bookings.map((booking) => ({
    ...booking,
    service: db.services.find((s) => s.id === booking.serviceId) ?? db.services[0]!,
    extraServices: [],
    staff: db.staff.find((s) => s.id === booking.staffId) ?? db.staff[0]!,
    client: db.clients.find((c) => c.id === booking.clientId) ?? db.clients[0]!,
    addons: [],
  }));

  return {
    session: { user: owner, isDemo: true },
    integration: {
      mode: 'demo',
      supabaseConfigured: false,
      r2Configured: false,
      googleCalendarConfigured: false,
      resendConfigured: false,
      whatsappCloudConfigured: false,
      twilioSmsConfigured: false,
      stripeConfigured: false,
      mercadoPagoConfigured: false,
      appUrl: 'http://127.0.0.1:1717',
    },
    serverNowIso: '2026-11-26T17:00:00.000Z',
    serverTodayKey: '2026-11-26',
    settings: db.settings,
    kpis: {
      todayBookingsCount: 2,
      pendingConfirmationsCount: 1,
      totalRevenueCents: 150000,
      totalTipsCents: 5000,
      totalExpensesCents: 0,
      netCashCents: 150000,
      lowStockCount: 0,
      waitlistCount: 0,
      noShowRatePercent: 0,
      avgRating: 5,
      reviewsCount: 1,
    },
    onboardingChecklist: {
      completedCount: 4,
      totalCount: 4,
      steps: [],
    },
    pendingDeposits: [],
    retention: { returningClientsCount: 2, inactiveClients: [] },
    uncollectedBookings: [],
    nearRewardClients: [],
    paymentSplits: [],
    recurringBlocks: db.recurringBlocks ?? [],
    loyaltyProgram: db.loyaltyPrograms?.[0] ?? null,
    loyaltyStamps: db.loyaltyStamps ?? [],
    recentAuditLogs: [],
    bookings: bookingsWithRelations,
    services: db.services,
    categories: db.categories,
    addons: db.addons,
    staff: db.staff,
    adminUsers: db.adminUsers,
    schedules: db.schedules,
    dateOverrides: db.dateOverrides,
    calendarConnections: [],
    clients: db.clients,
    workflows: db.workflows,
    notifications: db.notifications,
    gallery: db.gallery,
    coupons: db.coupons,
    waitlist: db.waitlist,
    reviews: db.reviews,
    inventory: db.inventory,
    inventoryMovements: db.inventoryMovements,
    cashEntries: db.cashEntries,
  };
}

describe('buildDashboardMetrics', () => {
  it('always produces a 7-day series ending on today with non-negative values and bounded staff shares', () => {
    const payload = buildFixturePayload();
    for (const period of ['today', '7d', '30d'] as const) {
      const metrics = buildDashboardMetrics(payload, period);
      expect(metrics.dailySeries).toHaveLength(7);
      expect(metrics.dailySeries[6]?.dateKey).toBe('2026-11-26');
      expect(metrics.dailySeries[6]?.isToday).toBe(true);
      expect(metrics.dailySeries.filter((p) => p.isToday)).toHaveLength(1);
      for (const point of metrics.dailySeries) {
        expect(point.revenueCents).toBeGreaterThanOrEqual(0);
        expect(point.bookingsCount).toBeGreaterThanOrEqual(0);
      }
      for (const load of metrics.staffTodayLoad) {
        expect(load.sharePercent).toBeGreaterThanOrEqual(0);
        expect(load.sharePercent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('computes percent deltas safely for any non-negative current and previous totals', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (current, previous) => {
          const delta = computePercentDelta(current, previous);
          if (previous === 0 && current === 0) {
            expect(delta).toBeNull();
          } else if (previous === 0 && current > 0) {
            expect(delta).toBe(100);
          } else {
            expect(delta).not.toBeNull();
            expect(Number.isFinite(delta)).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
