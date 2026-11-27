import { describe, expect, it } from 'vitest';
import type { CashRegisterEntry, PaymentSplit, StaffMember } from '../types';
import {
  buildActionQueueItems,
  computeCashDrawer,
  computeCashPeriodSummary,
  computeCashReconciliation,
  computeCommissionsByStaff,
  computeEntryCommissionCents,
  computePercentDelta,
  formatMetricCompareLabel,
  formatMetricPeriodLabel,
  formatPendingDepositsBreakdown,
  isIsoInMetricPeriod,
  isIsoInMetricRange,
  previewStaffCommission,
  resolveMetricPeriodRange,
  resolvePreviousMetricPeriodRange,
  selectPendingDepositsBreakdown,
  selectReceivablesSummary,
  selectTodayAgenda,
} from './index';

const TZ = 'America/Mexico_City';

function makeCashEntry(overrides: Partial<CashRegisterEntry> = {}): CashRegisterEntry {
  return {
    id: 'cash-1',
    bookingId: null,
    staffId: 'staff-karla',
    entryType: 'service_income',
    description: 'Rubber — Sofía',
    amountCents: 35000,
    tipCents: 5000,
    commissionCents: 14000,
    paymentMethod: 'cash',
    occurredAt: '2026-11-27T18:00:00.000Z',
    recordedBy: 'Dueña',
    ...overrides,
  };
}

function makeStaff(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: 'staff-karla',
    name: 'Karla',
    roleTitle: 'Nail Artist',
    bio: '',
    avatarUrl: null,
    bookingSlug: 'karla',
    commissionPercent: 40,
    isActive: true,
    displayOrder: 0,
    serviceIds: [],
    ...overrides,
  };
}

describe('Unified Metrics Engine (src/lib/metrics/)', () => {
  it('resolves unified period date ranges, previous ranges, and labels identically across modules', () => {
    expect(resolveMetricPeriodRange('2026-11-27', 'today')).toEqual({
      startKey: '2026-11-27',
      endKey: '2026-11-27',
    });
    expect(resolveMetricPeriodRange('2026-11-27', '7d')).toEqual({
      startKey: '2026-11-21',
      endKey: '2026-11-27',
    });
    expect(resolveMetricPeriodRange('2026-11-27', 'month')).toEqual({
      startKey: '2026-11-01',
      endKey: '2026-11-27',
    });
    expect(resolveMetricPeriodRange('2026-11-27', 'last_month')).toEqual({
      startKey: '2026-10-01',
      endKey: '2026-10-31',
    });
    expect(resolveMetricPeriodRange('2026-11-27', '30d')).toEqual({
      startKey: '2026-10-29',
      endKey: '2026-11-27',
    });
    expect(resolveMetricPeriodRange('2026-11-27', '90d')).toEqual({
      startKey: '2026-08-30',
      endKey: '2026-11-27',
    });
    expect(
      resolveMetricPeriodRange('2026-11-27', 'custom', {
        fromKey: '2026-11-20',
        toKey: '2026-11-10',
      }),
    ).toEqual({
      startKey: '2026-11-10',
      endKey: '2026-11-20',
    });
    expect(resolveMetricPeriodRange('2026-11-27', 'all')).toEqual({
      startKey: null,
      endKey: null,
    });

    expect(resolvePreviousMetricPeriodRange('2026-11-27', 'today')).toEqual({
      startKey: '2026-11-26',
      endKey: '2026-11-26',
    });
    expect(resolvePreviousMetricPeriodRange('2026-11-27', '7d')).toEqual({
      startKey: '2026-11-14',
      endKey: '2026-11-20',
    });
    expect(resolvePreviousMetricPeriodRange('2026-11-27', 'month')).toEqual({
      startKey: '2026-10-01',
      endKey: '2026-10-31',
    });
    expect(resolvePreviousMetricPeriodRange('2026-11-27', 'last_month')).toEqual({
      startKey: '2026-09-01',
      endKey: '2026-09-30',
    });
    expect(resolvePreviousMetricPeriodRange('2026-11-27', 'all')).toBeNull();

    expect(formatMetricPeriodLabel('today')).toBe('Hoy');
    expect(formatMetricPeriodLabel('7d')).toBe('Últimos 7 días');
    expect(formatMetricPeriodLabel('month')).toBe('Este mes');
    expect(formatMetricPeriodLabel('last_month')).toBe('Mes pasado');
    expect(formatMetricPeriodLabel('all')).toBe('Histórico');
    expect(formatMetricCompareLabel('7d')).toBe('vs 7 días previos');
    expect(formatMetricCompareLabel('month')).toBe('vs mes pasado');

    expect(isIsoInMetricPeriod('2026-11-27T18:00:00.000Z', '2026-11-27', TZ, 'today')).toBe(
      true,
    );
    expect(isIsoInMetricRange('2026-11-20T18:00:00.000Z', { startKey: '2026-11-21', endKey: '2026-11-27' }, TZ)).toBe(
      false,
    );
  });

  it('computes cash summary, commissions by staff, drawer breakdown, and reconciliation accurately', () => {
    const serviceEntry = makeCashEntry({
      id: 'c1',
      amountCents: 35000,
      tipCents: 5000,
      paymentMethod: 'cash',
    });
    const productEntry = makeCashEntry({
      id: 'c2',
      entryType: 'product_sale',
      amountCents: 24000,
      tipCents: 0,
      commissionCents: 2400,
      paymentMethod: 'transfer',
    });
    const depositEntry = makeCashEntry({
      id: 'c3',
      entryType: 'deposit',
      amountCents: 20000,
      tipCents: 0,
      commissionCents: 0,
      paymentMethod: 'card',
    });
    const expenseEntry = makeCashEntry({
      id: 'c4',
      entryType: 'expense',
      amountCents: 10000,
      tipCents: 0,
      commissionCents: 0,
      paymentMethod: 'cash',
    });
    const entries: CashRegisterEntry[] = [
      serviceEntry,
      productEntry,
      depositEntry,
      expenseEntry,
    ];

    const summary = computeCashPeriodSummary(entries);
    expect(summary.hasEntries).toBe(true);
    expect(summary.collectedCents).toBe(79000);
    expect(summary.expensesCents).toBe(10000);
    expect(summary.netCents).toBe(69000);
    expect(summary.cashCents).toBe(35000);
    expect(summary.digitalCents).toBe(44000);
    expect(summary.tipsCents).toBe(5000);
    expect(summary.ticketCount).toBe(3);

    expect(computeEntryCommissionCents(serviceEntry, 40, 15)).toBe(14000);
    expect(computeEntryCommissionCents(productEntry, 40, 15)).toBe(3600);
    expect(computeEntryCommissionCents(depositEntry, 40, 15)).toBe(0);
    expect(computeEntryCommissionCents(expenseEntry, 40, 15)).toBe(0);

    const splits: PaymentSplit[] = [
      {
        id: 'ps-1',
        bookingId: 'bk-1',
        method: 'cash',
        amountCents: 35000,
        tipCents: 5000,
        tipStaffId: 'staff-karla',
        createdAt: '2026-11-27T18:00:00.000Z',
      },
    ];

    const rows = computeCommissionsByStaff({
      staff: [makeStaff(), makeStaff({ id: 'staff-paty', name: 'Paty', commissionPercent: 35 })],
      cashEntries: entries,
      paymentSplits: splits,
      todayKey: '2026-11-27',
      tz: TZ,
      period: 'today',
      retailCommissionPercent: 15,
      viewerRole: 'owner',
      viewerStaffId: 'staff-karla',
    });

    expect(rows).toHaveLength(2);
    const topRow = rows[0];
    expect(topRow).toBeDefined();
    if (!topRow) throw new Error('Expected top commission row');
    expect(topRow.serviceCommission).toBe(14000);
    expect(topRow.retailCommission).toBe(3600);
    expect(topRow.totalPayout).toBe(22600);
    expect(previewStaffCommission(topRow, 50).serviceCommission).toBe(17500);

    const drawer = computeCashDrawer({
      cashEntries: entries,
      todayKey: '2026-11-27',
      tz: TZ,
      openingFloatCents: 50000,
    });
    expect(drawer.expectedCents).toBe(80000);
    expect(computeCashReconciliation(80000, 800).status).toBe('balanced');
    expect(computeCashReconciliation(80000, 850).status).toBe('over');
    expect(computeCashReconciliation(80000, 750).status).toBe('short');
    expect(computePercentDelta(150, 100)).toBe(50);
    expect(computePercentDelta(100, 0)).toBe(100);
    expect(computePercentDelta(0, 0)).toBeNull();
  });

  it('aggregates receivables breakdown and today agenda cleanly without double counting deposits into uncollected', () => {
    const breakdown = selectPendingDepositsBreakdown([
      { depositAmountCents: 20000, proofDeliveryMethod: 'web_upload', paymentProofUrl: '/api/media/proofs/a.png' },
      { depositAmountCents: 20000, proofDeliveryMethod: 'none', paymentProofUrl: null },
      { depositAmountCents: 20000, proofDeliveryMethod: 'none', paymentProofUrl: null },
    ]);
    expect(breakdown.awaitingReviewCount).toBe(1);
    expect(breakdown.missingProofCount).toBe(2);
    expect(breakdown.summaryLabel).toBe('1 por revisar · 2 sin comprobante');
    expect(formatPendingDepositsBreakdown(0, 0)).toBe('Todo revisado');

    const receivables = selectReceivablesSummary({
      uncollectedBookings: [
        { remainingCents: 26000, status: 'confirmed', isPastUnclosed: true },
        { remainingCents: 45000, status: 'completed', isPastUnclosed: false },
      ],
      pendingDeposits: [
        { depositAmountCents: 20000, proofDeliveryMethod: 'web_upload', paymentProofUrl: 'x' },
      ],
    });
    expect(receivables.uncollectedTotalCents).toBe(71000);
    expect(receivables.pastUnclosedCount).toBe(1);
    expect(receivables.completedUnpaidCount).toBe(1);
    expect(receivables.pendingDepositsTotalCents).toBe(20000);

    const agenda = selectTodayAgenda({
      bookings: [
        {
          startAt: '2026-11-27T16:00:00.000Z',
          endAt: '2026-11-27T18:00:00.000Z',
          status: 'confirmed',
        },
        {
          startAt: '2026-11-27T22:00:00.000Z',
          endAt: '2026-11-27T23:00:00.000Z',
          status: 'confirmed',
        },
        {
          startAt: '2026-11-28T16:00:00.000Z',
          endAt: '2026-11-28T18:00:00.000Z',
          status: 'confirmed',
        },
        {
          startAt: '2026-11-27T19:00:00.000Z',
          endAt: '2026-11-27T20:00:00.000Z',
          status: 'canceled',
        },
      ],
      todayKey: '2026-11-27',
      tomorrowKey: '2026-11-28',
      timezone: TZ,
      nowMs: Date.parse('2026-11-27T20:00:00.000Z'),
    });
    expect(agenda.todayCount).toBe(2);
    expect(agenda.pastUnclosedTodayCount).toBe(1);
    expect(agenda.upcomingTodayCount).toBe(1);
    expect(agenda.tomorrowBookings).toHaveLength(1);
  });

  it('builds prioritized "Qué hacer ahora" action queue items with canonical typed links and RBAC gating', () => {
    const items = buildActionQueueItems({
      salonName: 'LAIKONA NAILS',
      currency: 'MXN',
      timezone: TZ,
      pendingDeposits: [
        {
          bookingId: 'bk-missing',
          bookingCode: 'NL-1045',
          clientName: 'Ana Torres',
          serviceName: 'Gel Manos',
          staffName: 'Tere',
          startAt: '2026-11-28T18:00:00.000Z',
          depositAmountCents: 20000,
          proofDeliveryMethod: 'none',
          paymentProofUrl: null,
        },
        {
          bookingId: 'bk-proof',
          bookingCode: 'NL-1044',
          clientName: 'Andrea López',
          serviceName: 'Softgel',
          staffName: 'Karla',
          startAt: '2026-11-28T16:00:00.000Z',
          depositAmountCents: 20000,
          proofDeliveryMethod: 'web_upload',
          paymentProofUrl: '/api/media/proofs/a.png',
        },
      ],
      uncollectedBookings: [
        {
          bookingId: 'bk-uncol',
          clientName: 'Sofía Ramírez',
          serviceName: 'Rubber',
          staffName: 'Karla',
          startAt: '2026-11-27T15:00:00.000Z',
          endAt: '2026-11-27T17:00:00.000Z',
          remainingCents: 26000,
        },
      ],
      waitlist: [
        {
          id: 'wl-1',
          serviceId: 'srv-softgel',
          preferredStaffId: 'staff-karla',
          desiredDate: '2026-11-28',
          preferredWindow: 'afternoon',
          clientName: 'Renata Silva',
          clientPhoneE164: '+522226612009',
          clientEmail: null,
          notes: '',
          status: 'waiting',
          notifiedAt: null,
          createdAt: '2026-11-27T12:00:00.000Z',
        },
      ],
      services: [{ id: 'srv-softgel', name: 'Softgel' }],
      inventory: [
        {
          id: 'inv-low',
          name: 'Base Rubber',
          unit: 'frasco',
          stockQuantity: 1,
          minStockAlert: 2,
          isActive: true,
        },
        {
          id: 'inv-ok',
          name: 'Top Coat',
          unit: 'frasco',
          stockQuantity: 8,
          minStockAlert: 2,
          isActive: true,
        },
      ],
      whatsappInboxSummary: {
        unreadCount: 2,
        failedCount: 0,
        failedRemindersCount: 1,
      },
      canAccessInventory: true,
      canAccessWhatsApp: true,
    });

    expect(items.map((item) => item.kind)).toEqual([
      'deposit_review',
      'deposit_missing_proof',
      'uncollected_booking',
      'waitlist',
      'whatsapp_unread',
      'whatsapp_failed_reminders',
      'low_stock',
    ]);
    expect(items[0]?.primaryHref).toBe('/admin/caja?tab=anticipos');
    expect(items[2]?.primaryHref).toBe('/admin/citas?collect=bk-uncol');
    expect(items[2]?.secondaryHref).toBe('/admin/citas?status=uncollected');
    expect(items[3]?.secondaryHref).toBe('/admin/citas?panel=waitlist');
    expect(items[4]?.primaryHref).toBe('/admin/whatsapp?tab=mensajes&filter=unread');
    expect(items[5]?.primaryHref).toBe('/admin/whatsapp?tab=recordatorios&filter=failed');
    expect(items[6]?.primaryHref).toBe('/admin/inventario?filter=low_stock&itemId=inv-low');

    const specialistItems = buildActionQueueItems({
      salonName: 'LAIKONA NAILS',
      currency: 'MXN',
      timezone: TZ,
      pendingDeposits: [],
      uncollectedBookings: [],
      waitlist: [],
      services: [],
      inventory: [
        {
          id: 'inv-low',
          name: 'Base Rubber',
          unit: 'frasco',
          stockQuantity: 1,
          minStockAlert: 2,
          isActive: true,
        },
      ],
      whatsappInboxSummary: {
        unreadCount: 3,
        failedCount: 1,
        failedRemindersCount: 1,
      },
      canAccessInventory: false,
      canAccessWhatsApp: false,
    });
    expect(specialistItems).toEqual([]);
  });
});
