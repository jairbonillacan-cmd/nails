import { describe, expect, it } from 'vitest';
import type { AvailableSlot } from '@/lib/availability/engine';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import { toPublicServiceDTO, toPublicSettingsDTO } from '@/lib/public-dto';
import {
  buildInstagramDmSummary,
  formatFileSize,
  formatServicePrice,
  getStaffScheduleLabel,
  resolveDepositAmountCents,
  validateClientImageFile,
} from './bookingHelpers';
import {
  BOOKING_STEPS,
  bookingReducer,
  createInitialBookingFlowState,
} from './bookingMachine';
import { computeStepNavigation } from './bookingViewHelpers';

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
  it('orders the 5 streamlined booking steps cleanly and navigates across them', () => {
    expect(BOOKING_STEPS).toEqual(['service', 'schedule', 'staff', 'details', 'payment']);
    const initial = createInitialBookingFlowState();
    const schedule = bookingReducer(initial, { type: 'GO_TO_STEP', step: 'schedule' });
    expect(schedule.step).toBe('schedule');
    const backToService = bookingReducer(schedule, { type: 'GO_TO_STEP', step: 'service' });
    expect(backToService.step).toBe('service');
  });

  it('transitions browsing -> holding -> submitting -> confirmed and guards duplicate START_SUBMIT', () => {
    const initial = createInitialBookingFlowState();
    expect(initial.phase).toBe('browsing');
    expect(initial.step).toBe('service');
    expect(initial.holdExpired).toBe(false);

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

    const duplicateStart = bookingReducer(submitting, { type: 'START_SUBMIT' });
    expect(duplicateStart).toBe(submitting);

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
    expect(recovered.holdExpired).toBe(false);
    expect(recovered.selectedSlot?.staffId).toBe('staff-paty');
  });

  it('preserves details step and slot when hold expires on Step 4 so client data stays intact', () => {
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
    expect(expired.step).toBe('details');
    expect(expired.selectedSlot?.startAt).toBe(SAMPLE_SLOT.startAt);
    expect(expired.holdId).toBeNull();
    expect(expired.holdExpiresAt).toBeNull();
    expect(expired.holdExpired).toBe(true);
    expect(expired.holdExpiredMessage).toBe('Tu apartado temporal expiró.');

    const reheld = bookingReducer(expired, {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-999',
      holdExpiresAt: 1_900_000_300_000,
      nextStep: 'details',
    });
    expect(reheld.phase).toBe('holding');
    expect(reheld.step).toBe('details');
    expect(reheld.holdExpired).toBe(false);
    expect(reheld.holdExpiredMessage).toBeNull();
    expect(reheld.holdId).toBe('hold-999');
  });

  it('returns to schedule and clears slot when hold expires before Step 4', () => {
    const heldOnStaff = bookingReducer(createInitialBookingFlowState(), {
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot: SAMPLE_SLOT,
      holdId: 'hold-123',
      holdExpiresAt: 1_900_000_000_000,
      nextStep: 'staff',
    });
    const expired = bookingReducer(heldOnStaff, {
      type: 'HOLD_EXPIRED',
      message: 'Tu apartado temporal expiró.',
    });

    expect(expired.phase).toBe('conflict');
    expect(expired.step).toBe('schedule');
    expect(expired.selectedSlot).toBeNull();
    expect(expired.holdId).toBeNull();
    expect(expired.holdExpired).toBe(false);

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
  it('computes backTarget, nextLabel, and nextHint accurately across all 5 streamlined steps', () => {
    const baseInput = {
      hasSelectedService: true,
      requiresConfirmation: false,
      totalDurationMinutes: 90,
      extrasSelectedCount: 0,
      chosenStaffId: 'any',
      isSubmittingBooking: false,
      showsDeposit: true,
      proofDataUrl: null,
      proofDeliveryMethod: 'web_upload' as const,
    };

    const onService = computeStepNavigation({
      ...baseInput,
      flow: createInitialBookingFlowState(),
    });
    expect(onService.backTarget).toBeNull();
    expect(onService.canContinue).toBe(true);
    expect(onService.nextLabel).toBe('Continuar');
    expect(onService.nextHint).toBe('1 h 30 min en total');

    const onServiceWithExtras = computeStepNavigation({
      ...baseInput,
      extrasSelectedCount: 2,
      totalDurationMinutes: 125,
      flow: createInitialBookingFlowState(),
    });
    expect(onServiceWithExtras.nextHint).toContain('2 extras');

    const onSchedule = computeStepNavigation({
      ...baseInput,
      flow: { ...createInitialBookingFlowState(), step: 'schedule' },
    });
    expect(onSchedule.backTarget).toBe('service');
    expect(onSchedule.canContinue).toBe(false);

    const onStaff = computeStepNavigation({
      ...baseInput,
      flow: {
        ...createInitialBookingFlowState(),
        step: 'staff',
        phase: 'holding',
        selectedSlot: SAMPLE_SLOT,
      },
    });
    expect(onStaff.backTarget).toBe('schedule');
    expect(onStaff.canContinue).toBe(true);
    expect(onStaff.nextLabel).toBe('Continuar');

    const onDetails = computeStepNavigation({
      ...baseInput,
      flow: {
        ...createInitialBookingFlowState(),
        step: 'details',
        phase: 'holding',
        selectedSlot: SAMPLE_SLOT,
      },
    });
    expect(onDetails.backTarget).toBe('staff');
    expect(onDetails.nextLabel).toBe('Continuar');
    expect(onDetails.completedSteps.has('service')).toBe(true);
    expect(onDetails.completedSteps.has('schedule')).toBe(true);
    expect(onDetails.completedSteps.has('staff')).toBe(true);

    const onPayment = computeStepNavigation({
      ...baseInput,
      flow: { ...createInitialBookingFlowState(), step: 'payment', phase: 'holding', selectedSlot: SAMPLE_SLOT },
    });
    expect(onPayment.backTarget).toBe('details');
    expect(onPayment.nextLabel).toBe('Apartar mi cita');
    expect(onPayment.completedSteps.has('details')).toBe(true);
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
    expect(assigned.step).toBe('staff');
    expect(assigned.selectedSlot?.staffId).toBe('staff-paty');
    expect(assigned.holdId).toBe('hold-paty');

    const back = bookingReducer(assigned, { type: 'GO_TO_STEP', step: 'staff' });
    expect(back.step).toBe('staff');
    expect(back.holdId).toBe('hold-paty');
  });
});

describe('bookingHelpers', () => {
  it('formats starting prices, staff shifts (12h & 24h), deposit amount, and IG DM summary', () => {
    expect(formatServicePrice(35000, true, 'MXN')).toMatch(/^Desde \$350/);
    expect(formatServicePrice(15000, false, 'MXN')).toMatch(/^\$150/);

    expect(
      getStaffScheduleLabel({ id: 'staff-karla', bookingSlug: 'karla', name: 'Karla' }),
    ).toBe('Lun–Sáb · 10:00 AM · 1:30 PM · 4:30 PM');
    expect(
      getStaffScheduleLabel({ id: 'staff-karla', bookingSlug: 'karla', name: 'Karla' }, '24h'),
    ).toBe('Lun–Sáb · 10:00 · 13:30 · 16:30');
    expect(
      getStaffScheduleLabel({ id: 'staff-paty', bookingSlug: 'paty', name: 'Paty' }),
    ).toBe('Lun–Sáb · 10:00 AM · 1:30 PM · 4:30 PM');
    expect(
      getStaffScheduleLabel({ id: 'staff-tere', bookingSlug: 'tere', name: 'Tere' }),
    ).toBe('Lun–Sáb · 2:00 PM · 4:00 PM · 6:00 PM');
    expect(
      getStaffScheduleLabel({ id: 'staff-tere', bookingSlug: 'tere', name: 'Tere' }, '24h'),
    ).toBe('Lun–Sáb · 14:00 · 16:00 · 18:00');

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

  it('formats file sizes and validates image MIME, size, and binary signatures before submit', async () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(145_000)).toBe('142 KB');
    expect(formatFileSize(2_500_000)).toBe('2.4 MB');

    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const validPng = new File([pngHeader], 'comprobante.png', { type: 'image/png' });
    expect(await validateClientImageFile(validPng)).toBeNull();

    const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const validJpg = new File([jpegHeader], 'inspo.jpg', { type: 'image/jpeg' });
    expect(await validateClientImageFile(validJpg)).toBeNull();

    const emptyFile = new File([], 'vacio.png', { type: 'image/png' });
    expect(await validateClientImageFile(emptyFile)).toContain('vacío');

    const pdfFile = new File(['%PDF-1.4'], 'recibo.pdf', { type: 'application/pdf' });
    expect(await validateClientImageFile(pdfFile)).toContain('PNG, JPG o WEBP');

    const fakePng = new File(['not-a-real-image-header'], 'falso.png', { type: 'image/png' });
    expect(await validateClientImageFile(fakePng)).toContain('válida');

    const oversized = new File([new Uint8Array(2_600_000)], 'enorme.png', { type: 'image/png' });
    expect(await validateClientImageFile(oversized)).toContain('2.5 MB');
  });
});
