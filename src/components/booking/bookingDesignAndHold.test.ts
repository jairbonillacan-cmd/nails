import { describe, expect, it } from 'vitest';
import type { AvailableSlot } from '@/lib/availability/engine';
import { resolveInstagramDmUrl } from './bookingHelpers';
import { bookingReducer, createInitialBookingFlowState, isPostHoldStep } from './bookingMachine';
import { computeStepNavigation } from './bookingViewHelpers';
import { HOLD_EXTEND_PROMPT_SEC, shouldPromptHoldExtension } from './HoldExtendDialog';

const SLOT: AvailableSlot = {
  startAt: '2026-12-01T16:00:00.000Z',
  endAt: '2026-12-01T18:00:00.000Z',
  occupiedStartAt: '2026-12-01T16:00:00.000Z',
  occupiedEndAt: '2026-12-01T18:00:00.000Z',
  staffId: 'staff-karla',
  staffName: 'Karla',
  localTime24: '10:00',
  localTime12: '10:00 a.m.',
  period: 'morning',
  availableStaffIds: ['staff-karla'],
};

const NAV_BASE = {
  hasSelectedService: true,
  requiresConfirmation: false,
  totalDurationMinutes: 90,
  extrasSelectedCount: 0,
  chosenStaffId: 'any',
  isSubmittingBooking: false,
  showsDeposit: false,
  proofDataUrl: null,
  proofDeliveryMethod: 'web_upload' as const,
};

function heldOn(step: 'schedule' | 'staff' | 'details' | 'payment') {
  return bookingReducer(createInitialBookingFlowState(), {
    type: 'SELECT_SLOT_HOLD_ACQUIRED',
    slot: SLOT,
    holdId: 'hold-1',
    holdExpiresAt: 1_900_000_000_000,
    nextStep: step,
  });
}

describe('details & design hold recovery', () => {
  it('keeps slot and details step when the hold expires while writing contact or design notes', () => {
    const expired = bookingReducer(heldOn('details'), { type: 'HOLD_EXPIRED', message: 'Se acabó el tiempo.' });
    expect(expired.step).toBe('details');
    expect(expired.selectedSlot?.startAt).toBe(SLOT.startAt);
    expect(expired.holdExpired).toBe(true);
  });

  it('goes back from details directly to the artist step', () => {
    const onDetails = computeStepNavigation({ ...NAV_BASE, flow: heldOn('details') });
    expect(onDetails.backTarget).toBe('staff');
    expect(onDetails.canContinue).toBe(true);
    expect(onDetails.nextLabel).toBe('Continuar');
    expect(onDetails.completedSteps.has('schedule')).toBe(true);
    expect(onDetails.completedSteps.has('staff')).toBe(true);
  });

  it('keeps slot and step when the hold expires on the payment step', () => {
    const onPayment = bookingReducer(heldOn('details'), { type: 'GO_TO_STEP', step: 'payment' });
    const expired = bookingReducer(onPayment, { type: 'HOLD_EXPIRED', message: 'x' });
    expect(expired.step).toBe('payment');
    expect(expired.selectedSlot?.startAt).toBe(SLOT.startAt);
  });

  it('labels a hold that ran out before details as expired, not as taken by someone else', () => {
    for (const step of ['schedule', 'staff'] as const) {
      const expired = bookingReducer(heldOn(step), { type: 'HOLD_EXPIRED', message: 'Soltamos tu horario.' });
      expect(expired.step).toBe('schedule');
      expect(expired.selectedSlot).toBeNull();
      expect(expired.conflict?.kind).toBe('expired');
    }
    const taken = bookingReducer(heldOn('schedule'), {
      type: 'SLOT_CONFLICT',
      message: 'Alguien más lo tomó.',
      suggestions: [],
    });
    expect(taken.conflict?.kind).toBe('taken');
  });

  it('flags details and payment as post-hold steps', () => {
    expect(isPostHoldStep('details')).toBe(true);
    expect(isPostHoldStep('payment')).toBe(true);
    expect(isPostHoldStep('staff')).toBe(false);
    expect(isPostHoldStep('schedule')).toBe(false);
    expect(isPostHoldStep('service')).toBe(false);
  });

});

describe('no auto-advance', () => {
  it('stays on schedule after holding a slot and only advances on Continuar', () => {
    const held = heldOn('schedule');
    expect(held.step).toBe('schedule');
    expect(held.selectedSlot?.startAt).toBe(SLOT.startAt);
    const onSchedule = computeStepNavigation({ ...NAV_BASE, flow: held });
    expect(onSchedule.canContinue).toBe(true);
    expect(onSchedule.completedSteps.has('staff')).toBe(false);
  });

  it('keeps the artist step when an artist is picked', () => {
    const onStaff = heldOn('staff');
    const assigned = bookingReducer(onStaff, {
      type: 'STAFF_ASSIGNED',
      slot: { ...SLOT, staffId: 'staff-paty', staffName: 'Paty' },
      holdId: 'hold-2',
      holdExpiresAt: 1_900_000_300_000,
    });
    expect(assigned.step).toBe('staff');
    expect(assigned.selectedSlot?.staffName).toBe('Paty');
  });
});

describe('hold extension', () => {
  it('extends the hold in place without changing step or slot', () => {
    const held = heldOn('details');
    const extended = bookingReducer(held, {
      type: 'HOLD_EXTENDED',
      holdId: 'hold-2',
      holdExpiresAt: 1_900_000_300_000,
    });
    expect(extended.step).toBe('details');
    expect(extended.holdId).toBe('hold-2');
    expect(extended.holdExpiresAt).toBe(1_900_000_300_000);
    expect(extended.selectedSlot).toBe(held.selectedSlot);
  });

  it('ignores extensions after the hold already expired or while submitting', () => {
    const expired = bookingReducer(heldOn('details'), { type: 'HOLD_EXPIRED', message: 'x' });
    expect(bookingReducer(expired, { type: 'HOLD_EXTENDED', holdId: 'h', holdExpiresAt: 1 })).toBe(expired);
    const submitting = bookingReducer(heldOn('details'), { type: 'START_SUBMIT' });
    expect(bookingReducer(submitting, { type: 'HOLD_EXTENDED', holdId: 'h', holdExpiresAt: 1 })).toBe(submitting);
  });

  it('prompts only inside the last 30 seconds, once per hold window', () => {
    const base = { holdExpiresAt: 1000, dismissedForExpiresAt: null, isSubmitting: false };
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: HOLD_EXTEND_PROMPT_SEC + 1 })).toBe(false);
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: HOLD_EXTEND_PROMPT_SEC })).toBe(true);
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: 0 })).toBe(false);
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: 10, dismissedForExpiresAt: 1000 })).toBe(false);
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: 10, dismissedForExpiresAt: 500 })).toBe(true);
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: 10, isSubmitting: true })).toBe(false);
    expect(shouldPromptHoldExtension({ ...base, holdRemainingSec: 10, holdExpiresAt: null })).toBe(false);
  });
});

describe('resolveInstagramDmUrl', () => {
  it('builds an ig.me DM link from the handle, then the profile URL', () => {
    expect(resolveInstagramDmUrl({ instagramHandle: '@laikona.nailsss', instagramUrl: undefined })).toBe(
      'https://ig.me/m/laikona.nailsss',
    );
    expect(
      resolveInstagramDmUrl({ instagramHandle: '', instagramUrl: 'https://www.instagram.com/otro.salon/' }),
    ).toBe('https://ig.me/m/otro.salon');
  });
});
