'use client';

import { useCallback, useMemo, useReducer, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { buildWhatsAppLink } from '@/lib/format';
import { isAvailabilityRealtimeEvent, useBookingAvailability } from '@/lib/hooks/useBookingAvailability';
import { useBookingDraft } from '@/lib/hooks/useBookingDraft';
import { useBookingFlowActions } from '@/lib/hooks/useBookingFlowActions';
import { useBookingSelectionState } from '@/lib/hooks/useBookingSelectionState';
import { useBookingUrlSync } from '@/lib/hooks/useBookingUrlSync';
import { useCountdownTimer } from '@/lib/hooks/useCountdownTimer';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import { buildBookingBreadcrumbStructuredData } from '@/lib/seo/structured-data';
import type { BookingLayoutView, ServiceAddon, ServiceCategory } from '@/lib/types';
import { JsonLdScript } from './seo/JsonLdScript';
import { BookingHeader, BookingHero, STEP_LABELS } from './booking/BookingChrome';
import { BookingConflictBanner } from './booking/BookingConflictBanner';
import { BookingStepRouter, prefetchBookingNextStep } from './booking/BookingStepRouter';
import { BookingDesktopActions, BookingStickyBar } from './booking/BookingStickyBar';
import { BookingSummaryCard } from './booking/BookingSummaryCard';
import { resolveEffectiveSelectedDate } from './booking/bookingHelpers';
import { bookingReducer, createInitialBookingFlowState } from './booking/bookingMachine';
import {
  buildLiveAnnouncement,
  buildSummaryRows,
  computeStepNavigation,
  toScheduleLayout,
} from './booking/bookingViewHelpers';

const WaitlistDialog = dynamic(
  () => import('./booking/WaitlistDialog').then((mod) => mod.WaitlistDialog),
  { ssr: false },
);

interface BookingWidgetProps {
  settings: PublicSettingsDTO;
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  initialTodayKey: string;
  initialServiceSlug?: string;
  initialExtraServiceSlugs?: string[];
  initialAddonIds?: string[];
  initialStaffSlug?: string;
  initialDate?: string;
  initialLayout?: BookingLayoutView;
  initialSlot?: string;
  initialInspoNote?: string;
  siteOrigin?: string;
  emitBookingBreadcrumb?: boolean;
}

const FORM_ID = 'rb-details-form';

export function BookingWidget(props: BookingWidgetProps) {
  const {
    settings, categories, services, addons, staff, initialTodayKey,
    initialServiceSlug, initialExtraServiceSlugs, initialAddonIds,
    initialSlot, initialInspoNote, siteOrigin, emitBookingBreadcrumb,
  } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  const [flow, dispatch] = useReducer(bookingReducer, undefined, createInitialBookingFlowState);
  const timezone = settings.timezone || 'America/Mexico_City';
  const holdTotalSec = (settings.slotHoldMinutes || 5) * 60;

  const selection = useBookingSelectionState(props);
  const realtimePing = useEphemeralMessage(3500);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [hasOpenedWaitlist, setHasOpenedWaitlist] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const validServiceIds = useMemo(() => services.map((s) => s.id), [services]);
  const validAddonIds = useMemo(() => addons.map((a) => a.id), [addons]);
  const defaultServiceId = services[0]?.id ?? '';

  const bookingDraft = useBookingDraft({
    selection,
    defaultServiceId,
    validServiceIds,
    validAddonIds,
    urlOverrides: {
      service: Boolean(initialServiceSlug),
      extras: Boolean(initialExtraServiceSlugs?.length),
      addons: Boolean(initialAddonIds?.length),
      notes: Boolean(initialInspoNote),
    },
    phase: flow.phase,
  });

  const {
    days: availabilityDays, isLoading: loadingAvail, isRevalidating: isRevalidatingAvail,
    error: availabilityError, retry: retryAvailability,
    prefetchWindow, invalidateFromRealtime, revalidateActive,
  } = useBookingAvailability({
    serviceId: selection.selectedService?.id ?? null,
    extraServiceIds: selection.activeExtraServiceIds,
    addonIds: selection.activeAddonIds,
    staffId: selection.pinnedStaffId,
    windowStartDate: selection.windowStartDate,
    nextWindowStartDate: flow.step === 'schedule' && selection.canAdvanceMonth ? selection.nextMonthStartKey : null,
  });

  const effectiveSelectedDate = useMemo(
    () => resolveEffectiveSelectedDate(selection.selectedDate, availabilityDays),
    [selection.selectedDate, availabilityDays],
  );

  useBookingUrlSync({
    servicio: selection.selectedService?.slug,
    extras: selection.selectedExtraServices.map((srv) => srv.slug),
    addons: selection.activeAddonIds,
    staff: selection.pinnedStaff?.bookingSlug ?? '',
    date: effectiveSelectedDate,
    layout: selection.layoutView,
    defaultLayout: toScheduleLayout(settings.defaultBookingLayout),
    slot: flow.selectedSlot?.startAt ?? initialSlot ?? '',
  });

  useRealtimeSubscription(
    useCallback(
      (evt) => {
        if (isAvailabilityRealtimeEvent(evt.type) && invalidateFromRealtime({ staffId: evt.staffId, date: evt.date })) {
          realtimePing.show('Disponibilidad actualizada en tiempo real');
        }
      },
      [invalidateFromRealtime, realtimePing],
    ),
  );

  const holdRemainingSec = useCountdownTimer(
    flow.holdExpiresAt,
    useCallback(() => {
      dispatch({
        type: 'HOLD_EXPIRED',
        message: `Pasaron los ${settings.slotHoldMinutes || 5} minutos de apartado y el horario se liberó. Tus datos siguen guardados.`,
      });
      revalidateActive();
    }, [revalidateActive, settings.slotHoldMinutes]),
  );

  const actions = useBookingFlowActions({
    flow,
    dispatch,
    settings,
    staff,
    selectedService: selection.selectedService,
    selectedExtraServices: selection.selectedExtraServices,
    activeSelectedAddons: selection.activeSelectedAddons,
    hasExtrasOptions: selection.hasExtrasOptions,
    isPinned: selection.isPinned,
    pinnedStaffId: selection.pinnedStaffId,
    skipsStaffStep: selection.skipsStaffStep,
    subtotalCents: selection.subtotalCents,
    showsDeposit: selection.showsDeposit,
    client: selection.clientForm,
    revalidateActive,
    navigateToManageUrl: (url) => router.push(url),
  });

  const handleStartFresh = () => {
    bookingDraft.resetDraft();
    actions.resetSelection();
    actions.goToStep('service');
  };

  const discountCents = actions.appliedCoupon?.discountCents ?? 0;
  const totalPriceCents = Math.max(0, selection.subtotalCents - discountCents);
  const availableDateSet = useMemo(
    () => new Set(availabilityDays.filter((d) => d.hasSlots).map((d) => d.date)),
    [availabilityDays],
  );
  const selectedDaySummary = useMemo(
    () => availabilityDays.find((d) => d.date === effectiveSelectedDate) ?? null,
    [availabilityDays, effectiveSelectedDate],
  );

  const liveAnnouncement = useMemo(
    () =>
      buildLiveAnnouncement({
        flow,
        holdRemainingSec,
        holdTotalSec,
        slotHoldMinutes: settings.slotHoldMinutes || 5,
        realtimeMessage: realtimePing.message,
        loadingAvail,
        selectedDaySummary,
        timezone,
      }),
    [flow, holdRemainingSec, holdTotalSec, settings.slotHoldMinutes, realtimePing.message, loadingAvail, selectedDaySummary, timezone],
  );

  const skipsStaffForSlot =
    selection.skipsStaffStep || (flow.selectedSlot?.availableStaffIds.length ?? 0) <= 1;
  const nav = computeStepNavigation({
    flow,
    hasExtrasOptions: selection.hasExtrasOptions,
    hasSelectedService: Boolean(selection.selectedService),
    requiresConfirmation: Boolean(selection.selectedService?.requiresConfirmation),
    skipsStaffForSlot,
    totalDurationMinutes: selection.totalDurationMinutes,
    extrasSelectedCount: selection.activeSelectedAddons.length + selection.selectedExtraServices.length,
    chosenStaffId: actions.chosenStaffId,
    isSubmittingBooking: actions.isSubmittingBooking,
    showsDeposit: selection.showsDeposit,
    proofDataUrl: selection.clientForm.proofDataUrl,
    proofDeliveryMethod: selection.clientForm.proofDeliveryMethod,
  });

  const handleBack =
    nav.backTarget && !actions.isSubmittingBooking ? () => actions.goToStep(nav.backTarget!) : null;

  const handleNext = () => {
    prefetchBookingNextStep(flow.step, selection.hasExtrasOptions);
    if (flow.step === 'service') actions.goToStep(selection.hasExtrasOptions ? 'extras' : 'schedule');
    else if (flow.step === 'extras') actions.goToStep('schedule');
    else if (flow.step === 'schedule' && flow.selectedSlot) actions.goToStep(skipsStaffForSlot ? 'details' : 'staff');
    else if (flow.step === 'staff') void actions.handlePickStaff(actions.chosenStaffId);
  };

  const summaryRows = useMemo(
    () =>
      buildSummaryRows({
        selectedService: selection.selectedService,
        selectedExtraServices: selection.selectedExtraServices,
        activeSelectedAddons: selection.activeSelectedAddons,
        flow,
        timeFormat: selection.timeFormat,
        timezone,
        address: settings.address,
        chosenStaffId: actions.chosenStaffId,
        isPinned: selection.isPinned,
        skipsStaffForSlot,
        totalDurationMinutes: selection.totalDurationMinutes,
      }),
    [selection.selectedService, selection.selectedExtraServices, selection.activeSelectedAddons, flow, selection.timeFormat, timezone, settings.address, actions.chosenStaffId, selection.isPinned, skipsStaffForSlot, selection.totalDurationMinutes],
  );

  const summaryProps = {
    currency: settings.currency, rows: summaryRows, totalPriceCents,
    hasStartingPrice: selection.hasStartingPrice, discountCents,
    depositAmountCents: selection.showsDeposit ? selection.depositAmountCents || 20000 : 0,
    holdRemainingSec, holdTotalSec, isHoldExpired: flow.holdExpired,
  };
  const whatsappUrl = buildWhatsAppLink(settings.whatsappNumber, `Hola ${settings.name}, tengo una duda para agendar mi cita.`);
  const ctaProps = {
    step: flow.step, formId: FORM_ID, nextLabel: nav.nextLabel, canContinue: nav.canContinue,
    isBusy: actions.isBusy, isSubmittingBooking: actions.isSubmittingBooking, holdExpired: flow.holdExpired, onNext: handleNext,
  };
  const bookingBreadcrumbData =
    emitBookingBreadcrumb && !isEmbed ? buildBookingBreadcrumbStructuredData({ siteOrigin }) : null;

  return (
    <VStack className={isEmbed ? 'lk-root rb-root rb-embed' : 'lk-root rb-root'}>
      <JsonLdScript id="jsonld-reservar" data={bookingBreadcrumbData} />
      <p role="status" aria-live="polite" aria-atomic="true" className="rb-sr-only">
        {liveAnnouncement}
      </p>

      {!isEmbed ? (
        <BookingHeader salonName={settings.name} step={flow.step} holdRemainingSec={holdRemainingSec} whatsappUrl={whatsappUrl} onBack={handleBack} />
      ) : null}
      <BookingHero step={flow.step} completedSteps={nav.completedSteps} onGoToStep={actions.goToStep} isCompact={isEmbed} holdRemainingSec={holdRemainingSec} />

      <VStack as="main" className="rb-wrap rb-main">
        <VStack className="rb-layout">
          <VStack as="section" className="rb-panel" aria-label={STEP_LABELS[flow.step]}>
            {isEmbed && handleBack ? (
              <HStack justify="start" className="rb-m">
                <Button type="button" variant="ghost" size="md" label="Paso anterior" style={{ minHeight: '2.75rem' }} onClick={handleBack} />
              </HStack>
            ) : null}

            {bookingDraft.hasRestoredDraft ? (
              <Banner
                status="info"
                title="Retomamos tu avance"
                description="Recuperamos tus datos guardados para que no empieces de cero."
                endContent={<Button type="button" variant="secondary" size="sm" label="Empezar de nuevo" onClick={handleStartFresh} />}
                isDismissable
                onDismiss={bookingDraft.dismissRestoredBanner}
              />
            ) : null}

            <BookingConflictBanner
              formErrorCode={flow.formErrorCode}
              conflict={flow.conflict}
              timezone={timezone}
              timeFormat={selection.timeFormat}
              pendingSlotKey={actions.pendingSlotKey}
              isBusy={actions.isBusy}
              onDismissConflict={() => dispatch({ type: 'DISMISS_CONFLICT' })}
              onSelectSuggestion={(alt) => void actions.handleSelectSlot(alt, { stayOnDetails: flow.step === 'details' })}
            />

            <BookingStepRouter
              formId={FORM_ID}
              settings={settings}
              timezone={timezone}
              categories={categories}
              services={services}
              staff={staff}
              flow={flow}
              dispatch={dispatch}
              selection={selection}
              actions={actions}
              totalPriceCents={totalPriceCents}
              schedule={{
                todayKey: initialTodayKey,
                effectiveSelectedDate,
                availabilityDays,
                availableDateSet,
                selectedDaySummary,
                loadingAvail,
                isRevalidatingAvail,
                availabilityError,
                onRetryAvailability: retryAvailability,
                onPrefetchService: (serviceId) => {
                  if (!serviceId || serviceId === selection.selectedService?.id) return;
                  prefetchWindow({
                    serviceId,
                    extraServiceIds: selection.selectedExtraServiceIds.filter((id) => id !== serviceId),
                    addonIds: selection.activeAddonIds,
                    staffId: selection.pinnedStaffId,
                    windowStartDate: selection.windowStartDate,
                  });
                },
                onSelectDate: (nextDate) =>
                  selection.selectDateWithinWindow(nextDate, availabilityDays[0]?.date, availabilityDays[availabilityDays.length - 1]?.date),
                onAdvanceMonth: () => selection.advanceMonthWindow(loadingAvail),
                onPrefetchNextMonth: () => {
                  if (!selection.selectedService || !selection.canAdvanceMonth || selection.nextMonthStartKey === selection.windowStartDate) return;
                  prefetchWindow({
                    serviceId: selection.selectedService.id,
                    extraServiceIds: selection.activeExtraServiceIds,
                    addonIds: selection.activeAddonIds,
                    staffId: selection.pinnedStaffId,
                    windowStartDate: selection.nextMonthStartKey,
                  });
                },
                onReturnToToday: () => selection.returnToTodayWindow(loadingAvail),
                onOpenWaitlist: () => {
                  setHasOpenedWaitlist(true);
                  setWaitlistOpen(true);
                },
              }}
            />

            <BookingDesktopActions
              {...ctaProps}
              canGoBack={Boolean(nav.backTarget)}
              nextHint={nav.nextHint}
              onBack={() => { if (nav.backTarget) actions.goToStep(nav.backTarget); }}
            />
          </VStack>

          <VStack as="aside" className="rb-aside rb-d" aria-labelledby="rb-summary-aside">
            <BookingSummaryCard {...summaryProps} headingId="rb-summary-aside" />
          </VStack>
        </VStack>
      </VStack>

      <BookingStickyBar
        {...ctaProps}
        currency={settings.currency}
        totalPriceCents={totalPriceCents}
        hasStartingPrice={selection.hasStartingPrice}
        totalDurationMinutes={selection.totalDurationMinutes}
        summaryOpen={summaryOpen}
        summaryProps={summaryProps}
        onOpenSummary={() => setSummaryOpen(true)}
        onSummaryOpenChange={setSummaryOpen}
      />

      {hasOpenedWaitlist ? (
        <WaitlistDialog
          isOpen={waitlistOpen}
          serviceId={selection.selectedService?.id}
          selectedStaffId={selection.pinnedStaffId}
          selectedDate={effectiveSelectedDate}
          onOpenChange={setWaitlistOpen}
        />
      ) : null}
    </VStack>
  );
}
