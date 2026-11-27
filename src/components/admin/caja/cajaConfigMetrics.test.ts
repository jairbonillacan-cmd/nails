import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CajaConfigSchema } from '@/lib/contracts/brand';
import {
  DEFAULT_CAJA_CONFIG,
  normalizeExpenseCategories,
  resolveCajaConfig,
} from '@/lib/caja/caja-config';
import type { CashRegisterEntry, Coupon, StaffMember } from '@/lib/types';
import {
  buildCashAdjustmentDraft,
  cajaPeriodLabel,
  computeCashDrawer,
  computeCashReconciliation,
  computeCajaPeriodSummary,
  computeCommissionsByStaff,
  computePackageEconomics,
  describeCouponPreview,
  filterCashEntries,
  filterCoupons,
  formatCashCloseWhatsAppSummary,
  generateCouponCode,
  getCajaPeriodRange,
  isIsoInCajaPeriod,
  previewStaffCommission,
  suggestQuickAmounts,
  toIsoDateValue,
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
    tipCents: 0,
    commissionCents: 0,
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
    usedCount: 0,
    minSubtotalCents: 0,
    expiresAt: null,
    recipientName: null,
    isActive: true,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('caja date ranges (Hoy, 7 días, mes, mes pasado, personalizado)', () => {
  it('resolves last month and custom ranges, swapping reversed custom dates', () => {
    expect(getCajaPeriodRange(TODAY_KEY, 'last_month')).toEqual({
      startKey: '2026-10-01',
      endKey: '2026-10-31',
    });
    expect(getCajaPeriodRange('2026-03-15', 'last_month')).toEqual({
      startKey: '2026-02-01',
      endKey: '2026-02-28',
    });
    expect(getCajaPeriodRange('2026-01-10', 'last_month')).toEqual({
      startKey: '2025-12-01',
      endKey: '2025-12-31',
    });
    expect(
      getCajaPeriodRange(TODAY_KEY, 'custom', { fromKey: '2026-11-20', toKey: '2026-11-05' }),
    ).toEqual({ startKey: '2026-11-05', endKey: '2026-11-20' });
    expect(getCajaPeriodRange(TODAY_KEY, 'custom', { fromKey: '2026-11-10', toKey: '' })).toEqual(
      { startKey: '2026-11-10', endKey: null },
    );
    expect(getCajaPeriodRange(TODAY_KEY, 'all')).toEqual({ startKey: null, endKey: null });
  });

  it('labels custom ranges in Spanish and filters entries inclusively', () => {
    expect(cajaPeriodLabel('last_month')).toBe('Mes pasado');
    expect(cajaPeriodLabel('custom', { fromKey: '', toKey: '' })).toBe('Rango personalizado');
    expect(cajaPeriodLabel('custom', { fromKey: '2026-11-01', toKey: '2026-11-15' })).toContain('–');

    const entries = [
      makeEntry({ id: 'oct-local', occurredAt: '2026-11-01T05:30:00.000Z' }),
      makeEntry({ id: 'nov-1', occurredAt: '2026-11-01T18:00:00.000Z' }),
      makeEntry({ id: 'nov-15-late', occurredAt: '2026-11-16T05:00:00.000Z' }),
      makeEntry({ id: 'nov-16', occurredAt: '2026-11-16T18:00:00.000Z' }),
    ];
    const ids = filterCashEntries(entries, {
      period: 'custom',
      custom: { fromKey: '2026-11-01', toKey: '2026-11-15' },
      method: 'all',
      query: '',
      todayKey: TODAY_KEY,
      tz: TZ,
    }).map((e) => e.id);
    expect(ids.toSorted()).toEqual(['nov-1', 'nov-15-late']);
  });

  it('property: an ISO date is inside a custom range iff its local key is between the bounds', () => {
    const dayKey = fc
      .integer({ min: 0, max: 400 })
      .map((offset) => new Date(Date.UTC(2026, 0, 1 + offset, 12)).toISOString().slice(0, 10));
    fc.assert(
      fc.property(dayKey, dayKey, dayKey, (a, b, entryKey) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const iso = `${entryKey}T18:00:00.000Z`;
        const inside = isIsoInCajaPeriod(iso, TODAY_KEY, TZ, 'custom', { fromKey: a, toKey: b });
        expect(inside).toBe(entryKey >= lo && entryKey <= hi);
      }),
    );
  });

  it('only builds ISO date values for well-formed keys', () => {
    expect(toIsoDateValue('2026-11-27')).toBe('2026-11-27');
    expect(toIsoDateValue('27/11/2026')).toBeUndefined();
    expect(toIsoDateValue('')).toBeUndefined();
  });
});

describe('configurable retail commission', () => {
  const staff = [makeStaff({ id: 'st-1', name: 'Valeria', commissionPercent: 40 })];
  const entries = [
    makeEntry({ id: 'svc', entryType: 'service_income', amountCents: 60000, tipCents: 5000 }),
    makeEntry({ id: 'retail', entryType: 'product_sale', amountCents: 20000, commissionCents: 2000 }),
  ];

  it('splits service vs retail commission using the configured retail percent', () => {
    const [row] = computeCommissionsByStaff({
      staff,
      cashEntries: entries,
      paymentSplits: [],
      todayKey: TODAY_KEY,
      tz: TZ,
      period: 'today',
      retailCommissionPercent: 15,
      viewerRole: 'owner',
      viewerStaffId: null,
    });
    expect(row).toMatchObject({
      serviceSales: 60000,
      serviceCommission: 24000,
      retailSales: 20000,
      retailCommission: 3000,
      retailPercent: 15,
      commission: 27000,
      tips: 5000,
      totalPayout: 32000,
    });
  });

  it('previews a new service percent without touching retail commission', () => {
    const [row] = computeCommissionsByStaff({
      staff,
      cashEntries: entries,
      paymentSplits: [],
      todayKey: TODAY_KEY,
      tz: TZ,
      period: 'today',
      retailCommissionPercent: 10,
      viewerRole: 'owner',
      viewerStaffId: null,
    });
    expect(previewStaffCommission(row!, 50)).toEqual({
      serviceCommission: 30000,
      commission: 32000,
      totalPayout: 37000,
    });
  });
});

describe('cash drawer with opening float and adjustments', () => {
  const entries = [
    makeEntry({ id: 'in', paymentMethod: 'cash', amountCents: 80000, tipCents: 5000 }),
    makeEntry({ id: 'out', entryType: 'expense', paymentMethod: 'cash', amountCents: 15000 }),
    makeEntry({ id: 'card', paymentMethod: 'card', amountCents: 40000 }),
    makeEntry({ id: 'yesterday', paymentMethod: 'cash', occurredAt: '2026-11-26T18:00:00.000Z' }),
  ];

  it('expected cash = opening float + cash sales + cash tips − cash expenses', () => {
    expect(
      computeCashDrawer({ cashEntries: entries, todayKey: TODAY_KEY, tz: TZ, openingFloatCents: 50000 }),
    ).toEqual({
      openingFloatCents: 50000,
      cashSalesCents: 80000,
      cashTipsCents: 5000,
      cashExpensesCents: 15000,
      expectedCents: 120000,
    });
  });

  it('property: expected cash always equals the formula for any set of cash entries', () => {
    const entryArb = fc.record({
      isExpense: fc.boolean(),
      amount: fc.integer({ min: 0, max: 500_000 }),
      tip: fc.integer({ min: 0, max: 50_000 }),
      method: fc.constantFrom<'cash' | 'card' | 'transfer'>('cash', 'card', 'transfer'),
    });
    fc.assert(
      fc.property(fc.array(entryArb, { maxLength: 20 }), fc.integer({ min: 0, max: 200_000 }), (raw, opening) => {
        const cashEntries = raw.map((item, idx) =>
          makeEntry({
            id: `e-${idx}`,
            entryType: item.isExpense ? 'expense' : 'service_income',
            amountCents: item.amount,
            tipCents: item.isExpense ? 0 : item.tip,
            paymentMethod: item.method,
          }),
        );
        const drawer = computeCashDrawer({ cashEntries, todayKey: TODAY_KEY, tz: TZ, openingFloatCents: opening });
        const cash = raw.filter((item) => item.method === 'cash');
        const expected =
          opening +
          cash.filter((i) => !i.isExpense).reduce((s, i) => s + i.amount + i.tip, 0) -
          cash.filter((i) => i.isExpense).reduce((s, i) => s + i.amount, 0);
        expect(drawer.expectedCents).toBe(expected);
      }),
    );
  });

  it('builds a cash adjustment draft only when the count does not match', () => {
    expect(buildCashAdjustmentDraft(computeCashReconciliation(70000, 700), '', TODAY_KEY)).toBeNull();
    expect(buildCashAdjustmentDraft(computeCashReconciliation(70000, 650), 'cambio mal dado', TODAY_KEY)).toEqual({
      entryType: 'expense',
      description: 'Ajuste de arqueo · Faltante (2026-11-27) · cambio mal dado',
      amountMxn: 50,
      method: 'cash',
      staffId: null,
    });
    expect(buildCashAdjustmentDraft(computeCashReconciliation(70000, 720), '', TODAY_KEY)).toMatchObject({
      entryType: 'service_income',
      amountMxn: 20,
    });
  });

  it('respects WhatsApp summary preferences, opening float and close note', () => {
    const summary = computeCajaPeriodSummary(entries.slice(0, 2));
    const drawer = computeCashDrawer({ cashEntries: entries, todayKey: TODAY_KEY, tz: TZ, openingFloatCents: 50000 });
    const staffRows = computeCommissionsByStaff({
      staff: [makeStaff({})],
      cashEntries: entries,
      paymentSplits: [],
      todayKey: TODAY_KEY,
      tz: TZ,
      period: 'today',
      viewerRole: 'owner',
      viewerStaffId: null,
    });
    const base = {
      salonName: 'Laikona',
      todayKey: TODAY_KEY,
      currency: 'MXN' as const,
      todaySummary: summary,
      drawer,
      expectedCashCents: drawer.expectedCents,
      countedMxn: 1200,
      closeNote: 'Todo en orden',
      staffRows,
      uncollectedCount: 1,
      uncollectedTotalCents: 45000,
      pendingDepositsCount: 0,
      pendingDepositsTotalCents: 0,
    };
    const full = formatCashCloseWhatsAppSummary(base);
    expect(full).toContain('Fondo inicial: $500');
    expect(full).toContain('Nota: Todo en orden');
    expect(full).toContain('*Por profesional*');
    expect(full).toContain('Propinas:');
    expect(full).toContain('Citas sin cobrar: 1');

    const minimal = formatCashCloseWhatsAppSummary({
      ...base,
      prefs: { includeStaffBreakdown: false, includeTips: false, includePending: false },
    });
    expect(minimal).not.toContain('*Por profesional*');
    expect(minimal).not.toContain('Propinas:');
    expect(minimal).not.toContain('*Pendientes*');
    expect(minimal).toContain('Efectivo esperado: $1,200');
  });
});

describe('coupons, packages and quick amounts', () => {
  it('filters coupons by kind, status and search text', () => {
    const now = Date.parse('2026-11-27T12:00:00.000Z');
    const coupons = [
      makeCoupon({ id: 'a', code: 'CUMPLE20' }),
      makeCoupon({ id: 'b', code: 'REGALO-ANA', kind: 'gift_card', discountType: 'fixed_cents', remainingBalanceCents: 50000, recipientName: 'Ana' }),
      makeCoupon({ id: 'c', code: 'VIEJO', isActive: false }),
      makeCoupon({ id: 'd', code: 'VENCIDO', expiresAt: '2026-10-01T23:59:59.000Z' }),
    ];
    const ids = (filter: Parameters<typeof filterCoupons>[1]['filter'], query = '') =>
      filterCoupons(coupons, { filter, query, nowMs: now }).map((c) => c.id);
    expect(ids('all')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('gift_card')).toEqual(['b']);
    expect(ids('coupon')).toEqual(['a', 'c', 'd']);
    expect(ids('active')).toEqual(['a', 'b']);
    expect(ids('inactive')).toEqual(['c', 'd']);
    expect(ids('all', 'ana')).toEqual(['b']);
  });

  it('generates readable unique codes with a kind prefix', () => {
    let seed = 0;
    const random = () => {
      seed = (seed + 0.37) % 1;
      return seed;
    };
    const code = generateCouponCode('gift_card', random);
    expect(code).toMatch(/^REGALO-[A-HJ-NP-Z2-9]{5}$/);
    const constant = () => 0;
    const taken = generateCouponCode('coupon', constant);
    expect(generateCouponCode('coupon', constant, [taken])).not.toBe(taken);
  });

  it('describes coupons in plain language for the live preview', () => {
    const preview = describeCouponPreview(
      {
        code: 'cumple20',
        kind: 'coupon',
        discountType: 'percent',
        value: 20,
        remainingBalanceMxn: 0,
        minSubtotalMxn: 300,
        maxUses: 50,
        expiresDate: '2026-12-31',
        recipientName: '',
        isActive: true,
      },
      'MXN',
    );
    expect(preview.headline).toBe('CUMPLE20: 20% de descuento');
    expect(preview.details).toContain('Aplica en compras desde $300');
    expect(preview.details).toContain('Hasta 50 canjes en total');
    expect(preview.details.some((line) => line.startsWith('Vence el'))).toBe(true);
  });

  it('computes package per-session price and savings vs single sessions', () => {
    expect(computePackageEconomics({ priceCents: 160000, totalSessions: 5, servicePriceCents: 40000 })).toEqual({
      perSessionCents: 32000,
      regularTotalCents: 200000,
      savingsCents: 40000,
      savingsPercent: 20,
      isMoreExpensive: false,
    });
    expect(
      computePackageEconomics({ priceCents: 250000, totalSessions: 5, servicePriceCents: 40000 }).isMoreExpensive,
    ).toBe(true);
  });

  it('suggests the most frequent manual amounts, padded with defaults', () => {
    const entries = [
      makeEntry({ id: '1', entryType: 'expense', amountCents: 25000 }),
      makeEntry({ id: '2', entryType: 'expense', amountCents: 25000 }),
      makeEntry({ id: '3', entryType: 'expense', amountCents: 8000 }),
      makeEntry({ id: '4', entryType: 'expense', amountCents: 99900, bookingId: 'bk-1' }),
    ];
    expect(suggestQuickAmounts(entries, 'expense')).toEqual([80, 100, 150, 250]);
    expect(suggestQuickAmounts([], 'service_income')).toEqual([100, 150, 200, 300]);
  });
});

describe('cajaConfig contract', () => {
  it('falls back to defaults for missing or corrupt config', () => {
    expect(resolveCajaConfig(undefined)).toEqual(DEFAULT_CAJA_CONFIG);
    expect(resolveCajaConfig({ cajaConfig: undefined })).toEqual(DEFAULT_CAJA_CONFIG);
  });

  it('validates ranges, duplicates and unknown keys', () => {
    expect(CajaConfigSchema.safeParse(DEFAULT_CAJA_CONFIG).success).toBe(true);
    expect(CajaConfigSchema.safeParse({ ...DEFAULT_CAJA_CONFIG, retailCommissionPercent: 101 }).success).toBe(false);
    expect(CajaConfigSchema.safeParse({ ...DEFAULT_CAJA_CONFIG, openingFloatCents: -1 }).success).toBe(false);
    expect(CajaConfigSchema.safeParse({ ...DEFAULT_CAJA_CONFIG, defaultPeriod: 'custom' }).success).toBe(false);
    expect(
      CajaConfigSchema.safeParse({ ...DEFAULT_CAJA_CONFIG, expenseCategories: ['Gel', 'gel'] }).success,
    ).toBe(false);
    expect(CajaConfigSchema.safeParse({ ...DEFAULT_CAJA_CONFIG, extra: 1 }).success).toBe(false);
  });

  it('normalizes expense categories (trim, dedupe, length, max 12)', () => {
    expect(normalizeExpenseCategories(['  Acetona  ', 'acetona', 'A', 'Algodón   y toallas'])).toEqual([
      'Acetona',
      'Algodón y toallas',
    ]);
    const many = Array.from({ length: 20 }, (_, i) => `Categoría ${i}`);
    expect(normalizeExpenseCategories(many)).toHaveLength(12);
  });
});
