import { describe, expect, it } from 'vitest';
import type {
  BookingStatus,
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
} from '@/lib/types';
import {
  filterBookingsForAgendaStatus,
  filterBookingsForListDate,
} from './BookingsListView';

const TZ = 'America/Mexico_City';
const NOW_ISO = '2026-11-27T18:00:00.000Z';

function makeBooking(overrides: {
  id: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  staffId?: string;
  clientName?: string;
  bookingCode?: string;
  totalPriceCents?: number;
  depositAmountCents?: number;
}): BookingWithRelations {
  const totalPriceCents = overrides.totalPriceCents ?? 50000;
  return {
    id: overrides.id,
    bookingCode: overrides.bookingCode ?? `LK-${overrides.id}`,
    manageToken: `tok-${overrides.id}`,
    idempotencyKey: null,
    clientId: `client-${overrides.id}`,
    staffId: overrides.staffId ?? 'staff-1',
    serviceId: 'svc-1',
    extraServiceIds: [],
    addons: [],
    startAt: overrides.startAt,
    endAt: overrides.endAt,
    occupiedStartAt: overrides.startAt,
    occupiedEndAt: overrides.endAt,
    totalDurationMinutes: 60,
    subtotalCents: totalPriceCents,
    discountCents: 0,
    totalPriceCents,
    depositAmountCents: overrides.depositAmountCents ?? 15000,
    couponCode: null,
    status: overrides.status,
    source: 'web',
    clientNotes: '',
    internalNotes: '',
    inspoPhotoUrl: null,
    paymentProofUrl: null,
    googleEventId: null,
    cancellationReason: null,
    rescheduledFromId: null,
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    client: {
      id: `client-${overrides.id}`,
      fullName: overrides.clientName ?? `Clienta ${overrides.id}`,
      phoneE164: '+525512345678',
      email: null,
      instagramHandle: '@laikona_test',
      birthday: null,
      notes: '',
      noShowCount: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    staff: {
      id: overrides.staffId ?? 'staff-1',
      name: overrides.staffId === 'staff-2' ? 'Sofía' : 'Vale',
      roleTitle: 'Nail Artist',
      bio: '',
      avatarUrl: null,
      bookingSlug: overrides.staffId === 'staff-2' ? 'sofia' : 'vale',
      commissionPercent: 40,
      isActive: true,
      displayOrder: 0,
      serviceIds: ['svc-1'],
    },
    service: {
      id: 'svc-1',
      categoryId: null,
      name: 'Gelish',
      slug: 'gelish',
      description: '',
      durationMinutes: 60,
      priceCents: 50000,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      requiresConfirmation: false,
      depositRequired: false,
      depositAmountCents: 15000,
      allowInspoPhoto: false,
      isActive: true,
      isFeatured: false,
      displayOrder: 0,
      imageUrl: null,
    },
  };
}

describe('filterBookingsForAgendaStatus & filterBookingsForListDate', () => {
  const bookings: BookingWithRelations[] = [
    makeBooking({
      id: 'b-upcoming-today',
      status: 'confirmed',
      startAt: '2026-11-27T19:00:00.000Z',
      endAt: '2026-11-27T20:00:00.000Z',
      staffId: 'staff-1',
      clientName: 'Ana López',
    }),
    makeBooking({
      id: 'b-upcoming-tomorrow',
      status: 'confirmed',
      startAt: '2026-11-28T19:00:00.000Z',
      endAt: '2026-11-28T20:00:00.000Z',
      staffId: 'staff-2',
      clientName: 'Beto Cruz',
    }),
    makeBooking({
      id: 'b-pending',
      status: 'pending_confirmation',
      startAt: '2026-11-29T16:00:00.000Z',
      endAt: '2026-11-29T17:00:00.000Z',
      clientName: 'Carla Ruiz',
    }),
    makeBooking({
      id: 'b-completed-unpaid',
      status: 'completed',
      startAt: '2026-11-26T16:00:00.000Z',
      endAt: '2026-11-26T17:00:00.000Z',
      totalPriceCents: 60000,
      depositAmountCents: 0,
      clientName: 'Diana Soto',
    }),
    makeBooking({
      id: 'b-completed-paid',
      status: 'completed',
      startAt: '2026-11-25T16:00:00.000Z',
      endAt: '2026-11-25T17:00:00.000Z',
      totalPriceCents: 50000,
      depositAmountCents: 0,
      clientName: 'Elena Mora',
    }),
    makeBooking({
      id: 'b-canceled',
      status: 'canceled',
      startAt: '2026-11-27T15:00:00.000Z',
      endAt: '2026-11-27T16:00:00.000Z',
      clientName: 'Fabiola Vega',
    }),
  ];

  const paymentSplits: PaymentSplit[] = [
    {
      id: 'split-1',
      bookingId: 'b-completed-paid',
      method: 'card',
      amountCents: 50000,
      tipCents: 0,
      tipStaffId: null,
      createdAt: '2026-11-25T17:05:00.000Z',
    },
  ];
  const cashEntries: CashRegisterEntry[] = [];

  it('filters pending deposit bookings cleanly', () => {
    const result = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'pending',
      search: '',
      selectedStaffFilter: 'all',
    });
    expect(result.map((b) => b.id)).toEqual(['b-pending']);
  });

  it('filters uncollected bookings inline using computeBookingBalance', () => {
    const result = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'uncollected',
      search: '',
      selectedStaffFilter: 'all',
    });
    expect(result.map((b) => b.id)).toEqual(['b-completed-unpaid']);
  });

  it('scopes status filtering by staffId and search query', () => {
    const byStaff = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'upcoming',
      search: '',
      selectedStaffFilter: 'staff-2',
    });
    expect(byStaff.map((b) => b.id)).toEqual(['b-upcoming-tomorrow']);

    const bySearch = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'all',
      search: 'diana',
      selectedStaffFilter: 'all',
    });
    expect(bySearch.map((b) => b.id)).toEqual(['b-completed-unpaid']);
  });

  it('filters list view to selected date only for upcoming without search', () => {
    const upcoming = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'upcoming',
      search: '',
      selectedStaffFilter: 'all',
    });
    const forToday = filterBookingsForListDate({
      filtered: upcoming,
      status: 'upcoming',
      search: '',
      dateKey: '2026-11-27',
      timezone: TZ,
    });
    expect(forToday.map((b) => b.id)).toEqual(['b-upcoming-today']);

    const uncollected = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'uncollected',
      search: '',
      selectedStaffFilter: 'all',
    });
    const uncollectedList = filterBookingsForListDate({
      filtered: uncollected,
      status: 'uncollected',
      search: '',
      dateKey: '2026-11-27',
      timezone: TZ,
    });
    expect(uncollectedList.map((b) => b.id)).toEqual(['b-completed-unpaid']);

    const pending = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'pending',
      search: '',
      selectedStaffFilter: 'all',
    });
    expect(
      filterBookingsForListDate({
        filtered: pending,
        status: 'pending',
        search: '',
        dateKey: '2026-11-27',
        timezone: TZ,
      }).map((b) => b.id),
    ).toEqual(['b-pending']);

    const past = filterBookingsForAgendaStatus({
      bookings,
      paymentSplits,
      cashEntries,
      serverNowIso: NOW_ISO,
      status: 'past',
      search: '',
      selectedStaffFilter: 'all',
    });
    expect(
      filterBookingsForListDate({
        filtered: past,
        status: 'past',
        search: '',
        dateKey: '2026-11-27',
        timezone: TZ,
      }).map((b) => b.id),
    ).toEqual(['b-completed-unpaid', 'b-completed-paid']);
  });
});
