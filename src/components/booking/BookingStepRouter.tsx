'use client';

import type React from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { SkeletonBlock } from '@/components/ui/SkeletonBlock';
import { MorphLoader } from '@/components/brand/MorphLoader';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import type { useBookingFlowActions } from '@/lib/hooks/useBookingFlowActions';
import type { BookingSelectionState } from '@/lib/hooks/useBookingSelectionState';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { ServiceCategory } from '@/lib/types';
import type { ClientAccountBinding } from './ClientConfirmStep';
import { ServiceStep } from './ServiceStep';
import type { BookingFlowAction, BookingFlowState, BookingStep } from './bookingMachine';

function BookingStepFallback() {
  return (
    <VStack
      gap={4}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Cargando siguiente paso"
      className="fx-step-in"
    >
      <HStack align="center">
        <MorphLoader size="sm" tone="cherry" />
      </HStack>
      <VStack gap={1.5} aria-hidden="true">
        <SkeletonBlock width="min(100%, 15rem)" height="1.875rem" radius={2} index={0} />
        <SkeletonBlock width="min(100%, 24rem)" height="1rem" radius={1} index={1} />
      </VStack>
      <VStack gap={3} aria-hidden="true">
        <SkeletonBlock width="100%" height="5.25rem" radius={3} index={2} />
        <SkeletonBlock width="100%" height="5.25rem" radius={3} index={3} />
      </VStack>
    </VStack>
  );
}

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

let prefetchedSchedule = false;
let prefetchedConfirm = false;

export function prefetchBookingNextStep(step: BookingStep): void {
  if (step === 'service') {
    if (!prefetchedSchedule) {
      prefetchedSchedule = true;
      void import('./ScheduleStep');
    }
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
  clientAccount: ClientAccountBinding;
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
  clientAccount,
}: BookingStepRouterProps) {
  if (flow.step === 'service') {
    return (
      <ServiceStep
        currency={settings.currency}
        categories={categories}
        services={services}
        selectedService={selection.selectedService}
        extraServices={selection.extraServices}
        selectedExtraServiceIds={selection.activeExtraServiceIds}
        compatibleAddons={selection.compatibleAddons}
        selectedAddonIds={selection.selectedAddonIds}
        onSelectService={(serviceId) => {
          prefetchBookingNextStep('service');
          if (serviceId === selection.selectedService?.id) return;
          selection.setSelectedServiceId(serviceId);
          selection.setSelectedExtraServiceIds((prev) => prev.filter((id) => id !== serviceId));
          actions.resetSelection();
        }}
        onPrefetchService={(serviceId) => {
          prefetchBookingNextStep('service');
          schedule.onPrefetchService(serviceId);
        }}
        onToggleExtraService={(serviceId, checked) => {
          prefetchBookingNextStep('service');
          const nextIds = selection.nextExtraServiceIds(serviceId, checked);
          if (nextIds.join(',') === selection.activeExtraServiceIds.join(',')) return;
          selection.setSelectedExtraServiceIds(nextIds);
          actions.resetSelection();
        }}
        onToggleAddon={(addonId, checked) => {
          prefetchBookingNextStep('service');
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
        onChangeTimeFormat={selection.setTimeFormat}
        onSelectDate={(nextDate) => {
          prefetchBookingNextStep('schedule');
          schedule.onSelectDate(nextDate);
        }}
        onSelectSlot={(next: AvailableSlot) => {
          prefetchBookingNextStep('schedule');
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
        currency={settings.currency}
        services={services}
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

  if (flow.step === 'details' || flow.step === 'payment') {
    const allowInspo =
      Boolean(selection.selectedService?.allowInspoPhoto) ||
      selection.selectedExtraServices.some((srv) => srv.allowInspoPhoto);
    const artistName = flow.selectedSlot?.staffName?.trim() || null;
    return (
      <ClientConfirmStep
        key={flow.step}
        section={flow.step}
        todayKey={schedule.todayKey}
        account={clientAccount}
        onContinueDetails={actions.handleDetailsContinue}
        formId={formId}
        settings={settings}
        selectedService={selection.selectedService}
        selectedExtraServices={selection.selectedExtraServices}
        activeSelectedAddons={selection.activeSelectedAddons}
        selectedSlot={flow.selectedSlot}
        artistName={artistName}
        allowInspo={allowInspo}
        clientNotes={selection.clientForm.clientNotes}
        inspoFile={selection.clientForm.inspoFile}
        inspoDataUrl={selection.clientForm.inspoDataUrl}
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
