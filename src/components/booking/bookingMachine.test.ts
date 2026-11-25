import { describe, expect, it } from 'vitest';
import type { AvailableSlot } from '@/lib/availability/engine';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import { toPublicServiceDTO, toPublicSettingsDTO } from '@/lib/public-dto';
import {
  buildInstagramDmSummary,
  formatServicePrice,
  getStaffScheduleLabel,
  resolveDepositAmountCents,
} from './bookingHelpers';
import {
  bookingReducer,
  createInitialBookingFlowState,
} from './bookingMachine';

const SAMPLE_SLOT: AvailableSlot = {
  startAt: '2026-12-01T16:00:00.000Z',
  endAt: '2026-12-01T18:00:00.000Z',
  occupiedStartAt: '2026-12-01T16:00:00.000Z',
  occupiedEndAt: '2026-12-01T18:00:00.000Z',
  staffId: 'staff-karla',
  staffName: 'Karla',
  localTime24: '10:00',
  localTime12: '10:00 a.m.',
  period: 'morning',
  availableStaffIds: ['staff-karla', 'staff-paty'],
};

const ALT_SLOT: AvailableSlot = {
  startAt: '2026-12-01T19:30:00.000Z',
  endAt: '2026-12-01T21:30:00.000Z',
  occupiedStartAt: '2026-12-01T19:30:00.000Z',
  occupiedEndAt: '2026-12-01T21:30:00.000Z',
  staffId: 'staff-paty',
  staffName: 'Paty',
  localTime24: '13:30',
  localTime12: '1:30 p.m.',
  period: 'afternoon',
  availableStaffIds: ['staff-paty'],
};

describe('bookingMachine reducer', () => {
  it('transitions browsing -> holding -> submitting -> confirmed', () => {
    const initial = createInitialBookingFlowState();
    expect(initial.phase).toBe('browsing');
    expect(initial.step).toBe('service');

    const held = bookingReducer(initial, {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-123',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'details',
    });
    expect(held.phase).toBe('holding');
    expect(held.step).toBe('details');
    expect(held.holdId).toBe('hold-123');
    expect(held.selectedSlot?.staffId).toBe('staff-karla');

    const submitting = bookingReducer(held, { type: 'START_SUBMIT' });
    expect(submitting.phase).toBe('submitting');
    expect(submitting.formError).toBeNull();

    const confirmed = bookingReducer(submitting, {
      type: 'SUBMIT_CONFIRMED',
      manageUrl: '/cita/token-abc',
    });
    expect(confirmed.phase).toBe('confirmed');
    expect(confirmed.confirmedManageUrl).toBe('/cita/token-abc');
  });

  it('handles 409 conflict during submit without losing details step', () => {
    const held = bookingReducer(createInitialBookingFlowState(), {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-123',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'details',
    });
    const submitting = bookingReducer(held, { type: 'START_SUBMIT' });
    const conflicted = bookingReducer(submitting, {
      type: 'SLOT_CONFLICT',
      message: 'Horario tomado segundos antes.',
      suggestions: [ALT_SLOT],
    });

    expect(conflicted.phase).toBe('conflict');
    expect(conflicted.step).toBe('details');
    expect(conflicted.holdId).toBeNull();
    expect(conflicted.conflict?.suggestions).toHaveLength(1);

    const recovered = bookingReducer(conflicted, {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: ALT_SLOT,
      holdId: 'hold-456',
      holdExpiresAt: 1_900_000_180_000,
      nextStep: 'details',
    });
    expect(recovered.phase).toBe('holding');
    expect(recovered.conflict).toBeNull();
    expect(recovered.selectedSlot?.staffId).toBe('staff-paty');
  });

  it('returns to schedule and clears slot when hold expires', () => {
    const held = bookingReducer(createInitialBookingFlowState(), {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-123',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'details',
    });
    const expired = bookingReducer(held, {
      type: 'HOLD_EXPIRED',
      message: 'Tu apartado temporal expiró.',
    });

    expect(expired.phase).toBe('conflict');
    expect(expired.step).toBe('schedule');
    expect(expired.selectedSlot).toBeNull();
    expect(expired.holdId).toBeNull();

    const dismissed = bookingReducer(expired, { type: 'DISMISS_CONFLICT' });
    expect(dismissed.phase).toBe('browsing');
    expect(dismissed.conflict).toBeNull();
  });

  it('recovers holding phase on non-conflict submit failure and resets cleanly', () => {
    const held = bookingReducer(createInitialBookingFlowState(), {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-123',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'details',
    });
    const failed = bookingReducer(
      bookingReducer(held, { type: 'START_SUBMIT' }),
      { type: 'SUBMIT_FAILED', error: 'Revisa tu teléfono' },
    );
    expect(failed.phase).toBe('holding');
    expect(failed.formError).toBe('Revisa tu teléfono');

    const back = bookingReducer(failed, { type: 'RESET_TO_SCHEDULE' });
    expect(back.phase).toBe('browsing');
    expect(back.step).toBe('schedule');
    expect(back.holdId).toBeNull();
    expect(back.formError).toBeNull();
  });

  it('tracks LFPDPPP privacy consent, marketing opt-in, and policy error codes', () => {
    const initial = createInitialBookingFlowState();
    expect(initial.privacyConsentAccepted).toBe(false);
    expect(initial.marketingOptIn).toBe(false);
    expect(initial.privacyConsentError).toBeNull();
    expect(initial.formErrorCode).toBeNull();

    const held = bookingReducer(initial, {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-789',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'details',
    });

    const missingConsent = bookingReducer(held, {
      type: 'CONSENT_REQUIRED_ERROR',
      message: 'Debes aceptar el Aviso de Privacidad.',
    });
    expect(missingConsent.phase).toBe('holding');
    expect(missingConsent.privacyConsentError).toBe(
      'Debes aceptar el Aviso de Privacidad.',
    );
    expect(missingConsent.formErrorCode).toBe('PRIVACY_CONSENT_REQUIRED');

    const accepted = bookingReducer(missingConsent, {
      type: 'SET_PRIVACY_CONSENT',
      accepted: true,
    });
    expect(accepted.privacyConsentAccepted).toBe(true);
    expect(accepted.privacyConsentError).toBeNull();
    expect(accepted.formError).toBeNull();
    expect(accepted.formErrorCode).toBeNull();

    const optedIn = bookingReducer(accepted, {
      type: 'SET_MARKETING_OPT_IN',
      optedIn: true,
    });
    expect(optedIn.marketingOptIn).toBe(true);

    const maxActiveFailed = bookingReducer(
      bookingReducer(optedIn, { type: 'START_SUBMIT' }),
      {
        type: 'SUBMIT_FAILED',
        error: 'Ya alcanzaste el límite de citas activas.',
        code: 'MAX_ACTIVE_BOOKINGS',
        activeBookings: [
          {
            bookingCode: 'NL-1042',
            serviceName: 'Rubber',
            staffName: 'Karla',
            startAt: '2026-12-01T16:00:00.000Z',
            manageUrl: '/cita/demo-token-sofia-1042',
          },
        ],
      },
    );
    expect(maxActiveFailed.phase).toBe('holding');
    expect(maxActiveFailed.formErrorCode).toBe('MAX_ACTIVE_BOOKINGS');
    expect(maxActiveFailed.activeBookings).toHaveLength(1);
    expect(maxActiveFailed.activeBookings[0]?.manageUrl).toBe(
      '/cita/demo-token-sofia-1042',
    );

    const back = bookingReducer(maxActiveFailed, { type: 'RESET_TO_SCHEDULE' });
    expect(back.privacyConsentAccepted).toBe(true);
    expect(back.marketingOptIn).toBe(true);
    expect(back.formErrorCode).toBeNull();
    expect(back.activeBookings).toEqual([]);
  });
});

describe('time-first staff assignment', () => {
  it('holds the slot, opens the staff step, then reassigns to the chosen artist', () => {
    const held = bookingReducer(createInitialBookingFlowState(), {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-any',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'staff',
    });
    expect(held.step).toBe('staff');
    expect(held.phase).toBe('holding');

    const assigned = bookingReducer(held, {
      type: 'STAFF_ASSIGNED',
      slot: { ...SAMPLE_SLOT, staffId: 'staff-paty', staffName: 'Paty' },
      holdId: 'hold-paty',
      holdExpiresAt: 1_900_000_300_000,
    });
    expect(assigned.step).toBe('details');
    expect(assigned.selectedSlot?.staffId).toBe('staff-paty');
    expect(assigned.holdId).toBe('hold-paty');

    const back = bookingReducer(assigned, { type: 'GO_TO_STEP', step: 'staff' });
    expect(back.step).toBe('staff');
    expect(back.holdId).toBe('hold-paty');
  });
});

describe('bookingHelpers', () => {
  it('formats starting prices, staff shifts, deposit amount, and IG DM summary', () => {
    expect(formatServicePrice(35000, true, 'MXN')).toMatch(/^Desde \$350/);
    expect(formatServicePrice(15000, false, 'MXN')).toMatch(/^\$150/);

    expect(
      getStaffScheduleLabel({ id: 'staff-karla', bookingSlug: 'karla', name: 'Karla' }),
    ).toBe('Lun–Sáb · 10:00 · 1:30 · 4:30');
    expect(
      getStaffScheduleLabel({ id: 'staff-paty', bookingSlug: 'paty', name: 'Paty' }),
    ).toBe('Lun–Sáb · 10:00 · 1:30 · 4:30');
    expect(
      getStaffScheduleLabel({ id: 'staff-tere', bookingSlug: 'tere', name: 'Tere' }),
    ).toBe('Lun–Sáb · 2:00 · 4:00 · 6:00');

    const db = createInitialDemoDatabase();
    const settings = toPublicSettingsDTO(db.settings);
    const primaryRaw = db.services[0];
    const extraRaw = db.services[5];
    expect(primaryRaw).toBeDefined();
    expect(extraRaw).toBeDefined();
    if (!primaryRaw || !extraRaw) return;
    const primary = toPublicServiceDTO(primaryRaw);
    const extra = toPublicServiceDTO(extraRaw);

    const depositCents = resolveDepositAmountCents(settings, primary, [extra]);
    expect(depositCents).toBe(20000);

    const summary = buildInstagramDmSummary({
      settings,
      primaryService: primary,
      extraServices: [extra],
      addons: [],
      slot: SAMPLE_SLOT,
      timeFormat: '12h',
      totalDurationMinutes: primary.durationMinutes + extra.durationMinutes,
      depositAmountCents: depositCents,
      clientName: 'Sofía Ramírez',
      clientInstagram: 'sofia.mx',
    });
    expect(summary).toContain('@laikona.nailsss');
    expect(summary).toContain(primary.name);
    expect(summary).toContain(extra.name);
    expect(summary).toContain('Karla');
    expect(summary).toContain('@sofia.mx');
  });
});
