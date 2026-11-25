import type { AvailableSlot } from '@/lib/availability/engine';

type BookingPhase =
  | 'browsing'
  | 'holding'
  | 'submitting'
  | 'confirmed'
  | 'conflict';

interface BookingConflictState {
  message: string;
  suggestions: AvailableSlot[];
}

interface BookingFlowState {
  phase: BookingPhase;
  step: 'schedule' | 'details';
  selectedSlot: AvailableSlot | null;
  holdId: string | null;
  holdExpiresAt: number | null;
  conflict: BookingConflictState | null;
  formError: string | null;
  confirmedManageUrl: string | null;
}

export type BookingFlowAction =
  | {
      type: 'SELECT_SLOT_HOLD_ACQUIRED';
      slot: AvailableSlot;
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
      type: 'START_SUBMIT';
    }
  | {
      type: 'SUBMIT_FAILED';
      error: string;
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
      type: 'DISMISS_CONFLICT';
    };

export function createInitialBookingFlowState(): BookingFlowState {
  return {
    phase: 'browsing',
    step: 'schedule',
    selectedSlot: null,
    holdId: null,
    holdExpiresAt: null,
    conflict: null,
    formError: null,
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
        step: 'details',
        selectedSlot: action.slot,
        holdId: action.holdId,
        holdExpiresAt: action.holdExpiresAt,
        conflict: null,
        formError: null,
      };

    case 'SLOT_CONFLICT':
      return {
        ...state,
        phase: 'conflict',
        step: action.returnToSchedule ? 'schedule' : state.step,
        selectedSlot: action.returnToSchedule ? null : state.selectedSlot,
        holdId: null,
        holdExpiresAt: null,
        conflict: {
          message: action.message,
          suggestions: action.suggestions,
        },
        formError: null,
      };

    case 'HOLD_EXPIRED':
      return {
        ...state,
        phase: 'conflict',
        step: 'schedule',
        selectedSlot: null,
        holdId: null,
        holdExpiresAt: null,
        conflict: {
          message: action.message,
          suggestions: [],
        },
      };

    case 'START_SUBMIT':
      return {
        ...state,
        phase: 'submitting',
        conflict: null,
        formError: null,
      };

    case 'SUBMIT_FAILED':
      return {
        ...state,
        phase: state.holdId ? 'holding' : 'browsing',
        formError: action.error,
      };

    case 'SUBMIT_CONFIRMED':
      return {
        ...state,
        phase: 'confirmed',
        conflict: null,
        formError: null,
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
        formError: null,
      };

    case 'SELECTION_CHANGED':
      return {
        ...state,
        phase: 'browsing',
        selectedSlot: null,
        holdId: null,
        holdExpiresAt: null,
        conflict: null,
        formError: null,
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
