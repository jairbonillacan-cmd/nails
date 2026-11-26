import { describe, expect, it } from 'vitest';
import {
  findInactiveReactivationClients,
  findUpcomingBirthdayClients,
} from './retention';
import type { Booking, ClientProfile } from '../types';

function makeClient(overrides: Partial<ClientProfile> & { id: string }): ClientProfile {
  return {
    fullName: 'Clienta Demo',
    phoneE164: '+522221112233',
    email: null,
    birthday: null,
    notes: '',
    noShowCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> & { id: string; clientId: string }): Booking {
  return {
    bookingCode: 'NL-TEST',
    manageToken: 'tok-test',
    idempotencyKey: null,
    serviceId: 'srv-rubber',
    staffId: 'staff-karla',
    startAt: '2026-09-01T16:00:00.000Z',
    endAt: '2026-09-01T18:00:00.000Z',
    occupiedStartAt: '2026-09-01T16:00:00.000Z',
    occupiedEndAt: '2026-09-01T18:00:00.000Z',
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
    createdAt: '2026-09-01T16:00:00.000Z',
    updatedAt: '2026-09-01T18:00:00.000Z',
    ...overrides,
  };
}

describe('Retention Campaigns Domain (U6)', () => {
  it('finds upcoming birthdays within 7 days including Dec-Jan rollover and leap-day handling', () => {
    const clients: ClientProfile[] = [
      makeClient({
        id: 'c-today',
        fullName: 'Ana Hoy',
        phoneE164: '+522221000001',
        birthday: '1995-12-29',
      }),
      makeClient({
        id: 'c-rollover',
        fullName: 'Lucía Año Nuevo',
        phoneE164: '+522221000002',
        birthday: '1998-01-03',
      }),
      makeClient({
        id: 'c-far',
        fullName: 'Lejana',
        phoneE164: '+522221000003',
        birthday: '1992-06-15',
      }),
    ];

    const upcoming = findUpcomingBirthdayClients(clients, '2026-12-29', 7, {
      salonName: 'LAIKONA NAILS',
      bookingUrl: 'https://laikona.mx/reservar',
    });

    expect(upcoming.map((c) => c.clientId)).toEqual(['c-today', 'c-rollover']);
    expect(upcoming[0]?.daysUntilBirthday).toBe(0);
    expect(upcoming[1]?.daysUntilBirthday).toBe(5);
    expect(upcoming[0]?.whatsappUrl).toContain('https://wa.me/522221000001');
    expect(upcoming[0]?.whatsappMessage).toContain('LAIKONA NAILS');

    const leapClients = [
      makeClient({
        id: 'c-leap',
        fullName: 'Febrero Bisiesto',
        birthday: '1996-02-29',
      }),
    ];
    const leapRes = findUpcomingBirthdayClients(leapClients, '2026-02-25', 7);
    expect(leapRes).toHaveLength(1);
    expect(leapRes[0]?.daysUntilBirthday).toBe(3);
  });

  it('finds clients inactive for 45+ days while excluding recent, upcoming, and zero-visit leads', () => {
    const todayMs = new Date('2026-11-25T18:00:00.000Z').getTime();
    const clients: ClientProfile[] = [
      makeClient({ id: 'c-lapsed-60', fullName: 'Clienta 60 días', phoneE164: '+522222000001' }),
      makeClient({ id: 'c-lapsed-48', fullName: 'Clienta 48 días', phoneE164: '+522222000002' }),
      makeClient({ id: 'c-recent', fullName: 'Clienta Reciente', phoneE164: '+522222000003' }),
      makeClient({ id: 'c-upcoming', fullName: 'Clienta Próxima', phoneE164: '+522222000004' }),
      makeClient({ id: 'c-never', fullName: 'Lead Sin Visitas', phoneE164: '+522222000005' }),
    ];

    const bookings: Booking[] = [
      makeBooking({
        id: 'b-1',
        clientId: 'c-lapsed-60',
        serviceId: 'srv-rubber',
        startAt: new Date(todayMs - 60 * 86_400_000).toISOString(),
        status: 'completed',
      }),
      makeBooking({
        id: 'b-2',
        clientId: 'c-lapsed-48',
        serviceId: 'srv-softgel',
        startAt: new Date(todayMs - 48 * 86_400_000).toISOString(),
        status: 'completed',
      }),
      makeBooking({
        id: 'b-3',
        clientId: 'c-recent',
        startAt: new Date(todayMs - 10 * 86_400_000).toISOString(),
        status: 'completed',
      }),
      makeBooking({
        id: 'b-4',
        clientId: 'c-upcoming',
        startAt: new Date(todayMs - 70 * 86_400_000).toISOString(),
        status: 'completed',
      }),
      makeBooking({
        id: 'b-5',
        clientId: 'c-upcoming',
        startAt: new Date(todayMs + 2 * 86_400_000).toISOString(),
        status: 'confirmed',
      }),
    ];

    const cohorts = findInactiveReactivationClients(clients, bookings, todayMs, 45, {
      salonName: 'LAIKONA NAILS',
      bookingUrl: 'https://laikona.mx/reservar',
      serviceNameById: new Map([
        ['srv-rubber', 'Rubber'],
        ['srv-softgel', 'Uñas Softgel'],
      ]),
    });

    expect(cohorts.map((c) => c.clientId)).toEqual(['c-lapsed-60', 'c-lapsed-48']);
    expect(cohorts[0]?.daysSinceLastVisit).toBe(60);
    expect(cohorts[0]?.lastServiceName).toBe('Rubber');
    expect(cohorts[0]?.whatsappMessage).toContain('Rubber');
    expect(cohorts[0]?.whatsappUrl).toContain('https://wa.me/522222000001');
  });
});
