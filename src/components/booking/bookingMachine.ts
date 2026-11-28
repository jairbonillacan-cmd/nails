import type { AvailableSlot } from '@/lib/availability/engine';
import type { ActiveBookingSummary } from './bookingApi';

type BookingPhase =
  | 'browsing'
  | 'holding'
  | 'submitting'
  | 'confirmed'
  | 'conflict';

export type BookingStep = 'service' | 'schedule' | 'staff' | 'details' | 'payment';

export const BOOKING_STEPS: readonly BookingStep[] = [
  'service',
  'schedule',
  'staff',
  'details',
  'payment',
];

export const BOOKING_STEP_URL_SLUGS: Readonly<Record<BookingStep, string>> = {
  service: 'servicio',
  schedule: 'horario',
  staff: 'profesional',
  details: 'datos',
  payment: 'anticipo',
};

export function isSlotRequiredStep(step: BookingStep): boolean {
  return step === 'staff' || step === 'details' || step === 'payment';
}

export function isPostHoldStep(step: BookingStep): boolean {
  return step === 'details' || step === 'payment';
}

export function parseBookingStepParam(raw: string | null | undefined): BookingStep | null {
  const normalized = raw?.trim().toLowerCase() ?? '';
  if (!normalized) return null;
  if (normalized === 'servicio' || normalized === 'service') return 'service';
  if (normalized === 'horario' || normalized === 'schedule') return 'schedule';
  if (normalized === 'profesional' || normalized === 'staff') return 'staff';
  if (normalized === 'datos' || normalized === 'details') return 'details';
  if (normalized === 'anticipo' || normalized === 'payment') return 'payment';
  return null;
}

export function clampBookingStep(
  step: BookingStep,
  selectedSlot: AvailableSlot | null,
): BookingStep {
  if (!selectedSlot && isSlotRequiredStep(step)) {
    return 'schedule';
  }
  return step;
}

export interface BookingConflictState {
  kind: 'taken' | 'expired';
  message: string;
  suggestions: AvailableSlot[];
}

export interface BookingHoldErrorState {
  kind: 'rate_limited' | 'policy' | 'unavailable';
  message: string;
  retryAfterSeconds?: number;
}

export interface BookingFlowState {
  phase: BookingPhase;
  step: BookingStep;
  selectedSlot: AvailableSlot | null;
  holdId: string | null;
  holdExpiresAt: number | null;
  holdExpired: boolean;
  holdExpiredMessage: string | null;
  holdError: BookingHoldErrorState | null;
  conflict: BookingConflictState | null;
  formError: string | null;
  formErrorCode: string | null;
  activeBookings: ActiveBookingSummary[];
  privacyConsentAccepted: boolean;
  marketingOptIn: boolean;
  privacyConsentError: string | null;
  confirmedManageUrl: string | null;
}

export type BookingFlowAction =
  | {
      type: 'SELECT_SLOT_HOLD_ACQUIRED';
      slot: AvailableSlot;
      holdId: string | null;
      holdExpiresAt: number | null;
      nextStep: BookingStep;
    }
  | {
      type: 'STAFF_ASSIGNED';
      slot: AvailableSlot;
      holdId: string | null;
      holdExpiresAt: number | null;
    }
  | {
      type: 'GO_TO_STEP';
      step: BookingStep;
    }
  | {
      type: 'HOLD_EXTENDED';
      holdId: string | null;
      holdExpiresAt: number | null;
    }
  | {
      type: 'SLOT_CONFLICT';
      message: string;
      suggestions: AvailableSlot[];
      returnToSchedule?: boolean;
    }
  | {
      type: 'HOLD_EXPIRED';
      message: string;
    }
  | {
      type: 'SET_PRIVACY_CONSENT';
      accepted: boolean;
    }
  | {
      type: 'SET_MARKETING_OPT_IN';
      optedIn: boolean;
    }
  | {
      type: 'CONSENT_REQUIRED_ERROR';
      message: string;
    }
  | {
      type: 'START_SUBMIT';
    }
  | {
      type: 'SUBMIT_FAILED';
      error: string;
      code?: string | null;
      activeBookings?: ActiveBookingSummary[];
    }
  | {
      type: 'SUBMIT_CONFIRMED';
      manageUrl: string;
    }
  | {
      type: 'RESET_TO_SCHEDULE';
    }
  | {
      type: 'SELECTION_CHANGED';
    }
  | {
      type: 'HOLD_ERROR';
      error: BookingHoldErrorState;
    }
  | {
      type: 'DISMISS_HOLD_ERROR';
    }
  | {
      type: 'DISMISS_CONFLICT';
    };

export function createInitialBookingFlowState(
  initialStep: BookingStep = 'service',
): BookingFlowState {
  return {
    phase: 'browsing',
    step: clampBookingStep(initialStep, null),
    selectedSlot: null,
    holdId: null,
    holdExpiresAt: null,
    holdExpired: false,
    holdExpiredMessage: null,
    holdError: null,
    conflict: null,
    formError: null,
    formErrorCode: null,
    activeBookings: [],
    privacyConsentAccepted: false,
    marketingOptIn: false,
    privacyConsentError: null,
    confirmedManageUrl: null,
  };
}

export function bookingReducer(
  state: BookingFlowState,
  action: BookingFlowAction,
): BookingFlowState {
  switch (action.type) {
    case 'SELECT_SLOT_HOLD_ACQUIRED':
      return {
        ...state,
        phase: 'holding',
        step: action.nextStep,
        selectedSlot: action.slot,
        holdId: action.holdId,
        holdExpiresAt: action.holdExpiresAt,
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: null,
        formError: null,
        formErrorCode: null,
        activeBookings: [],
        privacyConsentError: null,
      };

    case 'STAFF_ASSIGNED':
      return {
        ...state,
        phase: 'holding',
        selectedSlot: action.slot,
        holdId: action.holdId ?? state.holdId,
        holdExpiresAt: action.holdExpiresAt ?? state.holdExpiresAt,
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: null,
      };

    case 'GO_TO_STEP':
      return {
        ...state,
        step: clampBookingStep(action.step, state.selectedSlot),
        holdError: null,
      };

    case 'HOLD_EXTENDED':
      if (!state.selectedSlot || state.holdExpired || state.phase === 'submitting' || state.phase === 'confirmed') {
        return state;
      }
      return {
        ...state,
        holdId: action.holdId ?? state.holdId,
        holdExpiresAt: action.holdExpiresAt ?? state.holdExpiresAt,
        holdError: null,
      };

    case 'SLOT_CONFLICT': {
      const nextSlot = action.returnToSchedule ? null : state.selectedSlot;
      const requestedStep = action.returnToSchedule ? 'schedule' : state.step;
      return {
        ...state,
        phase: 'conflict',
        step: clampBookingStep(requestedStep, nextSlot),
        selectedSlot: nextSlot,
        holdId: null,
        holdExpiresAt: null,
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: {
          kind: 'taken',
          message: action.message,
          suggestions: action.suggestions,
        },
        formError: null,
        formErrorCode: null,
        activeBookings: [],
      };
    }

    case 'HOLD_EXPIRED':
      if (isPostHoldStep(state.step) && state.selectedSlot) {
        return {
          ...state,
          phase: 'conflict',
          selectedSlot: state.selectedSlot,
          holdId: null,
          holdExpiresAt: null,
          holdExpired: true,
          holdExpiredMessage: action.message,
          holdError: null,
          conflict: null,
        };
      }
      return {
        ...state,
        phase: 'conflict',
        step: 'schedule',
        selectedSlot: null,
        holdId: null,
        holdExpiresAt: null,
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: {
          kind: 'expired',
          message: action.message,
          suggestions: [],
        },
      };

    case 'SET_PRIVACY_CONSENT':
      return {
        ...state,
        privacyConsentAccepted: action.accepted,
        privacyConsentError: action.accepted ? null : state.privacyConsentError,
        formError:
          action.accepted && state.formErrorCode === 'PRIVACY_CONSENT_REQUIRED'
            ? null
            : state.formError,
        formErrorCode:
          action.accepted && state.formErrorCode === 'PRIVACY_CONSENT_REQUIRED'
            ? null
            : state.formErrorCode,
      };

    case 'SET_MARKETING_OPT_IN':
      return {
        ...state,
        marketingOptIn: action.optedIn,
      };

    case 'CONSENT_REQUIRED_ERROR':
      return {
        ...state,
        privacyConsentError: action.message,
        formError: action.message,
        formErrorCode: 'PRIVACY_CONSENT_REQUIRED',
        activeBookings: [],
      };

    case 'START_SUBMIT':
      if (state.phase === 'submitting' || state.phase === 'confirmed' || !state.selectedSlot) {
        return state;
      }
      return {
        ...state,
        phase: 'submitting',
        holdError: null,
        conflict: null,
        formError: null,
        formErrorCode: null,
        activeBookings: [],
        privacyConsentError: null,
      };

    case 'SUBMIT_FAILED': {
      const code = action.code ?? null;
      return {
        ...state,
        phase: state.holdId ? 'holding' : 'browsing',
        formError: action.error,
        formErrorCode: code,
        activeBookings: action.activeBookings ?? [],
        privacyConsentError:
          code === 'PRIVACY_CONSENT_REQUIRED' ? action.error : null,
      };
    }

    case 'SUBMIT_CONFIRMED':
      return {
        ...state,
        phase: 'confirmed',
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: null,
        formError: null,
        formErrorCode: null,
        activeBookings: [],
        privacyConsentError: null,
        confirmedManageUrl: action.manageUrl,
      };

    case 'RESET_TO_SCHEDULE':
      return {
        ...state,
        phase: 'browsing',
        step: 'schedule',
        selectedSlot: null,
        holdId: null,
        holdExpiresAt: null,
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: null,
        formError: null,
        formErrorCode: null,
        activeBookings: [],
        privacyConsentError: null,
      };

    case 'SELECTION_CHANGED':
      return {
        ...state,
        phase: 'browsing',
        step: clampBookingStep(state.step, null),
        selectedSlot: null,
        holdId: null,
        holdExpiresAt: null,
        holdExpired: false,
        holdExpiredMessage: null,
        holdError: null,
        conflict: null,
        formError: null,
        formErrorCode: null,
        activeBookings: [],
        privacyConsentError: null,
      };

    case 'HOLD_ERROR':
      return {
        ...state,
        holdError: action.error,
        conflict: null,
      };

    case 'DISMISS_HOLD_ERROR':
      return {
        ...state,
        holdError: null,
      };

    case 'DISMISS_CONFLICT':
      return {
        ...state,
        phase:
          state.phase === 'conflict'
            ? state.holdId
              ? 'holding'
              : 'browsing'
            : state.phase,
        conflict: null,
      };
  }
}
