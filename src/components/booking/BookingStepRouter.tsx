'use client';

import type React from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import type { useBookingFlowActions } from '@/lib/hooks/useBookingFlowActions';
import type { BookingSelectionState } from '@/lib/hooks/useBookingSelectionState';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { ServiceCategory } from '@/lib/types';
import { ServiceStep } from './ServiceStep';
import type { BookingFlowAction, BookingFlowState, BookingStep } from './bookingMachine';

function BookingStepFallback() {
  return (
    <VStack
      gap={4}
      role="status"
      aria-live="polite"
      aria-label="Cargando siguiente paso"
      className="fx-step-in"
    >
      <VStack gap={1.5} aria-hidden="true">
        <SkeletonBlock width="min(100%, 14rem)" height="1.75rem" radius={2} index={0} />
        <SkeletonBlock width="min(100%, 22rem)" height="1rem" radius={1} index={1} />
      </VStack>
      <SkeletonBlock width="100%" height="6rem" radius={3} index={2} />
      <SkeletonBlock width="100%" height="6rem" radius={3} index={3} />
    </VStack>
  );
}

const ExtrasStep = dynamic(
  () => import('./ExtrasStep').then((mod) => mod.ExtrasStep),
  { ssr: false, loading: BookingStepFallback },
);

const ScheduleStep = dynamic(
  () => import('./ScheduleStep').then((mod) => mod.ScheduleStep),
  { ssr: false, loading: BookingStepFallback },
);

const StaffStep = dynamic(
  () => import('./StaffStep').then((mod) => mod.StaffStep),
  { ssr: false, loading: BookingStepFallback },
);

const ClientConfirmStep = dynamic(
  () => import('./ClientConfirmStep').then((mod) => mod.ClientConfirmStep),
  { ssr: false, loading: BookingStepFallback },
);

let prefetchedExtras = false;
let prefetchedSchedule = false;
let prefetchedConfirm = false;

export function prefetchBookingNextStep(
  step: BookingStep,
  hasExtrasOptions: boolean,
): void {
  if (step === 'service') {
    if (hasExtrasOptions && !prefetchedExtras) {
      prefetchedExtras = true;
      void import('./ExtrasStep');
    }
    if (!prefetchedSchedule) {
      prefetchedSchedule = true;
      void import('./ScheduleStep');
    }
    return;
  }
  if (step === 'extras' && !prefetchedSchedule) {
    prefetchedSchedule = true;
    void import('./ScheduleStep');
    return;
  }
  if (step === 'schedule' && !prefetchedConfirm) {
    prefetchedConfirm = true;
    void import('./StaffStep');
    void import('./ClientConfirmStep');
  }
}

type BookingActions = ReturnType<typeof useBookingFlowActions>;

interface ScheduleRouterState {
  todayKey: string;
  effectiveSelectedDate: string;
  availabilityDays: DayAvailabilitySummary[];
  availableDateSet: Set<string>;
  selectedDaySummary: DayAvailabilitySummary | null;
  loadingAvail: boolean;
  isRevalidatingAvail: boolean;
  availabilityError: string | null;
  onRetryAvailability: () => void;
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
          prefetchBookingNextStep('service', selection.hasExtrasOptions);
          if (serviceId === selection.selectedService?.id) return;
          selection.setSelectedServiceId(serviceId);
          selection.setSelectedExtraServiceIds((prev) => prev.filter((id) => id !== serviceId));
          actions.resetSelection();
        }}
        onPrefetchService={(serviceId) => {
          prefetchBookingNextStep('service', selection.hasExtrasOptions);
          schedule.onPrefetchService(serviceId);
        }}
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
          prefetchBookingNextStep('extras', selection.hasExtrasOptions);
          const nextIds = checked
            ? Array.from(new Set([...selection.selectedExtraServiceIds, serviceId])).slice(0, 8)
            : selection.selectedExtraServiceIds.filter((id) => id !== serviceId);
          if (nextIds.join(',') === selection.selectedExtraServiceIds.join(',')) return;
          selection.setSelectedExtraServiceIds(nextIds);
          actions.resetSelection();
        }}
        onToggleAddon={(addonId, checked) => {
          prefetchBookingNextStep('extras', selection.hasExtrasOptions);
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
        availabilityError={schedule.availabilityError}
        onRetryAvailability={schedule.onRetryAvailability}
        canAdvanceMonth={selection.canAdvanceMonth}
        isViewingFutureWindow={selection.windowStartDate > schedule.todayKey}
        onChangeLayoutView={selection.setLayoutView}
        onChangeTimeFormat={selection.setTimeFormat}
        onSelectDate={(nextDate) => {
          prefetchBookingNextStep('schedule', selection.hasExtrasOptions);
          schedule.onSelectDate(nextDate);
        }}
        onSelectSlot={(next: AvailableSlot) => {
          prefetchBookingNextStep('schedule', selection.hasExtrasOptions);
          void actions.handleSelectSlot(next);
        }}
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
