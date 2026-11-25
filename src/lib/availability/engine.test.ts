import { describe, expect, it } from 'vitest';
import {
  computeServiceTotals,
  diagnoseDateSlots,
  findNearestAvailableSlots,
  getAvailableSlotsForDate,
  zonedDateTimeToUtc,
  type AvailabilityContext,
} from './engine';
import { createInitialDemoDatabase } from '../demo-seed';
import { generateBookingIcs } from '../ics';

function buildBaseContext(): AvailabilityContext {
  const db = createInitialDemoDatabase();
  const now = new Date('2026-12-01T13:00:00.000Z');
  const service = db.services.find((s) => s.id === 'srv-gelish-manicure');
  const primaryStaff = db.staff[0];
  if (!service || !primaryStaff) {
    throw new Error('Demo seed missing expected service or staff');
  }
  return {
    settings: db.settings,
    service,
    addons: [],
    staffMembers: [primaryStaff],
    schedules: db.schedules,
    dateOverrides: [],
    bookings: [],
    slotHolds: [],
    calendarConnections: [],
    now,
  };
}

describe('Availability Engine (Nails)', () => {
  it('respects split-shift working hours (lunch break 14:00-15:00)', () => {
    const ctx = buildBaseContext();

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-valeria');
    const times = slots.map((s) => s.localTime24);

    expect(times).toContain('10:00');
    expect(times).toContain('13:00');
    expect(times).not.toContain('13:30');
    expect(times).not.toContain('14:00');
    expect(times).toContain('15:00');
    expect(times).toContain('18:30');
    expect(times).not.toContain('19:00');
  });

  it('dynamically adjusts slots when add-ons increase duration', () => {
    const db = createInitialDemoDatabase();
    const ctx = buildBaseContext();
    const retiro = db.addons.find((a) => a.id === 'addon-retiro')!;
    const art2 = db.addons.find((a) => a.id === 'addon-nail-art-2')!;
    ctx.addons = [retiro, art2];

    const totals = computeServiceTotals(ctx.service, ctx.addons);
    expect(totals.totalDurationMinutes).toBe(110);
    expect(totals.subtotalCents).toBe(38000 + 12000 + 22000);

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-valeria');
    const times = slots.map((s) => s.localTime24);
    expect(times).toContain('12:00');
    expect(times).not.toContain('12:30');
  });

  it('blocks overlapping slots including bufferAfterMinutes', () => {
    const ctx = buildBaseContext();
    const startIso = zonedDateTimeToUtc('2026-12-01', '10:00', 'America/Mexico_City').toISOString();
    const endIso = zonedDateTimeToUtc('2026-12-01', '11:00', 'America/Mexico_City').toISOString();
    const occEndIso = zonedDateTimeToUtc('2026-12-01', '11:15', 'America/Mexico_City').toISOString();

    ctx.bookings = [
      {
        id: 'bk-test',
        bookingCode: 'NL-9999',
        manageToken: 'tok-9999',
        idempotencyKey: null,
        serviceId: ctx.service.id,
        staffId: 'staff-valeria',
        clientId: 'client-1',
        startAt: startIso,
        endAt: endIso,
        occupiedStartAt: startIso,
        occupiedEndAt: occEndIso,
        totalDurationMinutes: 60,
        subtotalCents: 38000,
        discountCents: 0,
        totalPriceCents: 38000,
        depositAmountCents: 0,
        couponCode: null,
        status: 'confirmed',
        source: 'web',
        clientNotes: '',
        internalNotes: '',
        inspoPhotoUrl: null,
        paymentProofUrl: null,
        googleEventId: null,
        cancellationReason: null,
        rescheduledFromId: null,
        addons: [],
        createdAt: startIso,
        updatedAt: startIso,
      },
    ];

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-valeria');
    const times = slots.map((s) => s.localTime24);
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('10:30');
    expect(times).not.toContain('11:00');
    expect(times).toContain('11:30');
  });

  it('respects 3-minute slot holds for other sessions while allowing the holder session', () => {
    const ctx = buildBaseContext();
    const startIso = zonedDateTimeToUtc('2026-12-01', '10:00', 'America/Mexico_City').toISOString();
    const occEndIso = zonedDateTimeToUtc('2026-12-01', '11:15', 'America/Mexico_City').toISOString();

    ctx.slotHolds = [
      {
        id: 'hold-1',
        staffId: 'staff-valeria',
        serviceId: ctx.service.id,
        sessionToken: 'session-A',
        startAt: startIso,
        endAt: occEndIso,
        expiresAt: new Date(ctx.now!.getTime() + 180_000).toISOString(),
        createdAt: ctx.now!.toISOString(),
      },
    ];

    const slotsForB = getAvailableSlotsForDate(
      { ...ctx, callerSessionToken: 'session-B' },
      '2026-12-01',
      'staff-valeria',
    );
    expect(slotsForB.map((s) => s.localTime24)).not.toContain('10:00');

    const slotsForA = getAvailableSlotsForDate(
      { ...ctx, callerSessionToken: 'session-A' },
      '2026-12-01',
      'staff-valeria',
    );
    expect(slotsForA.map((s) => s.localTime24)).toContain('10:00');
  });

  it('blocks Google Calendar external conflicts and date overrides, and diagnoses reasons', () => {
    const ctx = buildBaseContext();
    ctx.calendarConnections = [
      {
        id: 'gcal-1',
        staffId: 'staff-valeria',
        provider: 'google',
        accountEmail: 'valeria@nails.studio',
        destinationCalendarId: 'primary',
        conflictCalendarIds: ['primary'],
        availableCalendars: [],
        isConnected: true,
        lastSyncedAt: ctx.now!.toISOString(),
        externalBusyBlocks: [
          {
            startAt: zonedDateTimeToUtc('2026-12-01', '16:00', 'America/Mexico_City').toISOString(),
            endAt: zonedDateTimeToUtc('2026-12-01', '17:00', 'America/Mexico_City').toISOString(),
            summary: 'Cita médica personal',
          },
        ],
      },
    ];

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-valeria');
    expect(slots.map((s) => s.localTime24)).not.toContain('16:00');

    const diag = diagnoseDateSlots(ctx, '2026-12-01', 'staff-valeria');
    const at16 = diag.find((d) => d.time24 === '16:00');
    expect(at16?.isAvailable).toBe(false);
    expect(at16?.reason).toContain('Cita médica personal');

    ctx.dateOverrides = [
      {
        id: 'ovr-close',
        staffId: 'staff-valeria',
        overrideDate: '2026-12-01',
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: 'Día festivo',
      },
    ];
    expect(getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-valeria')).toHaveLength(0);
  });

  it('suggests the 3 nearest alternative slots on collision and generates valid RFC 5545 ICS', () => {
    const db = createInitialDemoDatabase();
    const ctx = buildBaseContext();
    const targetIso = zonedDateTimeToUtc('2026-12-01', '10:00', 'America/Mexico_City').toISOString();

    const suggestions = findNearestAvailableSlots(ctx, targetIso, 'staff-valeria', 3);
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.localTime24).toBe('10:00');

    const sampleBooking = db.bookings[0];
    if (!sampleBooking) throw new Error('Expected seed booking');
    const sampleService = db.services.find((s) => s.id === sampleBooking.serviceId);
    const sampleStaff = db.staff.find((s) => s.id === sampleBooking.staffId);
    const sampleClient = db.clients.find((c) => c.id === sampleBooking.clientId);
    if (!sampleService || !sampleStaff || !sampleClient) {
      throw new Error('Expected seed booking relations');
    }

    const ics = generateBookingIcs(
      {
        ...sampleBooking,
        service: sampleService,
        staff: sampleStaff,
        client: sampleClient,
      },
      db.settings,
      'http://localhost:3000/cita/demo-token-sofia-1042',
    );
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('NL-1042');
    expect(ics).toContain('END:VCALENDAR');
  });
});
