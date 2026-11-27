import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import type { AdminOverviewPayload } from '../AdminProvider';
import {
  buildDashboardMetrics,
  computePercentDelta,
  formatPendingDepositsBreakdown,
} from './dashboardMetrics';

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
      whatsappCoexistenceEnabled: false,
      whatsappWebhookConfigured: false,
      whatsappBusinessAccountConfigured: false,
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
    for (const period of ['today', '7d', 'month', 'last_month'] as const) {
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

  it('never falls back silently to historical cash entries when today has zero entries', () => {
    const payload = buildFixturePayload();
    payload.serverNowIso = '2026-12-20T18:00:00.000Z';
    payload.serverTodayKey = '2026-12-20';
    payload.cashEntries = [
      {
        id: 'old-cash-1',
        bookingId: null,
        staffId: payload.staff[0]?.id ?? null,
        entryType: 'service_income',
        description: 'Cobro histórico',
        amountCents: 95000,
        tipCents: 10000,
        commissionCents: 38000,
        paymentMethod: 'cash',
        occurredAt: '2026-10-01T18:00:00.000Z',
        recordedBy: 'Dueña',
      },
    ];

    const todayMetrics = buildDashboardMetrics(payload, 'today');
    expect(todayMetrics.cash.hasTodayEntries).toBe(false);
    expect(todayMetrics.cash.hasPeriodEntries).toBe(false);
    expect(todayMetrics.cash.cashIncomeCents).toBe(0);
    expect(todayMetrics.cash.digitalIncomeCents).toBe(0);
    expect(todayMetrics.cash.commissionsCents).toBe(0);
    expect(todayMetrics.cash.tipsCents).toBe(0);
    expect(todayMetrics.cash.periodNetCashCents).toBe(0);
    expect(todayMetrics.periodMetrics.revenueCents).toBe(0);

    const sevenDayMetrics = buildDashboardMetrics(payload, '7d');
    expect(sevenDayMetrics.periodMetrics.periodLabel).toBe('Últimos 7 días');
    expect(sevenDayMetrics.cash.periodNetCashCents).toBe(0);
  });

  it('separates pending deposits awaiting review from deposits missing proof', () => {
    const payload = buildFixturePayload();
    payload.pendingDeposits = [
      {
        bookingId: 'bk-proof-1',
        bookingCode: 'NL-9001',
        status: 'pending_confirmation',
        clientId: 'cl-1',
        clientName: 'Andrea',
        clientPhone: '+522221111111',
        clientInstagram: null,
        serviceName: 'Rubber',
        staffId: 'st-1',
        staffName: 'Karla',
        startAt: '2026-11-28T16:00:00.000Z',
        depositAmountCents: 20000,
        totalPriceCents: 46000,
        proofDeliveryMethod: 'web_upload',
        paymentProofUrl: '/api/media/proofs/test.png',
      },
      {
        bookingId: 'bk-missing-1',
        bookingCode: 'NL-9002',
        status: 'pending_confirmation',
        clientId: 'cl-2',
        clientName: 'Sofía',
        clientPhone: '+522222222222',
        clientInstagram: null,
        serviceName: 'Gel',
        staffId: 'st-1',
        staffName: 'Karla',
        startAt: '2026-11-28T18:00:00.000Z',
        depositAmountCents: 20000,
        totalPriceCents: 35000,
        proofDeliveryMethod: 'none',
        paymentProofUrl: null,
      },
      {
        bookingId: 'bk-missing-2',
        bookingCode: 'NL-9003',
        status: 'pending_payment',
        clientId: 'cl-3',
        clientName: 'Valeria',
        clientPhone: '+522223333333',
        clientInstagram: null,
        serviceName: 'Acrílico',
        staffId: 'st-1',
        staffName: 'Karla',
        startAt: '2026-11-29T16:00:00.000Z',
        depositAmountCents: 20000,
        totalPriceCents: 50000,
        proofDeliveryMethod: 'none',
        paymentProofUrl: null,
      },
    ];

    const metrics = buildDashboardMetrics(payload, '7d');
    expect(metrics.depositsAwaitingReviewCount).toBe(1);
    expect(metrics.depositsMissingProofCount).toBe(2);
    expect(metrics.depositsAwaitingReviewCents).toBe(20000);
    expect(metrics.depositsMissingProofCents).toBe(40000);
    expect(metrics.pendingDepositsTotalCents).toBe(60000);
    expect(
      formatPendingDepositsBreakdown(
        metrics.depositsAwaitingReviewCount,
        metrics.depositsMissingProofCount,
      ),
    ).toBe('1 por revisar · 2 sin comprobante');
    expect(formatPendingDepositsBreakdown(2, 0)).toBe('2 comprobantes por revisar');
    expect(formatPendingDepositsBreakdown(0, 3)).toBe('3 sin comprobante');
    expect(formatPendingDepositsBreakdown(0, 0)).toBe('Todo revisado');
  });
});
