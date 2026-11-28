'use client';

import { useCallback, useMemo, useReducer, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { RotateCcw, X } from 'lucide-react';
import { isAvailabilityRealtimeEvent, useBookingAvailability } from '@/lib/hooks/useBookingAvailability';
import { useBookingDraft } from '@/lib/hooks/useBookingDraft';
import { useBookingFlowActions, useInitialSlotAutoHold } from '@/lib/hooks/useBookingFlowActions';
import { useBookingFunnelTracker } from '@/lib/hooks/useBookingFunnelTracker';
import { saveBookingMemory, useBookingMemory } from '@/lib/hooks/useBookingMemory';
import { useBookingSelectionState } from '@/lib/hooks/useBookingSelectionState';
import { useBookingUrlSync } from '@/lib/hooks/useBookingUrlSync';
import { useClientAccount } from '@/lib/hooks/useClientAccount';
import { isClientAuthMethodEnabled } from '@/lib/client-account';
import type { ClientPortalProfile } from '@/lib/contracts';
import { useCountdownTimer } from '@/lib/hooks/useCountdownTimer';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { usePendingNavigationFallback } from '@/lib/hooks/useRouteProgress';
import { WAITLIST_OFFER_TTL_MINUTES } from '@/lib/notifications/cascade';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import { buildBookingBreadcrumbStructuredData } from '@/lib/seo/structured-data';
import type { BookingLayoutView, ServiceAddon, ServiceCategory } from '@/lib/types';
import { JsonLdScript } from './seo/JsonLdScript';
import { BookingHeader, BookingHero, STEP_LABELS } from './booking/BookingChrome';
import { BookingConflictBanner } from './booking/BookingConflictBanner';
import { BookingStepRouter, prefetchBookingNextStep } from './booking/BookingStepRouter';
import { BookingDesktopActions, BookingStickyBar } from './booking/BookingStickyBar';
import { BookingSummaryCard } from './booking/BookingSummaryCard';
import { HoldExpiredBanner } from './booking/HoldExpiredBanner';
import { resolveEffectiveSelectedDate, shouldPromptHoldExtension } from './booking/bookingHelpers';
import type { ClientAccountBinding } from './booking/ClientConfirmStep';
import type { ClientSignInIntent } from './booking/ClientSignInDialog';
import {
  profileToContactFields,
  resolveAccountTransitionPatch,
  resolveSignOutClear,
  type ClientContactPatch,
} from './booking/clientAccountHelpers';
import {
  BOOKING_STEPS,
  bookingReducer,
  createInitialBookingFlowState,
  isPostHoldStep,
  parseBookingStepParam,
  type BookingStep,
} from './booking/bookingMachine';
import {
  buildLiveAnnouncement,
  buildSummaryRows,
  computeStepNavigation,
  resolveTopBookingNotice,
} from './booking/bookingViewHelpers';

const WaitlistDialog = dynamic(
  () => import('./booking/WaitlistDialog').then((mod) => mod.WaitlistDialog),
  { ssr: false },
);

const ClientSignInDialog = dynamic(
  () => import('./booking/ClientSignInDialog').then((mod) => mod.ClientSignInDialog),
  { ssr: false },
);

const HoldExtendDialog = dynamic(
  () => import('./booking/HoldExtendDialog').then((mod) => mod.HoldExtendDialog),
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
  initialClientProfile?: ClientPortalProfile | null;
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
  const waitlistOfferToken = searchParams.get('offer')?.trim() || null;
  const selection = useBookingSelectionState(props);
  const initialStep: BookingStep = selection.selectedService
    ? (parseBookingStepParam(searchParams.get('paso')) ??
      (initialSlot?.trim() ? 'schedule' : 'service'))
    : 'service';
  const [flow, dispatch] = useReducer(bookingReducer, initialStep, createInitialBookingFlowState);
  const timezone = settings.timezone || 'America/Mexico_City';
  const holdTotalSec = (settings.slotHoldMinutes || 5) * 60;

  const account = useClientAccount(props.initialClientProfile ?? null);
  const bookingMemory = useBookingMemory();
  const clientAuthEnabled = isClientAuthMethodEnabled('whatsapp_otp');
  const [signInRequest, setSignInRequest] = useState<{ intent: ClientSignInIntent; phone: string } | null>(null);
  const [isRepeatDismissed, setIsRepeatDismissed] = useState(false);

  const applyContactPatch = (patch: ClientContactPatch) => {
    const form = selection.clientForm;
    if (patch.clientName !== undefined) form.onChangeClientName(patch.clientName);
    if (patch.clientPhone !== undefined) form.onChangeClientPhone(patch.clientPhone);
    if (patch.clientInstagram !== undefined) form.onChangeClientInstagram(patch.clientInstagram);
    if (patch.clientEmail !== undefined) form.onChangeClientEmail(patch.clientEmail);
    if (patch.clientBirthday !== undefined) form.onChangeClientBirthday(patch.clientBirthday);
  };
  const currentContact = () => ({
    clientName: selection.clientForm.clientName,
    clientPhone: selection.clientForm.clientPhone,
    clientInstagram: selection.clientForm.clientInstagram,
    clientEmail: selection.clientForm.clientEmail,
    clientBirthday: selection.clientForm.clientBirthday,
  });
  const openSignIn = (intent: ClientSignInIntent, phone: string) => setSignInRequest({ intent, phone });
  const handleSignInVerified = async () => {
    const previous = account.profile;
    const before = currentContact();
    const profile = await account.refreshProfile();
    if (profile) {
      applyContactPatch(resolveAccountTransitionPatch(before, previous, profile));
    }
  };
  const handleSignOut = async () => {
    const before = currentContact();
    const previous = await account.signOut();
    if (previous) applyContactPatch(resolveSignOutClear(before, previous));
  };
  const clientAccountBinding: ClientAccountBinding = {
    isEnabled: clientAuthEnabled,
    profile: account.profile,
    isSigningOut: account.isSigningOut,
    onOpenSignIn: openSignIn,
    onSignOut: () => void handleSignOut(),
  };
  const realtimePing = useEphemeralMessage(3500);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [hasOpenedWaitlist, setHasOpenedWaitlist] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [holdPromptDismissedFor, setHoldPromptDismissedFor] = useState<number | null>(null);
  const [stepMotion, setStepMotion] = useState<{ step: BookingStep; direction: 'forward' | 'back' }>({
    step: flow.step,
    direction: 'forward',
  });
  if (stepMotion.step !== flow.step) {
    setStepMotion({
      step: flow.step,
      direction: BOOKING_STEPS.indexOf(flow.step) >= BOOKING_STEPS.indexOf(stepMotion.step) ? 'forward' : 'back',
    });
  }

  const validServiceIds = useMemo(() => services.map((s) => s.id), [services]);
  const validAddonIds = useMemo(() => addons.map((a) => a.id), [addons]);
  const defaultServiceId = initialServiceSlug
    ? (services.find((s) => s.slug === initialServiceSlug)?.id ?? '')
    : '';

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
    offer: waitlistOfferToken,
  });

  const effectiveSelectedDate = useMemo(
    () => resolveEffectiveSelectedDate(selection.selectedDate, availabilityDays),
    [selection.selectedDate, availabilityDays],
  );

  const handlePopStateStep = useCallback((targetStep: BookingStep) => {
    dispatch({ type: 'GO_TO_STEP', step: targetStep });
  }, []);

  useBookingUrlSync({
    servicio: selection.selectedService?.slug,
    extras: selection.selectedExtraServices.map((srv) => srv.slug),
    addons: selection.activeAddonIds,
    staff: selection.pinnedStaff?.bookingSlug ?? '',
    date:
      flow.step === 'service' && !selection.selectedService && !props.initialDate && !initialSlot
        ? ''
        : effectiveSelectedDate,
    layout: selection.layoutView,
    defaultLayout: selection.defaultEffectiveLayout,
    slot:
      flow.selectedSlot?.startAt ??
      (flow.conflict || flow.step === 'service' ? '' : (initialSlot ?? '')),
    step: flow.step,
    hasSelectedSlot: Boolean(flow.selectedSlot),
    onPopStateStep: handlePopStateStep,
  });

  const isSubmittingOrConfirmed =
    flow.phase === 'submitting' || flow.phase === 'confirmed';

  usePendingNavigationFallback(
    flow.phase === 'confirmed' ? flow.confirmedManageUrl : null,
  );

  useRealtimeSubscription(
    useCallback(
      (evt) => {
        if (isAvailabilityRealtimeEvent(evt.type) && invalidateFromRealtime({ staffId: evt.staffId, date: evt.date })) {
          realtimePing.show('Disponibilidad actualizada en tiempo real');
        }
      },
      [invalidateFromRealtime, realtimePing],
    ),
    undefined,
    flow.step !== 'service' && !isSubmittingOrConfirmed,
  );

  const holdRemainingSec = useCountdownTimer(
    isSubmittingOrConfirmed ? null : flow.holdExpiresAt,
    useCallback(() => {
      dispatch({
        type: 'HOLD_EXPIRED',
        message: isPostHoldStep(flow.step)
          ? 'Se acabó el tiempo y soltamos tu horario. Lo que escribiste sigue aquí.'
          : 'Soltamos tu horario para que otras lo puedan ver. Si sigue libre, vuelve a elegirlo.',
      });
      revalidateActive();
    }, [flow.step, revalidateActive]),
  );

  const selectedSlotStaffSlug = useMemo(() => {
    const id = flow.selectedSlot?.staffId ?? (selection.isPinned ? selection.pinnedStaffId : null);
    if (!id || id === 'any') return null;
    const member = staff.find((item) => item.id === id);
    return member ? (member.bookingSlug || member.id) : null;
  }, [flow.selectedSlot?.staffId, selection.isPinned, selection.pinnedStaffId, staff]);

  const funnel = useBookingFunnelTracker({
    step: flow.step,
    hasHeldSlot: Boolean(flow.selectedSlot),
    serviceSlug: selection.selectedService?.slug ?? null,
    staffSlug: selectedSlotStaffSlug,
  });

  const actions = useBookingFlowActions({
    flow,
    dispatch,
    settings,
    staff,
    selectedService: selection.selectedService,
    selectedExtraServices: selection.selectedExtraServices,
    activeSelectedAddons: selection.activeSelectedAddons,
    isPinned: selection.isPinned,
    pinnedStaffId: selection.pinnedStaffId,
    skipsStaffStep: selection.skipsStaffStep,
    subtotalCents: selection.subtotalCents,
    client: selection.clientForm,
    signedInPhoneE164: account.profile?.phoneE164 ?? null,
    waitlistOfferToken,
    todayKey: initialTodayKey,
    revalidateActive,
    onBookingConfirmed: (summary) => {
      saveBookingMemory(summary);
      funnel.track('details_completed', {
        serviceSlug: summary.serviceSlug,
        staffSlug: summary.staffSlug,
      });
      funnel.track('booking_confirmed', {
        serviceSlug: summary.serviceSlug,
        staffSlug: summary.staffSlug,
      });
    },
    navigateToManageUrl: (url) => router.push(url),
  });

  useInitialSlotAutoHold({
    initialSlot,
    preferredDate: effectiveSelectedDate,
    pinnedStaffId: selection.pinnedStaffId,
    availabilityDays,
    loadingAvail,
    availabilityError,
    hasSelectedSlot: Boolean(flow.selectedSlot),
    isBusy: actions.isBusy,
    waitlistOfferToken,
    onSelectDate: (nextDate) =>
      selection.selectDateWithinWindow(
        nextDate,
        availabilityDays[0]?.date,
        availabilityDays[availabilityDays.length - 1]?.date,
      ),
    onSelectSlot: (slot) => actions.handleSelectSlot(slot),
    onSlotUnavailable: (message, suggestions) => {
      dispatch({
        type: 'SLOT_CONFLICT',
        message,
        suggestions,
        returnToSchedule: true,
      });
      actions.revealPanel();
    },
  });

  const repeatCandidate = useMemo(() => {
    if (initialServiceSlug || initialSlot || waitlistOfferToken) return null;
    const sourceSlug = account.profile?.lastServiceSlug ?? bookingMemory?.serviceSlug ?? null;
    if (!sourceSlug) return null;
    const matchedService = services.find((srv) => srv.slug === sourceSlug) ?? null;
    if (!matchedService) return null;
    const sourceStaffSlug = account.profile?.lastServiceSlug
      ? (account.profile.lastStaffSlug ?? null)
      : (bookingMemory?.staffSlug ?? null);
    const matchedStaff = sourceStaffSlug
      ? (staff.find(
          (member) => member.bookingSlug === sourceStaffSlug || member.id === sourceStaffSlug,
        ) ?? null)
      : null;
    return { service: matchedService, staff: matchedStaff };
  }, [account.profile, bookingMemory, initialServiceSlug, initialSlot, services, staff, waitlistOfferToken]);

  const handleRepeatLastBooking = () => {
    if (!repeatCandidate) return;
    selection.setSelectedServiceId(repeatCandidate.service.id);
    selection.setSelectedExtraServiceIds([]);
    selection.setSelectedAddonIds([]);
    selection.setPinnedStaffId(repeatCandidate.staff?.id ?? 'any');
    actions.resetSelection();
    prefetchBookingNextStep('service');
    funnel.track('booking_started', {
      serviceSlug: repeatCandidate.service.slug,
      staffSlug: repeatCandidate.staff
        ? (repeatCandidate.staff.bookingSlug || repeatCandidate.staff.id)
        : null,
    });
    actions.goToStep('schedule');
  };

  const handleStartFresh = () => {
    bookingDraft.resetDraft();
    actions.resetSelection();
    actions.goToStep('service');
    if (account.profile) applyContactPatch(profileToContactFields(account.profile));
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

  const nav = computeStepNavigation({
    flow,
    hasSelectedService: Boolean(selection.selectedService),
    requiresConfirmation: Boolean(selection.selectedService?.requiresConfirmation),
    totalDurationMinutes: selection.totalDurationMinutes,
    extrasSelectedCount: selection.activeSelectedAddons.length + selection.selectedExtraServices.length,
    chosenStaffId: actions.chosenStaffId,
    skipsStaffStep: selection.skipsStaffStep,
    showsDeposit: selection.showsDeposit,
  });

  const handleGoToStep = (targetStep: BookingStep) => {
    if (targetStep === 'staff' && nav.skipStaff) {
      actions.goToStep('schedule');
      return;
    }
    actions.goToStep(targetStep);
  };

  const handleBack =
    nav.backTarget && !actions.isSubmittingBooking ? () => actions.goToStep(nav.backTarget!) : null;

  const handleNext = () => {
    prefetchBookingNextStep(flow.step);
    if (flow.step === 'service') actions.goToStep('schedule');
    else if (flow.step === 'schedule' && flow.selectedSlot) {
      actions.goToStep(nav.skipStaff ? 'details' : 'staff');
    } else if (flow.step === 'staff' && flow.selectedSlot) {
      actions.goToStep('details');
    }
  };

  const handleChangeSchedule =
    flow.selectedSlot && flow.step !== 'schedule' && !actions.isSubmittingBooking
      ? () => actions.goToStep('schedule')
      : null;

  const autoSelectedStaffName =
    flow.selectedSlot && nav.skipStaff ? flow.selectedSlot.staffName : null;

  const topNotice = resolveTopBookingNotice({
    hasWaitlistOffer: Boolean(waitlistOfferToken),
    hasRestoredDraft: bookingDraft.hasRestoredDraft,
    canShowRepeat: flow.step === 'service' && Boolean(repeatCandidate) && !isRepeatDismissed,
  });

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
        skipsStaffStep: selection.skipsStaffStep,
        totalDurationMinutes: selection.totalDurationMinutes,
      }),
    [selection.selectedService, selection.selectedExtraServices, selection.activeSelectedAddons, flow, selection.timeFormat, timezone, settings.address, actions.chosenStaffId, selection.isPinned, selection.skipsStaffStep, selection.totalDurationMinutes],
  );

  const summaryProps = {
    currency: settings.currency, rows: summaryRows, totalPriceCents,
    hasSelectedService: Boolean(selection.selectedService),
    hasStartingPrice: selection.hasStartingPrice, discountCents,
    depositAmountCents: selection.showsDeposit ? selection.depositAmountCents : 0,
    autoSelectedStaffName,
    holdRemainingSec, holdTotalSec, isHoldExpired: flow.holdExpired,
    onChangeSchedule: handleChangeSchedule,
  };
  const isHoldPromptOpen = shouldPromptHoldExtension({
    holdRemainingSec,
    holdExpiresAt: flow.holdExpiresAt,
    dismissedForExpiresAt: holdPromptDismissedFor,
    isSubmitting: actions.isSubmittingBooking,
  });
  const handleExtendHold = async () => {
    const expiresAt = flow.holdExpiresAt;
    const extended = await actions.handleExtendHold();
    if (!extended) setHoldPromptDismissedFor(expiresAt);
  };
  const ctaProps = {
    step: flow.step, formId: FORM_ID, nextLabel: nav.nextLabel, canContinue: nav.canContinue,
    isBusy: actions.isBusy, isSubmittingBooking: actions.isSubmittingBooking, holdExpired: flow.holdExpired, onNext: handleNext,
  };
  const bookingBreadcrumbData =
    emitBookingBreadcrumb && !isEmbed ? buildBookingBreadcrumbStructuredData({ siteOrigin }) : null;

  return (
    <VStack className={isEmbed ? 'lk-root rb-root rb-embed' : 'lk-root rb-root'}>
      <a href="#main-content" className="lk-skip-link">
        Saltar al contenido principal
      </a>
      <JsonLdScript id="jsonld-reservar" data={bookingBreadcrumbData} />
      <p role="status" aria-live="polite" aria-atomic="true" className="rb-sr-only">
        {liveAnnouncement}
      </p>

      {!isEmbed ? (
        <BookingHeader settings={settings} holdRemainingSec={holdRemainingSec} onBack={handleBack} />
      ) : null}
      <BookingHero
        step={flow.step}
        completedSteps={nav.completedSteps}
        skippedSteps={nav.skippedSteps}
        onGoToStep={handleGoToStep}
        isCompact={isEmbed}
        holdRemainingSec={holdRemainingSec}
      />

      <VStack as="main" id="main-content" tabIndex={-1} className="rb-wrap rb-main">
        <VStack className="rb-layout">
          <VStack as="section" className="rb-panel" aria-label={STEP_LABELS[flow.step]}>
            {isEmbed && handleBack ? (
              <HStack justify="start" className="rb-m">
                <Button type="button" variant="ghost" size="md" label="Paso anterior" style={{ minHeight: '2.75rem' }} onClick={handleBack} />
              </HStack>
            ) : null}

            {topNotice === 'offer' ? (
              <Banner
                status="info"
                title="Tu lugar prioritario de lista de espera está activo"
                description={`Tienes ${WAITLIST_OFFER_TTL_MINUTES} minutos para elegir el horario liberado y confirmar tu cita antes de que pase al siguiente lugar.`}
              />
            ) : topNotice === 'draft' ? (
              <Banner
                status="info"
                title="Seguimos donde te quedaste"
                description="Guardamos lo que llevabas para que no lo vuelvas a llenar."
                endContent={<Button type="button" variant="secondary" size="sm" label="Empezar de nuevo" onClick={handleStartFresh} />}
                isDismissable
                onDismiss={bookingDraft.dismissRestoredBanner}
              />
            ) : topNotice === 'repeat' && repeatCandidate ? (
              <HStack gap={3} align="center" className="rb-signin-card fx-sheet-in">
                <VStack className="rb-signin-card-icon" align="center" justify="center" aria-hidden="true">
                  <RotateCcw size={18} aria-hidden="true" />
                </VStack>
                <VStack gap={0.5} className="rb-grow">
                  <Text weight="semibold">Repetir tu última cita</Text>
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    {repeatCandidate.service.name}
                    {repeatCandidate.staff ? ` con ${repeatCandidate.staff.name}` : ''} · Ir directo a día y hora.
                  </Text>
                </VStack>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  label="Repetir"
                  className="rb-signin-card-cta fx-press"
                  onClick={handleRepeatLastBooking}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  label="Cerrar sugerencia"
                  icon={<X size={16} aria-hidden="true" />}
                  className="rb-signin-card-close"
                  onClick={() => setIsRepeatDismissed(true)}
                />
              </HStack>
            ) : null}

            <BookingConflictBanner
              formErrorCode={flow.formErrorCode}
              conflict={flow.conflict}
              holdError={flow.holdError}
              timezone={timezone}
              timeFormat={selection.timeFormat}
              pendingSlotKey={actions.pendingSlotKey}
              isBusy={actions.isBusy}
              onDismissConflict={() => dispatch({ type: 'DISMISS_CONFLICT' })}
              onDismissHoldError={() => dispatch({ type: 'DISMISS_HOLD_ERROR' })}
              onRetryHold={() => void actions.handleRetryHold()}
              onSelectSuggestion={(alt) => void actions.handleSelectSlot(alt, { stayOnDetails: isPostHoldStep(flow.step) })}
            />

            {flow.holdExpired && isPostHoldStep(flow.step) ? (
              <HoldExpiredBanner
                message={flow.holdExpiredMessage}
                isReholding={actions.isReholding}
                onRehold={() => void actions.handleReholdExpiredSlot()}
                onPickAnotherTime={() => {
                  dispatch({ type: 'RESET_TO_SCHEDULE' });
                  actions.revealPanel();
                }}
              />
            ) : null}

            <VStack key={flow.step} className="rb-step-motion" data-dir={stepMotion.direction}>
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
              holdRemainingSec={holdRemainingSec}
              autoSelectedStaffName={autoSelectedStaffName}
              onChangeSchedule={handleChangeSchedule}
              totalPriceCents={totalPriceCents}
              clientAccount={clientAccountBinding}
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
                    extraServiceIds: selection.activeExtraServiceIds.filter((id) => id !== serviceId),
                    addonIds: selection.activeAddonIds,
                    staffId: selection.pinnedStaffId,
                    windowStartDate: selection.windowStartDate,
                    offer: waitlistOfferToken,
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
                    offer: waitlistOfferToken,
                  });
                },
                onReturnToToday: () => selection.returnToTodayWindow(loadingAvail),
                onOpenWaitlist: () => {
                  setHasOpenedWaitlist(true);
                  setWaitlistOpen(true);
                },
              }}
            />
            </VStack>

            {flow.phase === 'confirmed' && flow.confirmedManageUrl ? (
              <VStack className="fx-fade-up">
                <Banner
                  status="success"
                  role="status"
                  title="¡Tu cita quedó apartada!"
                  description="Te estamos llevando a tu enlace personal. Si tarda unos segundos, ábrelo directo aquí."
                  endContent={
                    <Button
                      label="Abrir mi cita"
                      variant="primary"
                      size="sm"
                      href={flow.confirmedManageUrl}
                    />
                  }
                />
              </VStack>
            ) : null}

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

      {isHoldPromptOpen ? (
        <HoldExtendDialog
          isOpen
          holdRemainingSec={holdRemainingSec}
          extraMinutes={settings.slotHoldMinutes || 5}
          isExtending={actions.isExtendingHold}
          onExtend={() => void handleExtendHold()}
          onDecline={() => setHoldPromptDismissedFor(flow.holdExpiresAt)}
        />
      ) : null}

      {signInRequest ? (
        <ClientSignInDialog
          intent={signInRequest.intent}
          initialPhone={signInRequest.phone}
          hasHeldSlot={Boolean(flow.holdExpiresAt)}
          onClose={() => setSignInRequest(null)}
          onVerified={handleSignInVerified}
        />
      ) : null}

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
