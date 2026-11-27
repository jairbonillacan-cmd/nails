import { describe, expect, it } from 'vitest';
import type {
  CashRegisterEntry,
  Coupon,
  PaymentSplit,
  StaffMember,
} from '@/lib/types';
import type { SplitDetailRow } from './cajaTypes';
import {
  cajaPeriodLabel,
  classifyCouponStatus,
  computeCajaPeriodSummary,
  computeCashReconciliation,
  computeCommissionsByStaff,
  computeTodayExpectedCashCents,
  filterCashEntries,
  filterSplitDetails,
  formatCashCloseWhatsAppSummary,
  getCajaPeriodStartKey,
  isIsoInCajaPeriod,
} from './cajaMetrics';

const TZ = 'America/Mexico_City';
const TODAY_KEY = '2026-11-27';

function makeEntry(overrides: Partial<CashRegisterEntry>): CashRegisterEntry {
  return {
    id: 'cash-1',
    bookingId: null,
    staffId: 'st-1',
    entryType: 'service_income',
    description: 'Gelish manos',
    amountCents: 45000,
    tipCents: 5000,
    commissionCents: 18000,
    paymentMethod: 'cash',
    occurredAt: '2026-11-27T18:00:00.000Z',
    recordedBy: 'Admin',
    ...overrides,
  };
}

function makeStaff(overrides: Partial<StaffMember>): StaffMember {
  return {
    id: 'st-1',
    name: 'Valeria',
    roleTitle: 'Nail Artist',
    bio: '',
    avatarUrl: null,
    bookingSlug: 'valeria',
    commissionPercent: 40,
    isActive: true,
    displayOrder: 0,
    serviceIds: [],
    ...overrides,
  };
}

function makeCoupon(overrides: Partial<Coupon>): Coupon {
  return {
    id: 'cp-1',
    code: 'BIENVENIDA15',
    kind: 'coupon',
    discountType: 'percent',
    discountValue: 15,
    remainingBalanceCents: null,
    maxUses: 100,
    usedCount: 10,
    minSubtotalCents: 0,
    expiresAt: null,
    recipientName: null,
    isActive: true,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('cajaMetrics period filtering & summaries', () => {
  it('computes start keys and period labels accurately across periods', () => {
    expect(getCajaPeriodStartKey(TODAY_KEY, 'today')).toBe('2026-11-27');
    expect(getCajaPeriodStartKey(TODAY_KEY, '7d')).toBe('2026-11-21');
    expect(getCajaPeriodStartKey(TODAY_KEY, 'month')).toBe('2026-11-01');
    expect(getCajaPeriodStartKey(TODAY_KEY, 'all')).toBeNull();

    expect(cajaPeriodLabel('today')).toBe('Hoy');
    expect(cajaPeriodLabel('7d')).toBe('Últimos 7 días');
    expect(cajaPeriodLabel('month')).toBe('Este mes');
    expect(cajaPeriodLabel('all')).toBe('Histórico');
  });

  it('filters cash entries by period, payment method, entry type, and search query', () => {
    const entries: CashRegisterEntry[] = [
      makeEntry({
        id: 'today-cash',
        bookingId: 'bk-1',
        description: 'Soft Gel + Diseño',
        paymentMethod: 'cash',
        amountCents: 65000,
        occurredAt: '2026-11-27T17:00:00.000Z',
      }),
      makeEntry({
        id: 'week-card',
        description: 'Aceite de cutícula',
        entryType: 'product_sale',
        paymentMethod: 'card',
        amountCents: 22000,
        tipCents: 0,
        commissionCents: 2200,
        occurredAt: '2026-11-23T17:00:00.000Z',
      }),
      makeEntry({
        id: 'month-transfer-deposit',
        description: 'Anticipo cita',
        entryType: 'deposit',
        paymentMethod: 'transfer',
        amountCents: 20000,
        tipCents: 0,
        commissionCents: 0,
        occurredAt: '2026-11-03T17:00:00.000Z',
      }),
      makeEntry({
        id: 'old-expense',
        description: 'Compra de limas',
        entryType: 'expense',
        paymentMethod: 'cash',
        amountCents: 15000,
        tipCents: 0,
        commissionCents: 0,
        occurredAt: '2026-10-20T17:00:00.000Z',
      }),
    ];

    const bookingLookup = new Map([
      [
        'bk-1',
        {
          bookingCode: 'LKN-4821',
          clientName: 'Sofía Mendoza',
          staffName: 'Valeria',
        },
      ],
    ]);

    expect(
      filterCashEntries(entries, {
        period: 'today',
        method: 'all',
        query: '',
        todayKey: TODAY_KEY,
        tz: TZ,
      }).map((e) => e.id),
    ).toEqual(['today-cash']);

    expect(
      filterCashEntries(entries, {
        period: '7d',
        method: 'all',
        query: '',
        todayKey: TODAY_KEY,
        tz: TZ,
      }).map((e) => e.id),
    ).toEqual(['today-cash', 'week-card']);

    expect(
      filterCashEntries(entries, {
        period: 'month',
        method: 'all',
        query: '',
        todayKey: TODAY_KEY,
        tz: TZ,
      }).map((e) => e.id),
    ).toEqual(['today-cash', 'week-card', 'month-transfer-deposit']);

    expect(
      filterCashEntries(entries, {
        period: 'all',
        method: 'cash',
        entryType: 'expenses',
        query: '',
        todayKey: TODAY_KEY,
        tz: TZ,
      }).map((e) => e.id),
    ).toEqual(['old-expense']);

    expect(
      filterCashEntries(entries, {
        period: 'all',
        method: 'all',
        query: 'sofia',
        todayKey: TODAY_KEY,
        tz: TZ,
        bookingLookup,
      }).map((e) => e.id),
    ).toEqual(['today-cash']);

    expect(
      filterCashEntries(entries, {
        period: 'all',
        method: 'all',
        query: 'LKN-4821',
        todayKey: TODAY_KEY,
        tz: TZ,
        bookingLookup,
      }).map((e) => e.id),
    ).toEqual(['today-cash']);

    expect(isIsoInCajaPeriod('invalid-date', TODAY_KEY, TZ, 'today')).toBe(false);
  });

  it('filters split details by period, method, and query', () => {
    const splits: SplitDetailRow[] = [
      {
        id: 'sp-1',
        createdAt: '2026-11-27T17:00:00.000Z',
        bookingCode: 'LKN-101',
        clientName: 'María López',
        method: 'card',
        amountCents: 30000,
        tipCents: 3000,
        tipStaffName: 'Valeria',
        reference: 'TERM-99',
      },
      {
        id: 'sp-2',
        createdAt: '2026-10-15T17:00:00.000Z',
        bookingCode: 'LKN-080',
        clientName: 'Ana Pérez',
        method: 'cash',
        amountCents: 20000,
        tipCents: 0,
        tipStaffName: null,
        reference: null,
      },
    ];

    expect(
      filterSplitDetails(splits, {
        period: 'month',
        method: 'card',
        query: 'term-99',
        todayKey: TODAY_KEY,
        tz: TZ,
      }).map((s) => s.id),
    ).toEqual(['sp-1']);
  });

  it('aggregates collected, expenses, net, tips, ticket average, and payment methods', () => {
    const summary = computeCajaPeriodSummary([
      makeEntry({ id: '1', paymentMethod: 'cash', amountCents: 50000, tipCents: 5000 }),
      makeEntry({ id: '2', paymentMethod: 'card', amountCents: 70000, tipCents: 7000 }),
      makeEntry({
        id: '3',
        entryType: 'deposit',
        paymentMethod: 'transfer',
        amountCents: 20000,
        tipCents: 0,
      }),
      makeEntry({
        id: '4',
        paymentMethod: 'gift_card',
        amountCents: 10000,
        tipCents: 0,
      }),
      makeEntry({
        id: '5',
        entryType: 'expense',
        paymentMethod: 'cash',
        amountCents: 15000,
        tipCents: 0,
      }),
    ]);

    expect(summary).toEqual({
      collectedCents: 150000,
      expensesCents: 15000,
      netCents: 135000,
      tipsCents: 12000,
      ticketCount: 4,
      averageTicketCents: 37500,
      cashCents: 50000,
      cashCount: 1,
      cardCents: 70000,
      cardCount: 1,
      transferCents: 20000,
      transferCount: 1,
      giftCardCents: 10000,
      giftCardCount: 1,
    });
  });
});

describe('cajaMetrics specialist commissions & RBAC scoping', () => {
  const staff: StaffMember[] = [
    makeStaff({ id: 'st-1', name: 'Valeria', commissionPercent: 40 }),
    makeStaff({ id: 'st-2', name: 'Camila', commissionPercent: 35 }),
  ];

  const entries: CashRegisterEntry[] = [
    makeEntry({
      id: 'c1',
      staffId: 'st-1',
      amountCents: 60000,
      commissionCents: 24000,
      tipCents: 5000,
      occurredAt: '2026-11-27T17:00:00.000Z',
    }),
    makeEntry({
      id: 'c2',
      staffId: 'st-2',
      amountCents: 90000,
      commissionCents: 31500,
      tipCents: 10000,
      occurredAt: '2026-11-25T17:00:00.000Z',
    }),
    makeEntry({
      id: 'c3-expense',
      staffId: 'st-1',
      entryType: 'expense',
      amountCents: 5000,
      commissionCents: 0,
      tipCents: 0,
      occurredAt: '2026-11-27T18:00:00.000Z',
    }),
  ];

  const splits: PaymentSplit[] = [
    {
      id: 'sp-1',
      bookingId: 'bk-2',
      method: 'card',
      amountCents: 90000,
      tipCents: 10000,
      tipStaffId: 'st-2',
      createdAt: '2026-11-25T17:00:00.000Z',
    },
  ];

  it('computes sorted specialist totals for owner/admin within period', () => {
    const rows = computeCommissionsByStaff({
      staff,
      cashEntries: entries,
      paymentSplits: splits,
      todayKey: TODAY_KEY,
      tz: TZ,
      period: '7d',
      viewerRole: 'owner',
      viewerStaffId: null,
    });

    expect(rows.map((r) => r.id)).toEqual(['st-2', 'st-1']);
    expect(rows[0]).toMatchObject({
      id: 'st-2',
      servicesCount: 1,
      sales: 90000,
      commission: 31500,
      tips: 10000,
      splitTipsCents: 10000,
      splitTipsCount: 1,
      totalPayout: 41500,
    });
    expect(rows[1]).toMatchObject({
      id: 'st-1',
      servicesCount: 1,
      sales: 60000,
      commission: 24000,
      tips: 5000,
      totalPayout: 29000,
    });
  });

  it('restricts specialist viewers to their own commission row only', () => {
    const rows = computeCommissionsByStaff({
      staff,
      cashEntries: entries,
      paymentSplits: splits,
      todayKey: TODAY_KEY,
      tz: TZ,
      period: 'all',
      viewerRole: 'specialist',
      viewerStaffId: 'st-1',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('st-1');

    const unlinked = computeCommissionsByStaff({
      staff,
      cashEntries: entries,
      paymentSplits: splits,
      todayKey: TODAY_KEY,
      tz: TZ,
      period: 'all',
      viewerRole: 'specialist',
      viewerStaffId: null,
    });
    expect(unlinked).toEqual([]);
  });
});

describe('cajaMetrics coupon status & cash reconciliation', () => {
  it('classifies active, paused, exhausted, and expired coupons accurately', () => {
    const nowMs = Date.parse('2026-11-27T18:00:00.000Z');

    expect(classifyCouponStatus(makeCoupon({}), nowMs)).toEqual({
      status: 'active',
      label: 'Activo',
      tone: 'success',
    });

    expect(classifyCouponStatus(makeCoupon({ isActive: false }), nowMs)).toEqual({
      status: 'paused',
      label: 'Pausado',
      tone: 'neutral',
    });

    expect(
      classifyCouponStatus(
        makeCoupon({ expiresAt: '2026-11-20T00:00:00.000Z' }),
        nowMs,
      ),
    ).toEqual({
      status: 'expired',
      label: 'Vencido',
      tone: 'danger',
    });

    expect(
      classifyCouponStatus(makeCoupon({ maxUses: 5, usedCount: 5 }), nowMs),
    ).toEqual({
      status: 'exhausted',
      label: 'Agotado',
      tone: 'warning',
    });

    expect(
      classifyCouponStatus(
        makeCoupon({
          kind: 'gift_card',
          discountType: 'fixed_cents',
          discountValue: 50000,
          remainingBalanceCents: 0,
          maxUses: 1,
          usedCount: 1,
        }),
        nowMs,
      ),
    ).toEqual({
      status: 'exhausted',
      label: 'Agotado',
      tone: 'warning',
    });
  });

  it('computes today expected cash, reconciliation status, and WhatsApp summary text', () => {
    const todayCash = computeTodayExpectedCashCents(
      [
        makeEntry({
          id: 'in-cash',
          paymentMethod: 'cash',
          amountCents: 80000,
          tipCents: 5000,
          occurredAt: '2026-11-27T17:00:00.000Z',
        }),
        makeEntry({
          id: 'out-cash',
          entryType: 'expense',
          paymentMethod: 'cash',
          amountCents: 15000,
          tipCents: 0,
          occurredAt: '2026-11-27T18:00:00.000Z',
        }),
        makeEntry({
          id: 'in-card',
          paymentMethod: 'card',
          amountCents: 40000,
          tipCents: 0,
          occurredAt: '2026-11-27T18:30:00.000Z',
        }),
        makeEntry({
          id: 'yesterday-cash',
          paymentMethod: 'cash',
          amountCents: 50000,
          tipCents: 0,
          occurredAt: '2026-11-26T17:00:00.000Z',
        }),
      ],
      TODAY_KEY,
      TZ,
    );

    expect(todayCash).toBe(70000);
    expect(computeCashReconciliation(70000, 700)).toMatchObject({
      status: 'balanced',
      diffCents: 0,
      tone: 'success',
    });
    expect(computeCashReconciliation(70000, 750)).toMatchObject({
      status: 'over',
      diffCents: 5000,
      tone: 'warning',
    });
    expect(computeCashReconciliation(70000, 620)).toMatchObject({
      status: 'short',
      diffCents: -8000,
      tone: 'danger',
    });

    const summary = computeCajaPeriodSummary([
      makeEntry({
        id: 'in-cash',
        paymentMethod: 'cash',
        amountCents: 80000,
        tipCents: 5000,
      }),
      makeEntry({
        id: 'out-cash',
        entryType: 'expense',
        paymentMethod: 'cash',
        amountCents: 15000,
        tipCents: 0,
      }),
    ]);

    const text = formatCashCloseWhatsAppSummary({
      salonName: 'Laikona Studio',
      todayKey: TODAY_KEY,
      currency: 'MXN',
      todaySummary: summary,
      expectedCashCents: 70000,
      countedMxn: 750,
      uncollectedCount: 1,
      uncollectedTotalCents: 45000,
      pendingDepositsCount: 2,
      pendingDepositsTotalCents: 40000,
    });

    expect(text).toContain('*Corte de caja — Laikona Studio*');
    expect(text).toContain('Efectivo esperado:');
    expect(text).toContain('Efectivo contado:');
    expect(text).toContain('(Sobrante)');
    expect(text).toContain('Citas sin cobrar: 1');
    expect(text).toContain('Anticipos por confirmar: 2');
  });
});
