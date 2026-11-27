import { describe, expect, it } from 'vitest';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { BookingWithRelations, ClientProfile, Service, StaffMember } from '@/lib/types';
import type { ClientPackageRow } from './clientasTypes';
import {
  buildClientNewBookingUrl,
  computeClientDirectoryKpis,
  computeClientMetricsMap,
  filterAndSortClients,
} from './clientasMetrics';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

const BASE_SERVICE: Service = {
  id: 'srv-1',
  categoryId: 'cat-gel',
  slug: 'gel-rubber',
  name: 'Rubber Gel',
  description: '',
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
  priceCents: 60000,
  requiresConfirmation: false,
  depositRequired: false,
  depositAmountCents: 0,
  allowInspoPhoto: true,
  isActive: true,
  isFeatured: false,
  displayOrder: 1,
  imageUrl: null,
};

const STAFF_ANA: StaffMember = {
  id: 'stf-1',
  name: 'Ana',
  roleTitle: 'Nail Artist',
  bio: '',
  avatarUrl: null,
  bookingSlug: 'ana',
  isActive: true,
  displayOrder: 1,
  commissionPercent: 40,
  serviceIds: ['srv-1'],
};

const STAFF_LUZ: StaffMember = {
  ...STAFF_ANA,
  id: 'stf-2',
  bookingSlug: 'luz',
  name: 'Luz',
};

function makeClient(overrides: Partial<ClientProfile> & { id: string; fullName: string }): ClientProfile {
  return {
    phoneE164: '+522221112233',
    email: null,
    instagramHandle: undefined,
    birthday: null,
    notes: '',
    noShowCount: 0,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeBooking(
  client: ClientProfile,
  overrides: Partial<BookingWithRelations> & { id: string; startAt: string },
): BookingWithRelations {
  return {
    bookingCode: `LN-${overrides.id}`,
    manageToken: `tok-${overrides.id}`,
    idempotencyKey: null,
    serviceId: BASE_SERVICE.id,
    staffId: STAFF_ANA.id,
    clientId: client.id,
    endAt: overrides.startAt,
    occupiedStartAt: overrides.startAt,
    occupiedEndAt: overrides.startAt,
    totalDurationMinutes: 60,
    subtotalCents: 60000,
    discountCents: 0,
    totalPriceCents: 60000,
    depositAmountCents: 0,
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
    createdAt: overrides.startAt,
    updatedAt: overrides.startAt,
    service: BASE_SERVICE,
    staff: STAFF_ANA,
    client,
    ...overrides,
  };
}

function makeLoyalty(overrides: Partial<LoyaltySummary>): LoyaltySummary {
  return {
    programName: 'Sellos',
    stampsRequired: 6,
    currentStamps: 0,
    remainingForReward: 6,
    isRewardReady: false,
    isNearReward: false,
    totalStamps: 0,
    redemptionsAvailable: 0,
    rewardLabel: 'Diseño gratis',
    ...overrides,
  };
}

function makeActivePkg(clientId: string, remainingSessions: number): ClientPackageRow {
  return {
    id: `pkg-${clientId}`,
    clientId,
    packageId: 'cat-1',
    packageName: 'Paquete Retoque x4',
    serviceId: BASE_SERVICE.id,
    totalSessions: 4,
    usedSessions: 4 - remainingSessions,
    purchasedAt: '2026-10-01T12:00:00.000Z',
    expiresAt: null,
    status: 'active',
    notes: '',
    clientName: 'Clienta',
    serviceName: BASE_SERVICE.name,
    remainingSessions,
    isExpired: false,
  };
}

describe('clientasMetrics', () => {
  const nowMs = Date.parse('2026-11-27T18:00:00.000Z');

  it('computes LTV, average ticket, usual staff, last visit, VIP, and alerts accurately', () => {
    const sofia = makeClient({
      id: 'c-sofia',
      fullName: 'Sofía Ramírez',
      birthday: '1997-11-15',
      notes: '[Ficha técnica] Forma: Almendra · Base: Rubber · Alertas: Cutícula sensible\n\nLe gusta milky white',
    });
    const valeria = makeClient({
      id: 'c-valeria',
      fullName: 'Valeria Cruz',
      phoneE164: '+522229998877',
      noShowCount: 2,
    });
    const bookings = [
      makeBooking(sofia, {
        id: 'b1',
        startAt: '2026-10-01T16:00:00.000Z',
        totalPriceCents: 55000,
        staffId: STAFF_ANA.id,
        staff: STAFF_ANA,
      }),
      makeBooking(sofia, {
        id: 'b2',
        startAt: '2026-10-20T16:00:00.000Z',
        totalPriceCents: 65000,
        staffId: STAFF_LUZ.id,
        staff: STAFF_LUZ,
      }),
      makeBooking(sofia, {
        id: 'b3',
        startAt: '2026-11-20T16:00:00.000Z',
        totalPriceCents: 75000,
        staffId: STAFF_ANA.id,
        staff: STAFF_ANA,
      }),
      makeBooking(sofia, {
        id: 'b4',
        startAt: '2026-12-05T16:00:00.000Z',
        status: 'confirmed',
        totalPriceCents: 90000,
        staffId: STAFF_LUZ.id,
        staff: STAFF_LUZ,
      }),
      makeBooking(sofia, {
        id: 'b5',
        startAt: '2026-11-01T16:00:00.000Z',
        status: 'canceled',
        totalPriceCents: 99000,
      }),
      makeBooking(valeria, {
        id: 'b6',
        startAt: '2026-09-01T16:00:00.000Z',
        status: 'completed',
        totalPriceCents: 40000,
      }),
    ];

    const metricsMap = computeClientMetricsMap({
      clients: [sofia, valeria],
      bookings,
      clientPackagesByClientId: new Map([['c-sofia', [makeActivePkg('c-sofia', 2)]]]),
      loyaltyByClientId: new Map([
        ['c-valeria', makeLoyalty({ currentStamps: 5, remainingForReward: 1 })],
      ]),
      noShowStatsByClient: new Map(),
      noShowThreshold: 2,
      currentMonth: '11',
      nowMs,
      inactiveDaysThreshold: 30,
    });

    const sofiaMetrics = metricsMap.get('c-sofia');
    expect(sofiaMetrics).toBeDefined();
    expect(sofiaMetrics?.totalSpentCents).toBe(195000);
    expect(sofiaMetrics?.completedVisits).toBe(3);
    expect(sofiaMetrics?.nonCanceledVisits).toBe(4);
    expect(sofiaMetrics?.avgTicketCents).toBe(65000);
    expect(sofiaMetrics?.usualStaffId).toBe('stf-2');
    expect(sofiaMetrics?.usualStaffName).toBe('Luz');
    expect(sofiaMetrics?.lastVisitAt).toBe('2026-11-20T16:00:00.000Z');
    expect(sofiaMetrics?.daysSinceLastVisit).toBe(7);
    expect(sofiaMetrics?.isInactive).toBe(false);
    expect(sofiaMetrics?.isVip).toBe(true);
    expect(sofiaMetrics?.hasActivePackage).toBe(true);
    expect(sofiaMetrics?.activePackageSessions).toBe(2);
    expect(sofiaMetrics?.hasBirthdayThisMonth).toBe(true);
    expect(sofiaMetrics?.hasTechAlert).toBe(true);
    expect(sofiaMetrics?.hasAnyAlert).toBe(true);

    const valeriaMetrics = metricsMap.get('c-valeria');
    expect(valeriaMetrics?.totalSpentCents).toBe(40000);
    expect(valeriaMetrics?.isVip).toBe(false);
    expect(valeriaMetrics?.isNearReward).toBe(true);
    expect(valeriaMetrics?.hasNoShowAlert).toBe(true);
    expect(valeriaMetrics?.isInactive).toBe(true);

    const kpis = computeClientDirectoryKpis([sofia, valeria], metricsMap);
    expect(kpis).toEqual({
      totalClients: 2,
      vipClients: 1,
      packageOrRewardClients: 2,
      alertOrInactiveClients: 2,
    });
  });

  it('filters by chips, accent-insensitive query, and sorts cleanly', () => {
    const ana = makeClient({
      id: 'c-ana',
      fullName: 'Ana López',
      notes: '[Ficha técnica] Forma: Almendra · Base: Acrílico',
    });
    const sofia = makeClient({
      id: 'c-sofia',
      fullName: 'Sofía Méndez',
      phoneE164: '+522227776655',
      birthday: '1999-11-10',
    });
    const bookings = [
      makeBooking(ana, { id: 'a1', startAt: '2026-11-10T16:00:00.000Z', totalPriceCents: 180000 }),
      makeBooking(sofia, { id: 's1', startAt: '2026-11-25T16:00:00.000Z', totalPriceCents: 50000 }),
      makeBooking(sofia, { id: 's2', startAt: '2026-11-26T16:00:00.000Z', totalPriceCents: 50000 }),
    ];

    const metricsMap = computeClientMetricsMap({
      clients: [sofia, ana],
      bookings,
      clientPackagesByClientId: new Map(),
      loyaltyByClientId: new Map(),
      noShowStatsByClient: new Map(),
      noShowThreshold: 2,
      currentMonth: '11',
      nowMs,
    });

    expect(
      filterAndSortClients({
        clients: [sofia, ana],
        metricsByClientId: metricsMap,
        query: 'acrilico',
        filter: 'all',
        sort: 'alpha',
      }).map((c) => c.id),
    ).toEqual(['c-ana']);

    expect(
      filterAndSortClients({
        clients: [sofia, ana],
        metricsByClientId: metricsMap,
        query: '',
        filter: 'all',
        sort: 'spent',
      }).map((c) => c.id),
    ).toEqual(['c-ana', 'c-sofia']);

    expect(
      filterAndSortClients({
        clients: [sofia, ana],
        metricsByClientId: metricsMap,
        query: '',
        filter: 'all',
        sort: 'visits',
      }).map((c) => c.id),
    ).toEqual(['c-sofia', 'c-ana']);

    expect(
      filterAndSortClients({
        clients: [sofia, ana],
        metricsByClientId: metricsMap,
        query: '',
        filter: 'birthday',
        sort: 'last_visit',
      }).map((c) => c.id),
    ).toEqual(['c-sofia']);
  });

  it('builds prefilled /admin/citas booking URL with encoded client params', () => {
    const url = buildClientNewBookingUrl({
      fullName: 'Sofía Ramírez',
      phoneE164: '+522221234567',
      usualStaffId: 'stf-1',
      instagramHandle: '@sofi.nails',
    });
    expect(url).toBe(
      '/admin/citas?new=1&clientName=Sof%C3%ADa+Ram%C3%ADrez&clientPhone=%2B522221234567&clientInstagram=%40sofi.nails&staffId=stf-1',
    );
  });
});
