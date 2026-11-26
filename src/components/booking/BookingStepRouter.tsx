'use client';

import type React from 'react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import type { useBookingFlowActions } from '@/lib/hooks/useBookingFlowActions';
import type { BookingSelectionState } from '@/lib/hooks/useBookingSelectionState';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { ServiceCategory } from '@/lib/types';
import { ClientConfirmStep } from './ClientConfirmStep';
import { ExtrasStep } from './ExtrasStep';
import { ScheduleStep } from './ScheduleStep';
import { ServiceStep } from './ServiceStep';
import { StaffStep } from './StaffStep';
import type { BookingFlowAction, BookingFlowState } from './bookingMachine';

type BookingActions = ReturnType<typeof useBookingFlowActions>;

interface ScheduleRouterState {
  todayKey: string;
  effectiveSelectedDate: string;
  availabilityDays: DayAvailabilitySummary[];
  availableDateSet: Set<string>;
  selectedDaySummary: DayAvailabilitySummary | null;
  loadingAvail: boolean;
  isRevalidatingAvail: boolean;
  onPrefetchService: (serviceId: string) => void;
  onSelectDate: (date: string) => void;
  onAdvanceMonth: () => void;
  onPrefetchNextMonth: () => void;
  onReturnToToday: () => void;
  onOpenWaitlist: () => void;
}

interface BookingStepRouterProps {
  formId: string;
  settings: PublicSettingsDTO;
  timezone: string;
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  staff: PublicStaffDTO[];
  flow: BookingFlowState;
  dispatch: React.Dispatch<BookingFlowAction>;
  selection: BookingSelectionState;
  actions: BookingActions;
  schedule: ScheduleRouterState;
  totalPriceCents: number;
}

export function BookingStepRouter({
  formId,
  settings,
  timezone,
  categories,
  services,
  staff,
  flow,
  dispatch,
  selection,
  actions,
  schedule,
  totalPriceCents,
}: BookingStepRouterProps) {
  if (flow.step === 'service') {
    return (
      <ServiceStep
        currency={settings.currency}
        categories={categories}
        services={services}
        selectedService={selection.selectedService}
        onSelectService={(serviceId) => {
          if (serviceId === selection.selectedService?.id) return;
          selection.setSelectedServiceId(serviceId);
          selection.setSelectedExtraServiceIds((prev) => prev.filter((id) => id !== serviceId));
          actions.resetSelection();
        }}
        onPrefetchService={schedule.onPrefetchService}
      />
    );
  }

  if (flow.step === 'extras') {
    return (
      <ExtrasStep
        currency={settings.currency}
        selectedServiceName={selection.selectedService?.name ?? null}
        extraServices={selection.extraServices}
        selectedExtraServiceIds={selection.selectedExtraServiceIds}
        compatibleAddons={selection.compatibleAddons}
        selectedAddonIds={selection.selectedAddonIds}
        onToggleExtraService={(serviceId, checked) => {
          const nextIds = checked
            ? Array.from(new Set([...selection.selectedExtraServiceIds, serviceId])).slice(0, 8)
            : selection.selectedExtraServiceIds.filter((id) => id !== serviceId);
          if (nextIds.join(',') === selection.selectedExtraServiceIds.join(',')) return;
          selection.setSelectedExtraServiceIds(nextIds);
          actions.resetSelection();
        }}
        onToggleAddon={(addonId, checked) => {
          const nextIds = checked
            ? Array.from(new Set([...selection.selectedAddonIds, addonId]))
            : selection.selectedAddonIds.filter((id) => id !== addonId);
          if (nextIds.join(',') === selection.selectedAddonIds.join(',')) return;
          selection.setSelectedAddonIds(nextIds);
          actions.resetSelection();
        }}
      />
    );
  }

  if (flow.step === 'schedule') {
    return (
      <ScheduleStep
        settings={settings}
        layoutView={selection.layoutView}
        timeFormat={selection.timeFormat}
        todayKey={schedule.todayKey}
        selectedDate={schedule.effectiveSelectedDate}
        availabilityDays={schedule.availabilityDays}
        availableDateSet={schedule.availableDateSet}
        selectedDaySummary={schedule.selectedDaySummary}
        selectedSlot={flow.selectedSlot}
        pinnedStaffName={selection.pinnedStaff?.name ?? null}
        pinnedStaffSchedule={selection.pinnedStaffSchedule}
        pendingSlotKey={actions.pendingSlotKey}
        isBusy={actions.isBusy}
        loadingAvail={schedule.loadingAvail}
        isRevalidating={schedule.isRevalidatingAvail}
        canAdvanceMonth={selection.canAdvanceMonth}
        isViewingFutureWindow={selection.windowStartDate > schedule.todayKey}
        onChangeLayoutView={selection.setLayoutView}
        onChangeTimeFormat={selection.setTimeFormat}
        onSelectDate={schedule.onSelectDate}
        onSelectSlot={(next: AvailableSlot) => void actions.handleSelectSlot(next)}
        onShowAllStaff={() => {
          if (selection.pinnedStaffId === 'any') return;
          selection.setPinnedStaffId('any');
          actions.resetSelection();
        }}
        onRedirectStaff={(staffId) => {
          if (selection.pinnedStaffId === staffId) return;
          selection.setPinnedStaffId(staffId);
          actions.resetSelection();
        }}
        onAdvanceMonth={schedule.onAdvanceMonth}
        onPrefetchNextMonth={schedule.onPrefetchNextMonth}
        onReturnToToday={schedule.onReturnToToday}
        onOpenWaitlist={schedule.onOpenWaitlist}
      />
    );
  }

  if (flow.step === 'staff' && flow.selectedSlot) {
    return (
      <StaffStep
        timezone={timezone}
        timeFormat={selection.timeFormat}
        slot={flow.selectedSlot}
        eligibleStaff={selection.eligibleStaff}
        allStaff={staff}
        chosenStaffId={actions.chosenStaffId}
        pendingStaffId={actions.pendingStaffId}
        takenStaffIds={actions.takenStaffIds}
        isBusy={actions.isBusy}
        errorMessage={actions.staffError}
        onPickStaff={(staffId) => void actions.handlePickStaff(staffId)}
      />
    );
  }

  if (flow.step === 'details') {
    return (
      <ClientConfirmStep
        formId={formId}
        settings={settings}
        selectedService={selection.selectedService}
        selectedExtraServices={selection.selectedExtraServices}
        activeSelectedAddons={selection.activeSelectedAddons}
        selectedSlot={flow.selectedSlot}
        timeFormat={selection.timeFormat}
        totalDurationMinutes={selection.totalDurationMinutes}
        subtotalCents={selection.subtotalCents}
        totalPriceCents={totalPriceCents}
        depositAmountCents={selection.depositAmountCents}
        couponInput={actions.couponInput}
        appliedCoupon={actions.appliedCoupon}
        couponError={actions.couponError}
        couponLoading={actions.couponLoading}
        clientName={selection.clientForm.clientName}
        clientPhone={selection.clientForm.clientPhone}
        clientInstagram={selection.clientForm.clientInstagram}
        clientEmail={selection.clientForm.clientEmail}
        clientBirthday={selection.clientForm.clientBirthday}
        clientNotes={selection.clientForm.clientNotes}
        inspoFile={selection.clientForm.inspoFile}
        inspoDataUrl={selection.clientForm.inspoDataUrl}
        proofDeliveryMethod={selection.clientForm.proofDeliveryMethod}
        proofFile={selection.clientForm.proofFile}
        proofDataUrl={selection.clientForm.proofDataUrl}
        privacyConsentAccepted={flow.privacyConsentAccepted}
        marketingOptIn={flow.marketingOptIn}
        privacyConsentError={flow.privacyConsentError}
        fieldErrors={actions.fieldErrors}
        formError={flow.formError}
        formErrorCode={flow.formErrorCode}
        activeBookings={flow.activeBookings}
        isSubmitting={actions.isSubmittingBooking}
        holdExpired={flow.holdExpired}
        holdExpiredMessage={flow.holdExpiredMessage}
        isReholding={actions.isReholding}
        onReholdSlot={() => void actions.handleReholdExpiredSlot()}
        onPickAnotherTime={() => {
          dispatch({ type: 'RESET_TO_SCHEDULE' });
          actions.revealPanel();
        }}
        onChangeCouponInput={actions.setCouponInput}
        onApplyCoupon={() => void actions.handleApplyCoupon()}
        onRemoveCoupon={actions.handleRemoveCoupon}
        onChangeClientName={selection.clientForm.onChangeClientName}
        onChangeClientPhone={selection.clientForm.onChangeClientPhone}
        onChangeClientInstagram={selection.clientForm.onChangeClientInstagram}
        onChangeClientEmail={selection.clientForm.onChangeClientEmail}
        onChangeClientBirthday={selection.clientForm.onChangeClientBirthday}
        onChangeClientNotes={selection.clientForm.onChangeClientNotes}
        onChangeInspoFile={selection.clientForm.onChangeInspoFile}
        onChangeProofMethod={selection.clientForm.onChangeProofMethod}
        onChangeProofFile={selection.clientForm.onChangeProofFile}
        onChangePrivacyConsent={(accepted) => dispatch({ type: 'SET_PRIVACY_CONSENT', accepted })}
        onChangeMarketingOptIn={(optedIn) => dispatch({ type: 'SET_MARKETING_OPT_IN', optedIn })}
        onSubmit={(e) => void actions.handleConfirmBooking(e)}
      />
    );
  }

  return null;
}
