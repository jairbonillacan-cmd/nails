import { describe, expect, it } from 'vitest';
import {
  assertSlotBookable,
  computeServiceTotals,
  diagnoseDateSlots,
  findNearestAvailableSlots,
  getAvailabilityForRange,
  getAvailableSlotsForDate,
  zonedDateTimeToUtc,
  type AvailabilityContext,
  type SlotRejectionCode,
} from './engine';
import { createInitialDemoDatabase } from '../demo-seed';
import { generateBookingIcs } from '../ics';

function buildContinuousContext(): AvailabilityContext {
  const db = createInitialDemoDatabase();
  const now = new Date('2026-12-01T13:00:00.000Z');
  const baseService = db.services.find((s) => s.id === 'srv-gel-semipermanente-manos');
  const primaryStaff = db.staff.find((s) => s.id === 'staff-karla');
  if (!baseService || !primaryStaff) {
    throw new Error('Demo seed missing expected service or staff');
  }
  return {
    settings: {
      ...db.settings,
      slotIntervalMinutes: 30,
    },
    service: {
      ...baseService,
      durationMinutes: 60,
      priceCents: 38000,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
    },
    addons: [],
    staffMembers: [primaryStaff],
    schedules: [
      {
        id: 'sched-continuous-test',
        staffId: primaryStaff.id,
        name: 'Turno partido continuo',
        timezone: 'America/Mexico_City',
        isDefault: true,
        rules: [
          { id: 'rc-1', dayOfWeek: 1, startTime: '10:00', endTime: '14:00' },
          { id: 'rc-2', dayOfWeek: 1, startTime: '15:00', endTime: '19:30' },
          { id: 'rc-3', dayOfWeek: 2, startTime: '10:00', endTime: '14:00' },
          { id: 'rc-4', dayOfWeek: 2, startTime: '15:00', endTime: '19:30' },
          { id: 'rc-5', dayOfWeek: 3, startTime: '10:00', endTime: '14:00' },
          { id: 'rc-6', dayOfWeek: 3, startTime: '15:00', endTime: '19:30' },
          { id: 'rc-7', dayOfWeek: 4, startTime: '10:00', endTime: '14:00' },
          { id: 'rc-8', dayOfWeek: 4, startTime: '15:00', endTime: '19:30' },
          { id: 'rc-9', dayOfWeek: 5, startTime: '10:00', endTime: '14:00' },
          { id: 'rc-10', dayOfWeek: 5, startTime: '15:00', endTime: '19:30' },
          { id: 'rc-11', dayOfWeek: 6, startTime: '10:00', endTime: '16:00' },
        ],
      },
    ],
    dateOverrides: [],
    bookings: [],
    slotHolds: [],
    calendarConnections: [],
    now,
  };
}

function buildLaikonaContext(): AvailabilityContext {
  const db = createInitialDemoDatabase();
  const now = new Date('2026-12-01T13:00:00.000Z');
  const service = db.services.find((s) => s.id === 'srv-rubber');
  if (!service) {
    throw new Error('Demo seed missing expected Rubber service');
  }
  return {
    settings: db.settings,
    service,
    addons: [],
    staffMembers: db.staff,
    schedules: db.schedules,
    dateOverrides: [],
    bookings: [],
    slotHolds: [],
    calendarConnections: [],
    now,
  };
}

describe('Availability Engine (Nails & LAIKONA NAILS)', () => {
  it('respects continuous split-shift working hours (lunch break 14:00-15:00)', () => {
    const ctx = buildContinuousContext();

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla');
    const times = slots.map((s) => s.localTime24);

    expect(times).toContain('10:00');
    expect(times).toContain('13:00');
    expect(times).not.toContain('13:30');
    expect(times).not.toContain('14:00');
    expect(times).toContain('15:00');
    expect(times).toContain('18:30');
    expect(times).not.toContain('19:00');
  });

  it('enforces LAIKONA fixed start-time blocks per specialist (Karla/Paty vs Tere)', () => {
    const ctx = buildLaikonaContext();
    const tz = ctx.settings.timezone;

    const karlaSlots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla');
    expect(karlaSlots.map((s) => s.localTime24)).toEqual(['10:00', '13:30', '16:30']);

    const patySlots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-paty');
    expect(patySlots.map((s) => s.localTime24)).toEqual(['10:00', '13:30', '16:30']);

    const tereSlots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-tere');
    expect(tereSlots.map((s) => s.localTime24)).toEqual(['14:00', '16:00', '18:00']);

    expect(getAvailableSlotsForDate(ctx, '2026-12-06', 'staff-karla')).toHaveLength(0);
    expect(getAvailableSlotsForDate(ctx, '2026-12-06', 'staff-paty')).toHaveLength(0);
    expect(getAvailableSlotsForDate(ctx, '2026-12-06', 'staff-tere')).toHaveLength(0);

    const validKarla = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '13:30', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(validKarla.ok).toBe(true);

    const offBlockKarla = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '11:00', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(offBlockKarla.ok).toBe(false);
    if (!offBlockKarla.ok) {
      expect(offBlockKarla.code).toBe('INVALID_ALIGNMENT');
      expect(offBlockKarla.message).toContain('horarios fijos');
    }

    const offBlockTere = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '15:00', tz).toISOString(),
      staffId: 'staff-tere',
    });
    expect(offBlockTere.ok).toBe(false);
    if (!offBlockTere.ok) {
      expect(offBlockTere.code).toBe('INVALID_ALIGNMENT');
    }

    const karlaDiag = diagnoseDateSlots(ctx, '2026-12-01', 'staff-karla');
    const karlaAvailSet = new Set(karlaSlots.map((s) => s.localTime24));
    for (const d of karlaDiag) {
      expect(d.isAvailable).toBe(karlaAvailSet.has(d.time24));
    }
    const diagAt11 = karlaDiag.find((d) => d.time24 === '11:00');
    expect(diagAt11?.isAvailable).toBe(false);
    expect(diagAt11?.reason).toContain('horarios fijos');

    const closedCtx: AvailabilityContext = {
      ...ctx,
      dateOverrides: [
        {
          id: 'ovr-karla-closed',
          staffId: 'staff-karla',
          overrideDate: '2026-12-01',
          isUnavailable: true,
          startTime: null,
          endTime: null,
          reason: 'Curso técnico',
        },
      ],
    };
    const closedCheck = assertSlotBookable(closedCtx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '10:00', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(closedCheck.ok).toBe(false);
    if (!closedCheck.ok) {
      expect(closedCheck.code).toBe('OUTSIDE_HOURS');
    }
  });

  it('combines primary service, extraServices, and add-ons for totals, window fit, and eligibility', () => {
    const db = createInitialDemoDatabase();
    const rubber = db.services.find((s) => s.id === 'srv-rubber');
    const pedispaGel = db.services.find((s) => s.id === 'srv-pedispa-gel');
    const nailArt1 = db.addons.find((a) => a.id === 'addon-nail-art-1');
    if (!rubber || !pedispaGel || !nailArt1) {
      throw new Error('Demo seed missing expected LAIKONA services or add-ons');
    }

    const totals = computeServiceTotals(
      { ...rubber, bufferBeforeMinutes: 5, bufferAfterMinutes: 10 },
      [nailArt1],
      [{ ...pedispaGel, bufferBeforeMinutes: 15, bufferAfterMinutes: 5 }],
    );
    expect(totals.totalDurationMinutes).toBe(120 + 90 + 15);
    expect(totals.subtotalCents).toBe(35000 + 50000 + 11000);
    expect(totals.bufferBeforeMinutes).toBe(15);
    expect(totals.bufferAfterMinutes).toBe(10);

    const ctx: AvailabilityContext = {
      ...buildLaikonaContext(),
      service: rubber,
      extraServices: [pedispaGel],
    };
    const tz = ctx.settings.timezone;

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla');
    expect(slots.map((s) => s.localTime24)).toEqual(['10:00', '13:30']);
    for (const slot of slots) {
      const durationMs = new Date(slot.endAt).getTime() - new Date(slot.startAt).getTime();
      expect(durationMs).toBe(210 * 60_000);
    }

    const fits1330 = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '13:30', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(fits1330.ok).toBe(true);

    const overflows1630 = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '16:30', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(overflows1630.ok).toBe(false);
    if (!overflows1630.ok) {
      expect(overflows1630.code).toBe('OUTSIDE_HOURS');
    }

    const restrictedCtx: AvailabilityContext = {
      ...ctx,
      staffMembers: ctx.staffMembers.map((member) =>
        member.id === 'staff-tere' ? { ...member, serviceIds: [rubber.id] } : member,
      ),
    };
    expect(getAvailableSlotsForDate(restrictedCtx, '2026-12-01', 'staff-tere')).toHaveLength(0);
    const ineligibleExtra = assertSlotBookable(restrictedCtx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '14:00', tz).toISOString(),
      staffId: 'staff-tere',
    });
    expect(ineligibleExtra.ok).toBe(false);
    if (!ineligibleExtra.ok) {
      expect(ineligibleExtra.code).toBe('STAFF_INELIGIBLE');
    }
  });

  it('dynamically adjusts slots when add-ons increase duration', () => {
    const db = createInitialDemoDatabase();
    const ctx = buildContinuousContext();
    const retiro = db.addons.find((a) => a.id === 'addon-retiro');
    const art2 = db.addons.find((a) => a.id === 'addon-nail-art-2');
    if (!retiro || !art2) {
      throw new Error('Demo seed missing expected add-ons');
    }
    ctx.addons = [retiro, art2];

    const totals = computeServiceTotals(ctx.service, ctx.addons);
    expect(totals.totalDurationMinutes).toBe(110);
    expect(totals.subtotalCents).toBe(38000 + 12000 + 22000);

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla');
    const times = slots.map((s) => s.localTime24);
    expect(times).toContain('12:00');
    expect(times).not.toContain('12:30');
  });

  it('blocks overlapping slots including bufferAfterMinutes', () => {
    const ctx = buildContinuousContext();
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
        staffId: 'staff-karla',
        clientId: 'client-1',
        startAt: startIso,
        endAt: endIso,
        occupiedStartAt: startIso,
        occupiedEndAt: occEndIso,
        totalDurationMinutes: 60,
        subtotalCents: 38000,
        discountCents: 0,
        totalPriceCents: 38000,
        depositAmountCents: 20000,
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

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla');
    const times = slots.map((s) => s.localTime24);
    expect(times).not.toContain('10:00');
    expect(times).not.toContain('10:30');
    expect(times).not.toContain('11:00');
    expect(times).toContain('11:30');
  });

  it('respects 3-minute slot holds for other sessions while allowing the holder session', () => {
    const ctx = buildContinuousContext();
    const now = ctx.now ?? new Date('2026-12-01T13:00:00.000Z');
    const startIso = zonedDateTimeToUtc('2026-12-01', '10:00', 'America/Mexico_City').toISOString();
    const occEndIso = zonedDateTimeToUtc('2026-12-01', '11:15', 'America/Mexico_City').toISOString();

    ctx.slotHolds = [
      {
        id: 'hold-1',
        staffId: 'staff-karla',
        serviceId: ctx.service.id,
        sessionToken: 'session-A',
        startAt: startIso,
        endAt: occEndIso,
        expiresAt: new Date(now.getTime() + 180_000).toISOString(),
        createdAt: now.toISOString(),
      },
    ];

    const slotsForB = getAvailableSlotsForDate(
      { ...ctx, callerSessionToken: 'session-B' },
      '2026-12-01',
      'staff-karla',
    );
    expect(slotsForB.map((s) => s.localTime24)).not.toContain('10:00');

    const slotsForA = getAvailableSlotsForDate(
      { ...ctx, callerSessionToken: 'session-A' },
      '2026-12-01',
      'staff-karla',
    );
    expect(slotsForA.map((s) => s.localTime24)).toContain('10:00');
  });

  it('blocks Google Calendar external conflicts and date overrides, and diagnoses reasons', () => {
    const ctx = buildContinuousContext();
    const now = ctx.now ?? new Date('2026-12-01T13:00:00.000Z');
    ctx.calendarConnections = [
      {
        id: 'gcal-1',
        staffId: 'staff-karla',
        provider: 'google',
        accountEmail: 'karla@laikonanails.mx',
        destinationCalendarId: 'primary',
        conflictCalendarIds: ['primary'],
        availableCalendars: [],
        isConnected: true,
        lastSyncedAt: now.toISOString(),
        externalBusyBlocks: [
          {
            startAt: zonedDateTimeToUtc('2026-12-01', '16:00', 'America/Mexico_City').toISOString(),
            endAt: zonedDateTimeToUtc('2026-12-01', '17:00', 'America/Mexico_City').toISOString(),
            summary: 'Cita médica personal',
          },
        ],
      },
    ];

    const slots = getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla');
    expect(slots.map((s) => s.localTime24)).not.toContain('16:00');

    const diag = diagnoseDateSlots(ctx, '2026-12-01', 'staff-karla');
    const at16 = diag.find((d) => d.time24 === '16:00');
    expect(at16?.isAvailable).toBe(false);
    expect(at16?.reason).toContain('Cita médica personal');

    ctx.dateOverrides = [
      {
        id: 'ovr-close',
        staffId: 'staff-karla',
        overrideDate: '2026-12-01',
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: 'Día festivo',
      },
    ];
    expect(getAvailableSlotsForDate(ctx, '2026-12-01', 'staff-karla')).toHaveLength(0);
  });

  it('suggests the 3 nearest alternative slots on collision and generates valid RFC 5545 ICS', () => {
    const db = createInitialDemoDatabase();
    const ctx = buildContinuousContext();
    const targetIso = zonedDateTimeToUtc('2026-12-01', '10:00', 'America/Mexico_City').toISOString();

    const suggestions = findNearestAvailableSlots(ctx, targetIso, 'staff-karla', 3);
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

  it('D1: assertSlotBookable accepts valid slots and rejects each failure mode with typed codes', () => {
    const db = createInitialDemoDatabase();
    const ctx = buildContinuousContext();
    ctx.staffMembers = db.staff.map((member) =>
      member.id === 'staff-tere'
        ? { ...member, serviceIds: ['srv-gel-semipermanente-manos'] }
        : member,
    );
    const tz = ctx.settings.timezone;

    const validStart = zonedDateTimeToUtc('2026-12-01', '10:00', tz).toISOString();
    const okRes = assertSlotBookable(ctx, {
      startAt: validStart,
      staffId: 'staff-karla',
    });
    expect(okRes.ok).toBe(true);
    if (okRes.ok) {
      expect(okRes.slot.localTime24).toBe('10:00');
      expect(okRes.slot.staffId).toBe('staff-karla');
    }

    const expectedCodes: readonly SlotRejectionCode[] = [
      'OUTSIDE_HOURS',
      'PAST_OR_NOTICE',
      'BEYOND_MAX_DAYS',
      'STAFF_INELIGIBLE',
      'SLOT_TAKEN',
      'INVALID_ALIGNMENT',
    ];
    const observedCodes = new Set<SlotRejectionCode>();

    const threeAm = zonedDateTimeToUtc('2026-12-02', '03:00', tz).toISOString();
    const outsideRes = assertSlotBookable(ctx, {
      startAt: threeAm,
      staffId: 'staff-karla',
    });
    expect(outsideRes.ok).toBe(false);
    if (!outsideRes.ok) {
      observedCodes.add(outsideRes.code);
      expect(outsideRes.code).toBe('OUTSIDE_HOURS');
      expect(outsideRes.suggestedSlots.length).toBeGreaterThan(0);
    }

    const lunchRes = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '14:00', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(lunchRes.ok).toBe(false);
    if (!lunchRes.ok) {
      expect(lunchRes.code).toBe('OUTSIDE_HOURS');
    }

    const pastRes = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-11-30', '10:00', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(pastRes.ok).toBe(false);
    if (!pastRes.ok) {
      observedCodes.add(pastRes.code);
      expect(pastRes.code).toBe('PAST_OR_NOTICE');
      expect(pastRes.suggestedSlots.length).toBeGreaterThan(0);
    }

    const withinNoticeRes = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '10:00', tz).toISOString(),
      staffId: 'staff-karla',
      now: zonedDateTimeToUtc('2026-12-01', '09:00', tz),
    });
    expect(withinNoticeRes.ok).toBe(false);
    if (!withinNoticeRes.ok) {
      expect(withinNoticeRes.code).toBe('PAST_OR_NOTICE');
    }

    const farFutureRes = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2027-06-01', '10:00', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(farFutureRes.ok).toBe(false);
    if (!farFutureRes.ok) {
      observedCodes.add(farFutureRes.code);
      expect(farFutureRes.code).toBe('BEYOND_MAX_DAYS');
    }

    const unalignedRes = assertSlotBookable(ctx, {
      startAt: zonedDateTimeToUtc('2026-12-01', '10:07', tz).toISOString(),
      staffId: 'staff-karla',
    });
    expect(unalignedRes.ok).toBe(false);
    if (!unalignedRes.ok) {
      observedCodes.add(unalignedRes.code);
      expect(unalignedRes.code).toBe('INVALID_ALIGNMENT');
    }

    const invalidDateRes = assertSlotBookable(ctx, {
      startAt: 'not-a-real-date',
      staffId: 'staff-karla',
    });
    expect(invalidDateRes.ok).toBe(false);
    if (!invalidDateRes.ok) {
      expect(invalidDateRes.code).toBe('INVALID_ALIGNMENT');
    }

    const pediService = db.services.find((s) => s.id === 'srv-pedispa-gel');
    if (!pediService) throw new Error('Expected pedicure service');
    const ineligibleRes = assertSlotBookable(
      { ...ctx, service: pediService },
      {
        startAt: zonedDateTimeToUtc('2026-12-01', '10:00', tz).toISOString(),
        staffId: 'staff-tere',
      },
    );
    expect(ineligibleRes.ok).toBe(false);
    if (!ineligibleRes.ok) {
      observedCodes.add(ineligibleRes.code);
      expect(ineligibleRes.code).toBe('STAFF_INELIGIBLE');
      expect(ineligibleRes.suggestedSlots.every((s) => s.staffId === 'staff-karla')).toBe(
        true,
      );
    }

    const occupiedStart = zonedDateTimeToUtc('2026-12-01', '11:00', tz).toISOString();
    const occupiedEnd = zonedDateTimeToUtc('2026-12-01', '12:00', tz).toISOString();
    const occupiedBufEnd = zonedDateTimeToUtc('2026-12-01', '12:15', tz).toISOString();
    const takenCtx: AvailabilityContext = {
      ...ctx,
      bookings: [
        {
          id: 'bk-existing',
          bookingCode: 'NL-7777',
          manageToken: 'tok-7777',
          idempotencyKey: null,
          serviceId: ctx.service.id,
          staffId: 'staff-karla',
          clientId: 'client-1',
          startAt: occupiedStart,
          endAt: occupiedEnd,
          occupiedStartAt: occupiedStart,
          occupiedEndAt: occupiedBufEnd,
          totalDurationMinutes: 60,
          subtotalCents: 38000,
          discountCents: 0,
          totalPriceCents: 38000,
          depositAmountCents: 20000,
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
          createdAt: occupiedStart,
          updatedAt: occupiedStart,
        },
      ],
    };

    const takenRes = assertSlotBookable(takenCtx, {
      startAt: occupiedStart,
      staffId: 'staff-karla',
    });
    expect(takenRes.ok).toBe(false);
    if (!takenRes.ok) {
      observedCodes.add(takenRes.code);
      expect(takenRes.code).toBe('SLOT_TAKEN');
    }
    for (const code of expectedCodes) {
      expect(observedCodes.has(code)).toBe(true);
    }

    const ignoredRes = assertSlotBookable(takenCtx, {
      startAt: occupiedStart,
      staffId: 'staff-karla',
      ignoreBookingId: 'bk-existing',
    });
    expect(ignoredRes.ok).toBe(true);

    const holdStart = zonedDateTimeToUtc('2026-12-01', '15:00', tz).toISOString();
    const holdEnd = zonedDateTimeToUtc('2026-12-01', '16:15', tz).toISOString();
    const now = ctx.now ?? new Date('2026-12-01T13:00:00.000Z');
    const heldCtx: AvailabilityContext = {
      ...ctx,
      slotHolds: [
        {
          id: 'hold-x',
          staffId: 'staff-karla',
          serviceId: ctx.service.id,
          sessionToken: 'sess-owner',
          startAt: holdStart,
          endAt: holdEnd,
          expiresAt: new Date(now.getTime() + 180_000).toISOString(),
          createdAt: now.toISOString(),
        },
      ],
    };

    const blockedByHold = assertSlotBookable(heldCtx, {
      startAt: holdStart,
      staffId: 'staff-karla',
      ignoreHoldSessionToken: 'sess-other',
    });
    expect(blockedByHold.ok).toBe(false);
    if (!blockedByHold.ok) {
      expect(blockedByHold.code).toBe('SLOT_TAKEN');
    }

    const allowedForHolder = assertSlotBookable(heldCtx, {
      startAt: holdStart,
      staffId: 'staff-karla',
      ignoreHoldSessionToken: 'sess-owner',
    });
    expect(allowedForHolder.ok).toBe(true);
  });

  it('D7: diagnoseDateSlots respects slotIntervalMinutes and maxBookingDaysAhead', () => {
    const ctx = buildContinuousContext();
    ctx.settings = {
      ...ctx.settings,
      slotIntervalMinutes: 15,
      maxBookingDaysAhead: 10,
    };

    const nearDate = '2026-12-03';
    const nearSlots = getAvailableSlotsForDate(ctx, nearDate, 'staff-karla');
    const nearDiag = diagnoseDateSlots(ctx, nearDate, 'staff-karla');

    expect(nearDiag.some((d) => d.time24 === '10:15')).toBe(true);
    expect(nearDiag.some((d) => d.time24 === '10:45')).toBe(true);

    const nearAvailSet = new Set(nearSlots.map((s) => s.localTime24));
    for (const d of nearDiag) {
      expect(d.isAvailable).toBe(nearAvailSet.has(d.time24));
    }

    const beyondDate = '2026-12-25';
    const beyondSlots = getAvailableSlotsForDate(ctx, beyondDate, 'staff-karla');
    const beyondDiag = diagnoseDateSlots(ctx, beyondDate, 'staff-karla');
    expect(beyondSlots).toHaveLength(0);
    expect(beyondDiag.every((d) => d.isAvailable === false)).toBe(true);
    const atTenBeyond = beyondDiag.find((d) => d.time24 === '10:00');
    expect(atTenBeyond?.reason).toContain('anticipación');
  });

  it('handles DST spring-forward and fall-back transition dates accurately', () => {
    const ctx = buildContinuousContext();
    const staffId = 'staff-karla';

    const nySpringCtx: AvailabilityContext = {
      ...ctx,
      now: new Date('2026-03-01T12:00:00.000Z'),
      settings: {
        ...ctx.settings,
        timezone: 'America/New_York',
        slotIntervalMinutes: 30,
        minBookingNoticeMinutes: 0,
        maxBookingDaysAhead: 60,
      },
      service: {
        ...ctx.service,
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
      },
      schedules: [
        {
          id: 'sched-ny',
          staffId,
          name: 'NY DST',
          timezone: 'America/New_York',
          isDefault: true,
          rules: [
            { id: 'r-sun-early', dayOfWeek: 0, startTime: '01:00', endTime: '03:00' },
            { id: 'r-sun-day', dayOfWeek: 0, startTime: '09:00', endTime: '12:00' },
          ],
        },
      ],
    };

    const springSlots = getAvailableSlotsForDate(nySpringCtx, '2026-03-08', staffId);
    const springTimes = springSlots.map((s) => s.localTime24);
    expect(springTimes).toContain('01:00');
    expect(springTimes).not.toContain('01:30');
    expect(springTimes).not.toContain('02:00');
    expect(springTimes).not.toContain('02:30');
    expect(springTimes).toContain('09:00');

    const slot0100 = springSlots.find((s) => s.localTime24 === '01:00');
    expect(slot0100?.startAt).toBe('2026-03-08T06:00:00.000Z');
    expect(slot0100?.endAt).toBe('2026-03-08T07:00:00.000Z');

    const slot0900 = springSlots.find((s) => s.localTime24 === '09:00');
    expect(slot0900?.startAt).toBe('2026-03-08T13:00:00.000Z');

    const nyFallCtx: AvailabilityContext = {
      ...nySpringCtx,
      now: new Date('2026-10-25T12:00:00.000Z'),
      schedules: [
        {
          id: 'sched-ny-fall',
          staffId,
          name: 'NY Fall',
          timezone: 'America/New_York',
          isDefault: true,
          rules: [{ id: 'r-sun', dayOfWeek: 0, startTime: '00:30', endTime: '04:00' }],
        },
      ],
    };

    const fallSlots = getAvailableSlotsForDate(nyFallCtx, '2026-11-01', staffId);
    const fallAt0100 = fallSlots.find((s) => s.localTime24 === '01:00');
    const fallAt0200 = fallSlots.find((s) => s.localTime24 === '02:00');
    expect(fallAt0100?.startAt).toBe('2026-11-01T05:00:00.000Z');
    expect(fallAt0200?.startAt).toBe('2026-11-01T07:00:00.000Z');
    for (const s of fallSlots) {
      expect(new Date(s.endAt).getTime() - new Date(s.startAt).getTime()).toBe(60 * 60_000);
    }

    const madridSpringCtx: AvailabilityContext = {
      ...nySpringCtx,
      now: new Date('2026-03-20T12:00:00.000Z'),
      settings: {
        ...nySpringCtx.settings,
        timezone: 'Europe/Madrid',
      },
      schedules: [
        {
          id: 'sched-mad',
          staffId,
          name: 'Madrid DST',
          timezone: 'Europe/Madrid',
          isDefault: true,
          rules: [{ id: 'r-sun', dayOfWeek: 0, startTime: '01:00', endTime: '05:00' }],
        },
      ],
    };
    const madridSlots = getAvailableSlotsForDate(madridSpringCtx, '2026-03-29', staffId);
    expect(madridSlots.map((s) => s.localTime24)).not.toContain('02:00');
    expect(madridSlots.map((s) => s.localTime24)).not.toContain('02:30');
    const madridAt0300 = madridSlots.find((s) => s.localTime24 === '03:00');
    expect(madridAt0300?.startAt).toBe('2026-03-29T01:00:00.000Z');
  });

  it('P1: cached Intl.DateTimeFormat computes 35-day availability across all staff rapidly', () => {
    const db = createInitialDemoDatabase();
    const service = db.services[0];
    if (!service) throw new Error('Expected seed service');
    const ctx: AvailabilityContext = {
      settings: db.settings,
      service,
      addons: [],
      staffMembers: db.staff,
      schedules: db.schedules,
      dateOverrides: db.dateOverrides,
      bookings: db.bookings,
      slotHolds: db.slotHolds,
      calendarConnections: db.calendarConnections,
      now: new Date('2026-12-01T13:00:00.000Z'),
    };

    getAvailabilityForRange(ctx, '2026-12-01', 1);

    const start = performance.now();
    const range = getAvailabilityForRange(ctx, '2026-12-01', 35);
    const elapsedMs = performance.now() - start;

    expect(range).toHaveLength(35);
    expect(elapsedMs).toBeLessThan(100);
  });
});
