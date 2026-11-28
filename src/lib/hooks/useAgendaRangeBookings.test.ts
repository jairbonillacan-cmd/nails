import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
} from '@/lib/types';
import { AdminFetchError, fetchAdminJson } from './useAdminCache';
import {
  buildAgendaBookingsRangeUrl,
  computeAgendaFetchWindow,
  mergeAgendaRangeData,
} from './useAgendaRangeBookings';

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeBookingStub(
  id: string,
  status: BookingWithRelations['status'],
  updatedAt = '2026-11-20T12:00:00.000Z',
): BookingWithRelations {
  return {
    id,
    bookingCode: `LK-${id}`,
    manageToken: `tok-${id}`,
    idempotencyKey: null,
    serviceId: 'svc-1',
    staffId: 'staff-1',
    clientId: 'client-1',
    startAt: '2026-11-27T16:00:00.000Z',
    endAt: '2026-11-27T17:00:00.000Z',
    occupiedStartAt: '2026-11-27T16:00:00.000Z',
    occupiedEndAt: '2026-11-27T17:00:00.000Z',
    totalDurationMinutes: 60,
    subtotalCents: 50000,
    discountCents: 0,
    totalPriceCents: 50000,
    depositAmountCents: 15000,
    couponCode: null,
    status,
    source: 'web',
    clientNotes: '',
    internalNotes: '',
    inspoPhotoUrl: null,
    paymentProofUrl: null,
    googleEventId: null,
    cancellationReason: null,
    rescheduledFromId: null,
    addons: [],
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt,
    client: {
      id: 'client-1',
      fullName: 'Sofía Ramírez',
      phoneE164: '+522224123987',
      email: null,
      birthday: null,
      notes: '',
      noShowCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    staff: {
      id: 'staff-1',
      name: 'Karla',
      roleTitle: 'Nail Artist',
      bio: '',
      avatarUrl: null,
      bookingSlug: 'karla',
      commissionPercent: 40,
      isActive: true,
      displayOrder: 0,
      serviceIds: ['svc-1'],
    },
    service: {
      id: 'svc-1',
      categoryId: null,
      name: 'Rubber',
      slug: 'rubber',
      description: '',
      durationMinutes: 60,
      priceCents: 50000,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      requiresConfirmation: false,
      depositRequired: true,
      depositAmountCents: 20000,
      allowInspoPhoto: false,
      isActive: true,
      isFeatured: false,
      displayOrder: 0,
      imageUrl: null,
    },
  };
}

describe('useAgendaRangeBookings helpers', () => {
  it('computes bounded calendar windows for day, week, and list views across month boundaries', () => {
    expect(computeAgendaFetchWindow('day', '2026-11-30')).toEqual({
      from: '2026-11-27',
      to: '2026-12-03',
    });
    expect(computeAgendaFetchWindow('week', '2026-11-27')).toEqual({
      from: '2026-11-27',
      to: '2026-12-03',
    });
    expect(computeAgendaFetchWindow('list', '2026-12-02')).toEqual({
      from: '2026-11-25',
      to: '2026-12-09',
    });
    expect(computeAgendaFetchWindow('day', 'invalid')).toBeNull();
  });

  it('builds range query URLs omitting staff when all', () => {
    expect(
      buildAgendaBookingsRangeUrl({
        from: '2026-11-24',
        to: '2026-11-30',
        staffFilter: 'all',
      }),
    ).toBe('/api/admin/bookings?from=2026-11-24&to=2026-11-30');

    expect(
      buildAgendaBookingsRangeUrl({
        from: '2026-11-24',
        to: '2026-11-30',
        staffFilter: 'staff-karla',
      }),
    ).toBe('/api/admin/bookings?from=2026-11-24&to=2026-11-30&staff=staff-karla');
  });

  it('prefers strictly newer updatedAt rows and prevents stale rangeData from clobbering fresher overview', () => {
    const overviewBookings = [
      makeBookingStub('bk-newer-in-range', 'confirmed', '2026-11-27T12:00:00.000Z'),
      makeBookingStub('bk-fresher-in-overview', 'completed', '2026-11-27T18:30:00.000Z'),
      makeBookingStub('bk-equal-optimistic', 'canceled', '2026-11-27T14:00:00.000Z'),
      makeBookingStub('bk-outside', 'pending_confirmation', '2026-11-27T10:00:00.000Z'),
    ];
    const rangeBookings = [
      makeBookingStub('bk-newer-in-range', 'completed', '2026-11-27T15:00:00.000Z'),
      makeBookingStub('bk-fresher-in-overview', 'confirmed', '2026-11-27T18:00:00.000Z'),
      makeBookingStub('bk-equal-optimistic', 'confirmed', '2026-11-27T14:00:00.000Z'),
      makeBookingStub('bk-distant', 'confirmed', '2026-12-20T12:00:00.000Z'),
    ];
    const overviewSplit: PaymentSplit = {
      id: 'sp-1',
      bookingId: 'bk-fresher-in-overview',
      method: 'cash',
      amountCents: 50000,
      tipCents: 0,
      tipStaffId: null,
      createdAt: '2026-11-27T17:00:00.000Z',
    };
    const staleRangeSplit: PaymentSplit = {
      ...overviewSplit,
      amountCents: 20000,
    };
    const distantRangeSplit: PaymentSplit = {
      id: 'sp-distant',
      bookingId: 'bk-distant',
      method: 'card',
      amountCents: 30000,
      tipCents: 0,
      tipStaffId: null,
      createdAt: '2026-12-20T17:00:00.000Z',
    };
    const rangeCash: CashRegisterEntry = {
      id: 'cash-distant',
      bookingId: 'bk-distant',
      staffId: 'staff-1',
      entryType: 'service_income',
      description: 'Cobro',
      amountCents: 50000,
      tipCents: 0,
      commissionCents: 20000,
      paymentMethod: 'card',
      occurredAt: '2026-12-20T17:00:00.000Z',
      recordedBy: 'duena@nails.studio',
    };

    const merged = mergeAgendaRangeData({
      overviewBookings,
      overviewSplits: [overviewSplit],
      overviewCashEntries: [],
      rangeData: {
        bookings: rangeBookings,
        paymentSplits: [staleRangeSplit, distantRangeSplit],
        cashEntries: [rangeCash],
        range: { from: '2026-11-24', to: '2026-12-30', staffId: null },
        timezone: 'America/Mexico_City',
      },
    });

    expect(merged.bookings.map((b) => `${b.id}:${b.status}`)).toEqual([
      'bk-newer-in-range:completed',
      'bk-fresher-in-overview:completed',
      'bk-equal-optimistic:canceled',
      'bk-outside:pending_confirmation',
      'bk-distant:confirmed',
    ]);
    expect(merged.paymentSplits).toEqual([overviewSplit, distantRangeSplit]);
    expect(merged.cashEntries).toEqual([rangeCash]);
  });

  it('surfaces AdminFetchError on 500 JSON, 524 HTML, and timeout via fetchAdminJson', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'DB_ERROR', error: 'Error simulado 500' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      fetchAdminJson('/api/admin/bookings?from=2026-11-24&to=2026-11-30'),
    ).rejects.toMatchObject({
      name: 'AdminFetchError',
      status: 500,
      code: 'DB_ERROR',
      message: 'Error simulado 500',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>524 Timeout</body></html>', {
          status: 524,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    await expect(
      fetchAdminJson('/api/admin/bookings?from=2026-11-24&to=2026-11-30'),
    ).rejects.toBeInstanceOf(AdminFetchError);

    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchAdminJson('/api/admin/bookings?from=2026-11-24&to=2026-11-30', controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
