'use client';

import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { CitaCancelDialog } from './CitaCancelDialog';
import { CitaRescheduleDialog } from './CitaRescheduleDialog';

interface CitaDialogsProps {
  timezone: string;
  minCancelHours: number;
  minRescheduleHours: number;
  rescheduleWindowAllowed: boolean;
  cancelWindowAllowed: boolean;
  policyHelpWhatsappUrl: string;
  couponCode: string | null;
  busy: boolean;
  submittingSlotStartAt: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  conflictSlots?: AvailableSlot[];
  rescheduleOpen: boolean;
  rescheduleReasonChoice: string | null;
  rescheduleReason: string;
  rescheduleDays: DayAvailabilitySummary[];
  loadingSlots: boolean;
  slotsError?: string | null;
  cancelOpen: boolean;
  cancelReasonChoice: string | null;
  cancelReason: string;
  onRescheduleOpenChange: (open: boolean) => void;
  onSelectRescheduleChip: (option: string) => void;
  onChangeRescheduleReason: (value: string) => void;
  onConfirmReschedule: (slot: AvailableSlot) => void;
  onRetrySlots?: () => void;
  onCancelOpenChange: (open: boolean) => void;
  onSelectCancelChip: (option: string) => void;
  onChangeCancelReason: (value: string) => void;
  onConfirmCancel: () => Promise<void> | void;
}

export function CitaDialogs({
  timezone,
  minCancelHours,
  minRescheduleHours,
  rescheduleWindowAllowed,
  cancelWindowAllowed,
  policyHelpWhatsappUrl,
  couponCode,
  busy,
  submittingSlotStartAt,
  errorMessage = null,
  errorCode = null,
  conflictSlots = [],
  rescheduleOpen,
  rescheduleReasonChoice,
  rescheduleReason,
  rescheduleDays,
  loadingSlots,
  slotsError = null,
  cancelOpen,
  cancelReasonChoice,
  cancelReason,
  onRescheduleOpenChange,
  onSelectRescheduleChip,
  onChangeRescheduleReason,
  onConfirmReschedule,
  onRetrySlots,
  onCancelOpenChange,
  onSelectCancelChip,
  onChangeCancelReason,
  onConfirmCancel,
}: CitaDialogsProps) {
  return (
    <>
      <CitaRescheduleDialog
        timezone={timezone}
        minRescheduleHours={minRescheduleHours}
        rescheduleWindowAllowed={rescheduleWindowAllowed}
        policyHelpWhatsappUrl={policyHelpWhatsappUrl}
        busy={busy}
        submittingSlotStartAt={submittingSlotStartAt}
        errorMessage={errorMessage}
        errorCode={errorCode}
        conflictSlots={conflictSlots}
        isOpen={rescheduleOpen}
        reasonChoice={rescheduleReasonChoice}
        reason={rescheduleReason}
        days={rescheduleDays}
        loadingSlots={loadingSlots}
        slotsError={slotsError}
        onOpenChange={onRescheduleOpenChange}
        onSelectChip={onSelectRescheduleChip}
        onChangeReason={onChangeRescheduleReason}
        onConfirmReschedule={onConfirmReschedule}
        onRetrySlots={onRetrySlots}
      />
      <CitaCancelDialog
        minCancelHours={minCancelHours}
        cancelWindowAllowed={cancelWindowAllowed}
        policyHelpWhatsappUrl={policyHelpWhatsappUrl}
        couponCode={couponCode}
        busy={busy}
        errorMessage={errorMessage}
        errorCode={errorCode}
        isOpen={cancelOpen}
        reasonChoice={cancelReasonChoice}
        reason={cancelReason}
        onOpenChange={onCancelOpenChange}
        onSelectChip={onSelectCancelChip}
        onChangeReason={onChangeCancelReason}
        onConfirmCancel={onConfirmCancel}
      />
    </>
  );
}
