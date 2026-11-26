import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import type { BookingWithRelations } from '@/lib/types';
import {
  ADMIN_CACHE_KEYS,
  applyOptimisticBookingStatus,
  applyOptimisticBookingStatusToList,
  clearAdminCacheForTests,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  mutateAdminCache,
  prefetchAdminData,
  setAdminCacheScope,
} from './useAdminCache';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeMockBooking(
  id: string,
  status: BookingWithRelations['status'],
  startAt = '2026-11-26T16:00:00.000Z',
): BookingWithRelations {
  return {
    id,
    bookingCode: `NL-${id}`,
    manageToken: `tok-${id}`,
    idempotencyKey: null,
    clientId: `client-${id}`,
    serviceId: 'srv-rubber',
    extraServiceIds: [],
    staffId: 'karla',
    startAt,
    endAt: '2026-11-26T17:30:00.000Z',
    occupiedStartAt: startAt,
    occupiedEndAt: '2026-11-26T17:30:00.000Z',
    totalDurationMinutes: 90,
    subtotalCents: 35000,
    discountCents: 0,
    totalPriceCents: 35000,
    depositAmountCents: 20000,
    couponCode: null,
    status,
    source: 'web',
    clientNotes: '',
    internalNotes: '',
    clientInstagram: '@sofia',
    inspoPhotoUrl: null,
    paymentProofUrl: null,
    proofDeliveryMethod: 'instagram_dm',
    googleEventId: null,
    cancellationReason: null,
    rescheduledFromId: null,
    noShowPolicyEnforced: false,
    createdAt: '2026-11-20T16:00:00.000Z',
    updatedAt: '2026-11-20T16:00:00.000Z',
    client: {
      id: `client-${id}`,
      fullName: 'Sofía Ramírez',
      phoneE164: '+522224123987',
      email: null,
      instagramHandle: '@sofia',
      birthday: null,
      notes: '',
      noShowCount: 0,
      createdAt: '2026-11-20T16:00:00.000Z',
      updatedAt: '2026-11-20T16:00:00.000Z',
    },
    service: {
      id: 'srv-rubber',
      categoryId: 'cat-1',
      name: 'Rubber',
      slug: 'rubber',
      description: '',
      durationMinutes: 90,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceCents: 35000,
      isStartingPrice: false,
      requiresConfirmation: true,
      depositRequired: true,
      depositAmountCents: 20000,
      allowInspoPhoto: true,
      imageUrl: '/landing/rubber.webp',
      isActive: true,
      isFeatured: true,
      isPrivate: false,
      displayOrder: 1,
    },
    staff: {
      id: 'karla',
      name: 'Karla',
      bookingSlug: 'karla',
      roleTitle: 'Nail Artist',
      bio: '',
      avatarUrl: '/landing/karla.webp',
      serviceIds: ['srv-rubber'],
      commissionPercent: 40,
      isActive: true,
      displayOrder: 1,
    },
    addons: [],
  };
}

function makeMockOverview(bookings: BookingWithRelations[]): AdminOverviewPayload {
  const pending = bookings.filter(
    (b) => b.status === 'pending_confirmation' || b.status === 'pending_payment',
  );
  return {
    session: {
      user: {
        id: 'admin-owner',
        email: 'duena@nails.studio',
        fullName: 'Karla',
        role: 'owner',
        staffMemberId: null,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      isDemo: true,
    },
    integration: {
      mode: 'demo',
      appUrl: 'http://localhost:1717',
      supabaseConfigured: false,
      r2Configured: false,
      googleCalendarConfigured: false,
      resendConfigured: false,
      whatsappCloudConfigured: false,
      twilioSmsConfigured: false,
      stripeConfigured: false,
      mercadoPagoConfigured: false,
    },
    serverNowIso: '2026-11-26T15:00:00.000Z',
    serverTodayKey: '2026-11-26',
    settings: {
      id: 'default',
      name: 'LAIKONA NAILS',
      tagline: 'by Karla',
      description: '',
      logoUrl: null,
      coverImageUrl: null,
      address: 'Puebla',
      mapsUrl: 'https://maps.google.com',
      instagramHandle: '@laikona.nailsss',
      whatsappNumber: '+522221234567',
      contactEmail: 'hola@laikona.example',
      timezone: 'America/Mexico_City',
      currency: 'MXN',
      brandAccentLight: '#9A2B45',
      brandAccentDark: '#E4899D',
      defaultPublicMode: 'light',
      defaultAdminMode: 'light',
      cornerStyle: 'soft',
      publicPalette: 'laikona',
      defaultBookingLayout: 'month',
      enabledBookingLayouts: ['month', 'week'],
      lockTimezone: true,
      slotIntervalMinutes: 30,
      enableSlotHold: true,
      slotHoldMinutes: 5,
      minBookingNoticeMinutes: 60,
      maxBookingDaysAhead: 60,
      minCancelHours: 12,
      minRescheduleHours: 12,
      cancellationPolicyText: '',
      bookingInstructionsText: '',
      paymentMode: 'manual_transfer',
      depositBankName: 'Mercado Pago',
      depositAccountHolder: 'Karla',
      depositClabe: '7229',
      depositAmountCents: 20000,
      depositInstructions: '',
      onboardingCompleted: true,
      landingContent: {
        heroEyebrow: '',
        heroTitle: '',
        heroSubtitle: '',
        aboutTitle: '',
        aboutBody: '',
      },
      whatsappBookingEnabled: true,
      smsRemindersEnabled: false,
      metaPixelId: null,
      ga4MeasurementId: null,
      googleReviewUrl: null,
      defaultCommissionPercent: 40,
      updatedAt: '2026-11-20T16:00:00.000Z',
    },
    kpis: {
      todayBookingsCount: bookings.filter((b) => b.status !== 'canceled').length,
      pendingConfirmationsCount: pending.length,
      totalRevenueCents: 100000,
      totalTipsCents: 5000,
      totalExpensesCents: 0,
      netCashCents: 100000,
      lowStockCount: 0,
      waitlistCount: 0,
      noShowRatePercent: 0,
      avgRating: 5,
      reviewsCount: 1,
    },
    onboardingChecklist: {
      completedCount: 6,
      totalCount: 6,
      steps: [],
    },
    pendingDeposits: pending.map((b) => ({
      bookingId: b.id,
      bookingCode: b.bookingCode,
      status: b.status,
      clientId: b.clientId,
      clientName: b.client.fullName,
      clientPhone: b.client.phoneE164,
      clientInstagram: b.clientInstagram ?? null,
      serviceName: b.service.name,
      staffId: b.staffId,
      staffName: b.staff.name,
      startAt: b.startAt,
      depositAmountCents: b.depositAmountCents,
      totalPriceCents: b.totalPriceCents,
      proofDeliveryMethod: 'instagram_dm',
      paymentProofUrl: null,
    })),
    retention: { returningClientsCount: 1, inactiveClients: [] },
    uncollectedBookings: [
      {
        bookingId: bookings[0]?.id ?? 'bk-1',
        bookingCode: bookings[0]?.bookingCode ?? 'NL-bk-1',
        status: bookings[0]?.status ?? 'confirmed',
        clientId: 'client-1',
        clientName: 'Sofía Ramírez',
        clientPhone: '+522224123987',
        clientInstagram: '@sofia',
        serviceName: 'Rubber',
        staffId: 'karla',
        staffName: 'Karla',
        startAt: '2026-11-26T16:00:00.000Z',
        endAt: '2026-11-26T17:30:00.000Z',
        totalPriceCents: 35000,
        paidCents: 20000,
        remainingCents: 15000,
      },
    ],
    nearRewardClients: [],
    paymentSplits: [],
    recurringBlocks: [],
    loyaltyProgram: null,
    loyaltyStamps: [],
    recentAuditLogs: [],
    bookings,
    services: [],
    categories: [],
    addons: [],
    staff: [],
    adminUsers: [],
    schedules: [],
    dateOverrides: [],
    calendarConnections: [],
    clients: [],
    workflows: [],
    notifications: [],
    gallery: [],
    coupons: [],
    waitlist: [],
    reviews: [],
    inventory: [],
    inventoryMovements: [],
    cashEntries: [],
  };
}

afterEach(() => {
  clearAdminCacheForTests();
  vi.useRealTimers();
});

describe('useAdminCache store', () => {
  it('serves cached snapshot synchronously after prefetch and deduplicates in-flight fetches', async () => {
    setAdminCacheScope('owner-1:owner');
    const deferred = createDeferred<{ count: number }>();
    const fetcher = vi.fn((_signal: AbortSignal) => deferred.promise);

    const p1 = prefetchAdminData(ADMIN_CACHE_KEYS.reports('30d'), fetcher);
    const p2 = prefetchAdminData(ADMIN_CACHE_KEYS.reports('30d'), fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.reports('30d'))).toBeUndefined();

    deferred.resolve({ count: 42 });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual({ count: 42 });
    expect(r2).toEqual({ count: 42 });
    expect(getAdminCacheSnapshot<{ count: number }>(ADMIN_CACHE_KEYS.reports('30d'))).toEqual({
      count: 42,
    });

    const r3 = await prefetchAdminData(ADMIN_CACHE_KEYS.reports('30d'), fetcher, {
      staleTimeMs: 10_000,
    });
    expect(r3).toEqual({ count: 42 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('revalidates stale cache in background while preserving synchronous cached snapshot', async () => {
    vi.useFakeTimers();
    setAdminCacheScope('owner-1:owner');

    await prefetchAdminData(
      ADMIN_CACHE_KEYS.clients,
      async () => ({ clients: ['Sofía'] }),
      { staleTimeMs: 5_000 },
    );
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.clients)).toEqual({
      clients: ['Sofía'],
    });

    vi.advanceTimersByTime(6_000);
    const refreshDeferred = createDeferred<{ clients: string[] }>();
    const refreshPromise = prefetchAdminData(
      ADMIN_CACHE_KEYS.clients,
      () => refreshDeferred.promise,
      { staleTimeMs: 5_000 },
    );

    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.clients)).toEqual({
      clients: ['Sofía'],
    });

    refreshDeferred.resolve({ clients: ['Sofía', 'Andrea'] });
    await refreshPromise;

    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.clients)).toEqual({
      clients: ['Sofía', 'Andrea'],
    });
  });

  it('supports optimistic mutateAdminCache and exact rollback on API error', () => {
    setAdminCacheScope('owner-1:owner');
    const pendingBooking = makeMockBooking('bk-1044', 'pending_confirmation');
    const confirmedBooking = makeMockBooking('bk-1042', 'confirmed');
    const initialOverview = makeMockOverview([pendingBooking, confirmedBooking]);

    mutateAdminCache(ADMIN_CACHE_KEYS.overview, initialOverview);
    mutateAdminCache(ADMIN_CACHE_KEYS.bookings, { bookings: initialOverview.bookings });

    const prevOverview = getAdminCacheSnapshot<AdminOverviewPayload>(
      ADMIN_CACHE_KEYS.overview,
    );
    const prevBookings = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
    );

    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (prev) =>
      prev ? applyOptimisticBookingStatus(prev, 'bk-1044', 'confirmed') : prev,
    );
    mutateAdminCache<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
      (prev) =>
        prev ? applyOptimisticBookingStatusToList(prev, 'bk-1044', 'confirmed') : prev,
    );

    const optimistic = getAdminCacheSnapshot<AdminOverviewPayload>(
      ADMIN_CACHE_KEYS.overview,
    );
    expect(optimistic?.pendingDeposits).toHaveLength(0);
    expect(optimistic?.kpis.pendingConfirmationsCount).toBe(0);
    expect(optimistic?.bookings.find((b) => b.id === 'bk-1044')?.status).toBe('confirmed');

    const optimisticList = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
    );
    expect(optimisticList?.bookings.find((b) => b.id === 'bk-1044')?.status).toBe(
      'confirmed',
    );

    mutateAdminCache(ADMIN_CACHE_KEYS.overview, () => prevOverview);
    mutateAdminCache(ADMIN_CACHE_KEYS.bookings, () => prevBookings);

    const rolledBack = getAdminCacheSnapshot<AdminOverviewPayload>(
      ADMIN_CACHE_KEYS.overview,
    );
    expect(rolledBack?.pendingDeposits).toHaveLength(1);
    expect(rolledBack?.kpis.pendingConfirmationsCount).toBe(1);
    expect(rolledBack?.bookings.find((b) => b.id === 'bk-1044')?.status).toBe(
      'pending_confirmation',
    );
  });

  it('invalidates keys strictly by prefix without evicting unrelated keys', () => {
    setAdminCacheScope('owner-1:owner');
    mutateAdminCache(ADMIN_CACHE_KEYS.reports('7d'), { period: '7d' });
    mutateAdminCache(ADMIN_CACHE_KEYS.reports('30d'), { period: '30d' });
    mutateAdminCache(ADMIN_CACHE_KEYS.clients, { clients: ['Sofía'] });

    invalidateAdminCache('/api/admin/reports');

    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.reports('7d'))).toBeUndefined();
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.reports('30d'))).toBeUndefined();
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.clients)).toEqual({
      clients: ['Sofía'],
    });
  });

  it('preserves pre-seeded entries on initial null-to-scope bootstrap without aborting', () => {
    mutateAdminCache(ADMIN_CACHE_KEYS.overview, { seeded: true });
    setAdminCacheScope('owner-1:owner');
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.overview)).toEqual({ seeded: true });
  });

  it('purges all cached data and aborts in-flight requests on role switch or logout', async () => {
    setAdminCacheScope('owner-1:owner');
    mutateAdminCache(ADMIN_CACHE_KEYS.overview, { scope: 'owner-secret' });
    mutateAdminCache(ADMIN_CACHE_KEYS.reports('30d'), { scope: 'studio' });

    const signals: AbortSignal[] = [];
    const ownerDeferred = createDeferred<{ scope: string }>();
    const inflightPromise = prefetchAdminData('/api/admin/clients', (signal) => {
      signals.push(signal);
      return ownerDeferred.promise;
    });

    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);

    setAdminCacheScope('spec-tere:specialist');

    expect(signals[0]?.aborted).toBe(true);
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.overview)).toBeUndefined();
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.reports('30d'))).toBeUndefined();

    ownerDeferred.resolve({ scope: 'stale-owner-data' });
    await inflightPromise;
    expect(getAdminCacheSnapshot('/api/admin/clients')).toBeUndefined();

    mutateAdminCache(ADMIN_CACHE_KEYS.reports('30d'), { scope: 'specialist' });
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.reports('30d'))).toEqual({
      scope: 'specialist',
    });

    setAdminCacheScope(null);
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.reports('30d'))).toBeUndefined();
  });

  it('swallows prefetch errors cleanly and preserves prior cached data', async () => {
    vi.useFakeTimers();
    setAdminCacheScope('owner-1:owner');
    mutateAdminCache(ADMIN_CACHE_KEYS.packages, { servicePackages: ['Rubber 4'] });
    vi.advanceTimersByTime(10_000);

    const result = await prefetchAdminData(
      ADMIN_CACHE_KEYS.packages,
      async () => {
        throw new Error('Network offline');
      },
      { staleTimeMs: 5_000 },
    );

    expect(result).toBeUndefined();
    expect(getAdminCacheSnapshot(ADMIN_CACHE_KEYS.packages)).toEqual({
      servicePackages: ['Rubber 4'],
    });
  });

  it('updates KPIs and uncollected list cleanly when canceling or marking no_show', () => {
    const bk1 = makeMockBooking('bk-1', 'confirmed');
    const bk2 = makeMockBooking('bk-2', 'completed');
    const overview = makeMockOverview([bk1, bk2]);

    const afterNoShow = applyOptimisticBookingStatus(overview, 'bk-1', 'no_show');
    expect(afterNoShow.uncollectedBookings).toHaveLength(0);
    expect(afterNoShow.kpis.noShowRatePercent).toBe(50);

    const afterCancel = applyOptimisticBookingStatus(overview, 'bk-1', 'canceled');
    expect(afterCancel.uncollectedBookings).toHaveLength(0);
    expect(afterCancel.kpis.todayBookingsCount).toBe(1);
  });
});
