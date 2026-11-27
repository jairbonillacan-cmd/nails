import { describe, expect, it } from 'vitest';
import type {
  AvailabilitySchedule,
  Booking,
  BookingReview,
  CashRegisterEntry,
  ClientProfile,
  FunnelEventRecord,
  PaymentSplit,
  Service,
  StaffMember,
} from '../types';
import {
  buildExecutiveReport,
  buildFunnelSummary,
  type ExecutiveReportInput,
} from './reports';

const TZ = 'America/Mexico_City';
const NOW_MS = Date.UTC(2026, 4, 15, 20, 0, 0);

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
    serviceIds: ['srv-rubber', 'srv-pedispa', 'srv-gel'],
    ...overrides,
  };
}

function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'srv-rubber',
    categoryId: 'cat-1',
    name: 'Rubber',
    slug: 'rubber',
    description: '',
    durationMinutes: 120,
    priceCents: 35000,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    requiresConfirmation: true,
    depositRequired: true,
    depositAmountCents: 20000,
    allowInspoPhoto: true,
    isActive: true,
    isFeatured: true,
    displayOrder: 0,
    imageUrl: null,
    ...overrides,
  };
}

function makeSchedule(
  staffId: string,
  days: Array<0 | 1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6],
  startTime = '10:00',
  endTime = '18:00',
): AvailabilitySchedule {
  return {
    id: `sched-${staffId}`,
    staffId,
    name: `Horario ${staffId}`,
    timezone: TZ,
    isDefault: true,
    rules: days.map((dayOfWeek) => ({
      id: `rule-${staffId}-${dayOfWeek}`,
      dayOfWeek,
      startTime,
      endTime,
    })),
  };
}

function makeClient(id: string, fullName: string): ClientProfile {
  return {
    id,
    fullName,
    phoneE164: '+522221111111',
    email: null,
    birthday: null,
    notes: '',
    noShowCount: 0,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
  };
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'bk-1',
    bookingCode: 'NL-1001',
    manageToken: 'tok-1',
    idempotencyKey: null,
    serviceId: 'srv-rubber',
    staffId: 'staff-karla',
    clientId: 'cli-1',
    startAt: '2026-05-14T16:00:00.000Z',
    endAt: '2026-05-14T18:00:00.000Z',
    occupiedStartAt: '2026-05-14T16:00:00.000Z',
    occupiedEndAt: '2026-05-14T18:00:00.000Z',
    totalDurationMinutes: 120,
    subtotalCents: 35000,
    discountCents: 0,
    totalPriceCents: 35000,
    depositAmountCents: 20000,
    couponCode: null,
    status: 'completed',
    source: 'web',
    clientNotes: '',
    internalNotes: '',
    inspoPhotoUrl: null,
    paymentProofUrl: null,
    googleEventId: null,
    cancellationReason: null,
    rescheduledFromId: null,
    addons: [],
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-14T18:00:00.000Z',
    ...overrides,
  };
}

function makeBaseInput(): ExecutiveReportInput {
  const karla = makeStaff({ id: 'staff-karla', name: 'Karla', displayOrder: 0 });
  const tere = makeStaff({ id: 'staff-tere', name: 'Tere', displayOrder: 1 });

  const srvRubber = makeService({
    id: 'srv-rubber',
    name: 'Rubber',
    durationMinutes: 120,
    priceCents: 35000,
  });
  const srvPedispa = makeService({
    id: 'srv-pedispa',
    name: 'PediSpa + Gel',
    durationMinutes: 90,
    priceCents: 54000,
  });
  const srvGel = makeService({
    id: 'srv-gel',
    name: 'Gel Manos',
    durationMinutes: 60,
    priceCents: 15000,
  });

  const clients: ClientProfile[] = [
    makeClient('cli-sofia', 'Sofía'),
    makeClient('cli-paula', 'Paula'),
    makeClient('cli-andrea', 'Andrea'),
  ];

  const bookings: Booking[] = [
    makeBooking({
      id: 'bk-recent-1',
      serviceId: 'srv-pedispa',
      staffId: 'staff-karla',
      clientId: 'cli-sofia',
      startAt: '2026-05-14T16:00:00.000Z',
      endAt: '2026-05-14T17:30:00.000Z',
      totalDurationMinutes: 90,
      totalPriceCents: 54000,
      status: 'completed',
    }),
    makeBooking({
      id: 'bk-recent-2',
      serviceId: 'srv-rubber',
      staffId: 'staff-karla',
      clientId: 'cli-paula',
      startAt: '2026-05-14T16:30:00.000Z',
      endAt: '2026-05-14T18:30:00.000Z',
      totalDurationMinutes: 120,
      totalPriceCents: 35000,
      status: 'completed',
    }),
    makeBooking({
      id: 'bk-recent-noshow',
      serviceId: 'srv-gel',
      staffId: 'staff-tere',
      clientId: 'cli-andrea',
      startAt: '2026-05-13T20:00:00.000Z',
      endAt: '2026-05-13T21:00:00.000Z',
      totalDurationMinutes: 60,
      totalPriceCents: 15000,
      status: 'no_show',
    }),
    makeBooking({
      id: 'bk-recent-cancel-1',
      serviceId: 'srv-gel',
      staffId: 'staff-tere',
      clientId: 'cli-andrea',
      startAt: '2026-05-12T20:00:00.000Z',
      endAt: '2026-05-12T21:00:00.000Z',
      totalDurationMinutes: 60,
      totalPriceCents: 15000,
      status: 'canceled',
      cancellationReason: 'Cambio de horario laboral',
    }),
    makeBooking({
      id: 'bk-20d-ago',
      serviceId: 'srv-rubber',
      staffId: 'staff-karla',
      clientId: 'cli-sofia',
      startAt: '2026-04-25T17:00:00.000Z',
      endAt: '2026-04-25T19:00:00.000Z',
      totalDurationMinutes: 120,
      totalPriceCents: 36000,
      status: 'completed',
    }),
    makeBooking({
      id: 'bk-45d-ago',
      serviceId: 'srv-gel',
      staffId: 'staff-tere',
      clientId: 'cli-paula',
      startAt: '2026-04-01T21:00:00.000Z',
      endAt: '2026-04-01T22:00:00.000Z',
      totalDurationMinutes: 60,
      totalPriceCents: 18000,
      status: 'completed',
    }),
    makeBooking({
      id: 'bk-120d-ago',
      serviceId: 'srv-gel',
      staffId: 'staff-tere',
      clientId: 'cli-paula',
      startAt: '2026-01-10T21:00:00.000Z',
      endAt: '2026-01-10T22:00:00.000Z',
      totalDurationMinutes: 60,
      totalPriceCents: 15000,
      status: 'canceled',
      cancellationReason: 'cambio de horario laboral',
    }),
  ];

  const paymentSplits: PaymentSplit[] = [
    {
      id: 'ps-1',
      bookingId: 'bk-recent-1',
      method: 'card',
      amountCents: 54000,
      tipCents: 6000,
      tipStaffId: 'staff-karla',
      createdAt: '2026-05-14T17:30:00.000Z',
    },
    {
      id: 'ps-2',
      bookingId: 'bk-recent-2',
      method: 'cash',
      amountCents: 20000,
      tipCents: 3000,
      tipStaffId: 'staff-karla',
      createdAt: '2026-05-14T18:30:00.000Z',
    },
    {
      id: 'ps-3',
      bookingId: 'bk-recent-2',
      method: 'transfer',
      amountCents: 15000,
      tipCents: 0,
      tipStaffId: null,
      createdAt: '2026-05-14T18:30:00.000Z',
    },
    {
      id: 'ps-4',
      bookingId: 'bk-20d-ago',
      method: 'card',
      amountCents: 36000,
      tipCents: 4000,
      tipStaffId: 'staff-karla',
      createdAt: '2026-04-25T19:00:00.000Z',
    },
    {
      id: 'ps-5',
      bookingId: 'bk-45d-ago',
      method: 'cash',
      amountCents: 18000,
      tipCents: 2000,
      tipStaffId: 'staff-tere',
      createdAt: '2026-04-01T22:00:00.000Z',
    },
  ];

  const reviews: BookingReview[] = [
    {
      id: 'rev-1',
      bookingId: 'bk-recent-1',
      clientId: 'cli-sofia',
      staffId: 'staff-karla',
      rating: 5,
      comment: 'Excelente',
      clickedGoogleReview: true,
      createdAt: '2026-05-14T18:00:00.000Z',
    },
    {
      id: 'rev-2',
      bookingId: 'bk-recent-2',
      clientId: 'cli-paula',
      staffId: 'staff-karla',
      rating: 4,
      comment: 'Muy bien',
      clickedGoogleReview: false,
      createdAt: '2026-05-14T19:00:00.000Z',
    },
    {
      id: 'rev-3',
      bookingId: 'bk-45d-ago',
      clientId: 'cli-paula',
      staffId: 'staff-tere',
      rating: 5,
      comment: 'Genial',
      clickedGoogleReview: true,
      createdAt: '2026-04-01T22:30:00.000Z',
    },
  ];

  return {
    bookings,
    services: [srvRubber, srvPedispa, srvGel],
    staff: [karla, tere],
    schedules: [
      makeSchedule('staff-karla', [1, 2, 3, 4, 5, 6], '10:00', '18:00'),
      makeSchedule('staff-tere', [1, 2, 3, 4, 5, 6], '14:00', '20:00'),
    ],
    clients,
    reviews,
    paymentSplits,
    period: '7d',
    nowMs: NOW_MS,
    timezone: TZ,
  };
}

describe('buildExecutiveReport', () => {
  it('computes accurate 7d summary KPIs, tips, rates, and average rating', () => {
    const report = buildExecutiveReport(makeBaseInput());

    expect(report.summary.totalBookings).toBe(4);
    expect(report.summary.completedCount).toBe(2);
    expect(report.summary.noShowCount).toBe(1);
    expect(report.summary.canceledCount).toBe(1);
    expect(report.summary.totalRevenueCollectedCents).toBe(89000);
    expect(report.summary.averageTicketCents).toBe(44500);
    expect(report.summary.totalTipsCents).toBe(9000);
    expect(report.summary.completionRatePercent).toBe(50);
    expect(report.summary.noShowRatePercent).toBe(25);
    expect(report.summary.cancellationRatePercent).toBe(25);
    expect(report.summary.reviewsCount).toBe(2);
    expect(report.summary.averageRating).toBe(4.5);
  });

  it('respects 7d, 30d, 90d, and all period windows cleanly', () => {
    const base = makeBaseInput();

    const r7 = buildExecutiveReport({ ...base, period: '7d' });
    const r30 = buildExecutiveReport({ ...base, period: '30d' });
    const r90 = buildExecutiveReport({ ...base, period: '90d' });
    const rAll = buildExecutiveReport({ ...base, period: 'all' });

    expect(r7.summary.totalBookings).toBe(4);
    expect(r30.summary.totalBookings).toBe(5);
    expect(r90.summary.totalBookings).toBe(6);
    expect(rAll.summary.totalBookings).toBe(7);

    expect(r30.summary.totalRevenueCollectedCents).toBe(125000);
    expect(r90.summary.totalRevenueCollectedCents).toBe(143000);
    expect(rAll.summary.totalRevenueCollectedCents).toBe(143000);
  });

  it('computes specialist occupancy, booked vs available minutes, and new vs returning retention', () => {
    const report = buildExecutiveReport({ ...makeBaseInput(), period: '7d' });

    const karla = report.specialistOccupancy.find((s) => s.staffId === 'staff-karla');
    const tere = report.specialistOccupancy.find((s) => s.staffId === 'staff-tere');

    expect(karla).toBeDefined();
    expect(karla?.bookedMinutes).toBe(210);
    expect(karla?.availableMinutes).toBe(2880);
    expect(karla?.occupancyPercent).toBe(7);
    expect(karla?.completedCount).toBe(2);
    expect(karla?.noShowCount).toBe(0);
    expect(karla?.revenueCents).toBe(89000);
    expect(karla?.returningClientsCount).toBe(1);
    expect(karla?.newClientsCount).toBe(1);
    expect(karla?.retentionPercent).toBe(50);

    expect(tere).toBeDefined();
    expect(tere?.bookedMinutes).toBe(0);
    expect(tere?.availableMinutes).toBe(2160);
    expect(tere?.occupancyPercent).toBe(0);
    expect(tere?.noShowCount).toBe(1);
    expect(tere?.revenueCents).toBe(0);
  });

  it('enforces strict scopeStaffId isolation without leaking other staff revenue, reviews, or heatmap cells', () => {
    const base = makeBaseInput();
    const scopedTere = buildExecutiveReport({
      ...base,
      period: 'all',
      scopeStaffId: 'staff-tere',
    });

    expect(scopedTere.specialistOccupancy).toHaveLength(1);
    expect(scopedTere.specialistOccupancy[0]?.staffId).toBe('staff-tere');
    expect(scopedTere.summary.totalRevenueCollectedCents).toBe(18000);
    expect(scopedTere.summary.totalTipsCents).toBe(2000);
    expect(scopedTere.summary.reviewsCount).toBe(1);
    expect(scopedTere.summary.averageRating).toBe(5);
    expect(scopedTere.heatmap.totalBookings).toBe(1);
    expect(scopedTere.serviceProfitability).toHaveLength(1);
    expect(scopedTere.serviceProfitability[0]?.serviceId).toBe('srv-gel');
  });

  it('builds a 7x12 Mon-Sun demand heatmap in local salon timezone with peak and quiet slots', () => {
    const report = buildExecutiveReport({ ...makeBaseInput(), period: '7d' });

    expect(report.heatmap.days).toHaveLength(7);
    expect(report.heatmap.days[0]?.dayShort).toBe('Lun');
    expect(report.heatmap.days[6]?.dayShort).toBe('Dom');
    expect(report.heatmap.hours).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

    expect(report.heatmap.totalBookings).toBe(2);
    expect(report.heatmap.maxCount).toBe(2);
    expect(report.heatmap.peakSlot?.dayOfWeek).toBe(4);
    expect(report.heatmap.peakSlot?.hour).toBe(10);
    expect(report.heatmap.peakSlot?.count).toBe(2);
    expect(report.heatmap.peakSlot?.level).toBe(4);

    expect(report.heatmap.quietSlot).not.toBeNull();
    expect(report.heatmap.quietSlot?.count).toBe(0);
    expect(report.heatmap.quietSlot?.dayOfWeek).not.toBe(0);
  });

  it('ranks service profitability descending by revenuePerMinuteCents without mutating input arrays', () => {
    const base = makeBaseInput();
    const originalServiceOrder = base.services.map((s) => s.id);

    const report = buildExecutiveReport({ ...base, period: '90d' });

    expect(base.services.map((s) => s.id)).toEqual(originalServiceOrder);
    expect(report.serviceProfitability.map((r) => r.serviceId)).toEqual([
      'srv-pedispa',
      'srv-gel',
      'srv-rubber',
    ]);
    expect(report.serviceProfitability[0]?.revenuePerMinuteCents).toBe(600);
    expect(report.serviceProfitability[1]?.revenuePerMinuteCents).toBe(300);
    expect(report.serviceProfitability[2]?.revenuePerMinuteCents).toBe(296);
  });

  it('groups cancellation reasons case-insensitively and labels blank reasons cleanly', () => {
    const base = makeBaseInput();
    const extraCancel = makeBooking({
      id: 'bk-cancel-blank',
      status: 'canceled',
      cancellationReason: '   ',
      startAt: '2026-05-11T17:00:00.000Z',
    });

    const report = buildExecutiveReport({
      ...base,
      bookings: [...base.bookings, extraCancel],
      period: 'all',
    });

    expect(report.cancellationReasons).toHaveLength(2);
    expect(report.cancellationReasons[0]).toEqual({
      reason: 'Cambio de horario laboral',
      count: 2,
      sharePercent: 67,
    });
    expect(report.cancellationReasons[1]).toEqual({
      reason: 'Sin motivo especificado',
      count: 1,
      sharePercent: 33,
    });
  });

  it('handles empty datasets, zero schedule minutes, and invalid timezones gracefully', () => {
    const report = buildExecutiveReport({
      bookings: [],
      services: [],
      staff: [makeStaff({ id: 'staff-no-sched', name: 'Sin Horario' })],
      schedules: [],
      clients: [],
      reviews: [],
      paymentSplits: [],
      period: '30d',
      nowMs: NOW_MS,
      timezone: 'Invalid/Zone',
    });

    expect(report.summary.totalBookings).toBe(0);
    expect(report.summary.averageTicketCents).toBe(0);
    expect(report.summary.averageRating).toBeNull();
    expect(report.summary.completionRatePercent).toBe(0);
    expect(report.specialistOccupancy).toHaveLength(1);
    expect(report.specialistOccupancy[0]?.availableMinutes).toBe(0);
    expect(report.specialistOccupancy[0]?.occupancyPercent).toBe(0);
    expect(report.heatmap.peakSlot).toBeNull();
    expect(report.heatmap.quietSlot).toBeNull();
    expect(report.serviceProfitability).toEqual([]);
    expect(report.cancellationReasons).toEqual([]);
  });

  it('keeps uncollected completed bookings out of collected revenue while measuring service $/min and clamping extreme values', () => {
    const base = makeBaseInput();
    const uncollectedBooking = makeBooking({
      id: 'bk-uncollected',
      serviceId: 'srv-pedispa',
      staffId: 'staff-karla',
      clientId: 'cli-andrea',
      startAt: '2026-05-15T13:00:00.000Z',
      endAt: '2026-05-15T14:30:00.000Z',
      totalDurationMinutes: 90,
      totalPriceCents: 54000,
      status: 'completed',
    });
    const zeroDurationBooking = makeBooking({
      id: 'bk-zero-dur',
      serviceId: 'srv-gel',
      staffId: 'staff-tere',
      clientId: 'cli-paula',
      startAt: '2026-05-15T14:00:00.000Z',
      endAt: '2026-05-15T14:00:00.000Z',
      totalDurationMinutes: 0,
      totalPriceCents: 15000,
      status: 'completed',
    });

    const report = buildExecutiveReport({
      ...base,
      bookings: [uncollectedBooking, zeroDurationBooking],
      paymentSplits: [],
      reviews: [],
      period: '7d',
    });

    expect(report.summary.totalRevenueCollectedCents).toBe(0);
    expect(report.summary.averageTicketCents).toBe(0);
    expect(report.heatmap.totalBookings).toBe(0);

    const pedispaRow = report.serviceProfitability.find(
      (r) => r.serviceId === 'srv-pedispa',
    );
    const gelRow = report.serviceProfitability.find((r) => r.serviceId === 'srv-gel');

    expect(pedispaRow?.revenueCents).toBe(54000);
    expect(pedispaRow?.revenuePerMinuteCents).toBe(600);
    expect(gelRow?.revenuePerMinuteCents).toBe(0);
  });

  it('returns completely empty metrics when scopeStaffId matches no staff member', () => {
    const report = buildExecutiveReport({
      ...makeBaseInput(),
      period: 'all',
      scopeStaffId: 'staff-nonexistent',
    });

    expect(report.specialistOccupancy).toEqual([]);
    expect(report.summary.totalBookings).toBe(0);
    expect(report.summary.totalRevenueCollectedCents).toBe(0);
    expect(report.summary.totalTipsCents).toBe(0);
    expect(report.summary.reviewsCount).toBe(0);
    expect(report.heatmap.totalBookings).toBe(0);
    expect(report.serviceProfitability).toEqual([]);
    expect(report.cancellationReasons).toEqual([]);
  });

  it('computes unique-session booking funnel stages and respects period windows', () => {
    const events: FunnelEventRecord[] = [
      {
        id: 'fe-1',
        sessionId: 'sess-a',
        eventType: 'page_view',
        serviceSlug: null,
        staffSlug: null,
        createdAt: '2026-05-14T15:00:00.000Z',
      },
      {
        id: 'fe-2',
        sessionId: 'sess-a',
        eventType: 'page_view',
        serviceSlug: null,
        staffSlug: null,
        createdAt: '2026-05-14T15:01:00.000Z',
      },
      {
        id: 'fe-3',
        sessionId: 'sess-a',
        eventType: 'booking_started',
        serviceSlug: 'rubber',
        staffSlug: null,
        createdAt: '2026-05-14T15:02:00.000Z',
      },
      {
        id: 'fe-4',
        sessionId: 'sess-a',
        eventType: 'slot_held',
        serviceSlug: 'rubber',
        staffSlug: 'karla',
        createdAt: '2026-05-14T15:03:00.000Z',
      },
      {
        id: 'fe-5',
        sessionId: 'sess-a',
        eventType: 'details_completed',
        serviceSlug: 'rubber',
        staffSlug: 'karla',
        createdAt: '2026-05-14T15:04:00.000Z',
      },
      {
        id: 'fe-6',
        sessionId: 'sess-a',
        eventType: 'booking_confirmed',
        serviceSlug: 'rubber',
        staffSlug: 'karla',
        createdAt: '2026-05-14T15:05:00.000Z',
      },
      {
        id: 'fe-7',
        sessionId: 'sess-b',
        eventType: 'page_view',
        serviceSlug: null,
        staffSlug: null,
        createdAt: '2026-05-14T16:00:00.000Z',
      },
      {
        id: 'fe-8',
        sessionId: 'sess-b',
        eventType: 'booking_started',
        serviceSlug: 'rubber',
        staffSlug: null,
        createdAt: '2026-05-14T16:01:00.000Z',
      },
      {
        id: 'fe-old',
        sessionId: 'sess-old',
        eventType: 'page_view',
        serviceSlug: null,
        staffSlug: null,
        createdAt: '2026-03-01T15:00:00.000Z',
      },
    ];

    const summary7d = buildFunnelSummary(events, '7d', NOW_MS, TZ);
    expect(summary7d.totalSessions).toBe(2);
    expect(summary7d.confirmedSessions).toBe(1);
    expect(summary7d.overallConversionPercent).toBe(50);
    expect(summary7d.stages.find((s) => s.eventType === 'page_view')?.sessionsCount).toBe(2);
    expect(summary7d.stages.find((s) => s.eventType === 'slot_held')?.sessionsCount).toBe(1);
    expect(summary7d.stages.find((s) => s.eventType === 'slot_held')?.stepConversionPercent).toBe(50);

    const summaryAll = buildFunnelSummary(events, 'all', NOW_MS, TZ);
    expect(summaryAll.totalSessions).toBe(3);
    expect(summaryAll.overallConversionPercent).toBe(33);
  });

  it('supports unified periods (today, month, last_month, custom) and reconciles cashEntries via computeBookingBalance + computeCashPeriodSummary', () => {
    const base = makeBaseInput();
    const depositOnlyBooking = makeBooking({
      id: 'bk-today-deposit',
      serviceId: 'srv-rubber',
      staffId: 'staff-karla',
      clientId: 'cli-sofia',
      startAt: '2026-05-15T17:00:00.000Z',
      endAt: '2026-05-15T19:00:00.000Z',
      totalDurationMinutes: 120,
      totalPriceCents: 35000,
      depositAmountCents: 20000,
      status: 'confirmed',
    });
    const cashEntries: CashRegisterEntry[] = [
      {
        id: 'ce-deposit-today',
        bookingId: 'bk-today-deposit',
        staffId: 'staff-karla',
        entryType: 'deposit',
        description: 'Anticipo SPEI',
        amountCents: 20000,
        tipCents: 0,
        commissionCents: 0,
        paymentMethod: 'transfer',
        recordedBy: 'Karla',
        occurredAt: '2026-05-15T15:00:00.000Z',
      },
      {
        id: 'ce-expense-today',
        bookingId: null,
        staffId: null,
        entryType: 'expense',
        description: 'Insumos',
        amountCents: 5000,
        tipCents: 0,
        commissionCents: 0,
        paymentMethod: 'cash',
        recordedBy: 'Karla',
        occurredAt: '2026-05-15T16:00:00.000Z',
      },
    ];

    const todayReport = buildExecutiveReport({
      ...base,
      bookings: [...base.bookings, depositOnlyBooking],
      cashEntries,
      period: 'today',
    });
    expect(todayReport.periodLabel).toBe('Hoy');
    expect(todayReport.rangeStartDate).toBe('2026-05-15');
    expect(todayReport.rangeEndDate).toBe('2026-05-15');
    expect(todayReport.summary.totalBookings).toBe(1);
    expect(todayReport.summary.totalRevenueCollectedCents).toBe(20000);
    expect(todayReport.cashSummary.collectedCents).toBe(20000);
    expect(todayReport.cashSummary.expensesCents).toBe(5000);
    expect(todayReport.cashSummary.netCents).toBe(15000);

    const monthReport = buildExecutiveReport({ ...base, period: 'month' });
    expect(monthReport.periodLabel).toBe('Este mes');
    expect(monthReport.rangeStartDate).toBe('2026-05-01');
    expect(monthReport.rangeEndDate).toBe('2026-05-15');
    expect(monthReport.summary.totalBookings).toBe(4);
    expect(monthReport.summary.totalRevenueCollectedCents).toBe(89000);

    const lastMonthReport = buildExecutiveReport({ ...base, period: 'last_month' });
    expect(lastMonthReport.periodLabel).toBe('Mes pasado');
    expect(lastMonthReport.rangeStartDate).toBe('2026-04-01');
    expect(lastMonthReport.rangeEndDate).toBe('2026-04-30');
    expect(lastMonthReport.summary.totalBookings).toBe(2);
    expect(lastMonthReport.summary.totalRevenueCollectedCents).toBe(54000);

    const customReport = buildExecutiveReport({
      ...base,
      period: 'custom',
      customRange: { fromKey: '2026-04-20', toKey: '2026-04-30' },
    });
    expect(customReport.rangeStartDate).toBe('2026-04-20');
    expect(customReport.rangeEndDate).toBe('2026-04-30');
    expect(customReport.summary.totalBookings).toBe(1);
    expect(customReport.summary.totalRevenueCollectedCents).toBe(36000);
  });
});
