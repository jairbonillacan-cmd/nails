'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
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
import { useBookingFlowActions } from '@/lib/hooks/useBookingFlowActions';
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
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import { buildBookingBreadcrumbStructuredData } from '@/lib/seo/structured-data';
import type { BookingLayoutView, ServiceAddon, ServiceCategory } from '@/lib/types';
import { JsonLdScript } from './seo/JsonLdScript';
import { BookingHeader, BookingHero, STEP_LABELS } from './booking/BookingChrome';
import { BookingConflictBanner } from './booking/BookingConflictBanner';
import { BookingStepRouter, prefetchBookingNextStep } from './booking/BookingStepRouter';
import { BookingDesktopActions, BookingStickyBar } from './booking/BookingStickyBar';
import { BookingSummaryCard } from './booking/BookingSummaryCard';
import { HoldExtendDialog, shouldPromptHoldExtension } from './booking/HoldExtendDialog';
import { HoldExpiredBanner } from './booking/HoldExpiredBanner';
import { resolveEffectiveSelectedDate } from './booking/bookingHelpers';
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
  type BookingStep,
} from './booking/bookingMachine';
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

const ClientSignInDialog = dynamic(
  () => import('./booking/ClientSignInDialog').then((mod) => mod.ClientSignInDialog),
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
  const [flow, dispatch] = useReducer(bookingReducer, undefined, createInitialBookingFlowState);
  const timezone = settings.timezone || 'America/Mexico_City';
  const holdTotalSec = (settings.slotHoldMinutes || 5) * 60;

  const selection = useBookingSelectionState(props);
  const account = useClientAccount(props.initialClientProfile ?? null);
  const bookingMemory = useBookingMemory();
  const clientAuthEnabled = isClientAuthMethodEnabled('whatsapp_otp');
  const [signInRequest, setSignInRequest] = useState<{ intent: ClientSignInIntent; phone: string } | null>(null);
  const [isStartPromptDismissed, setIsStartPromptDismissed] = useState(false);
  const [isRepeatDismissed, setIsRepeatDismissed] = useState(false);
  const [justSignedInOnStart, setJustSignedInOnStart] = useState(false);

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
      if (flow.step === 'service') setJustSignedInOnStart(true);
    }
  };
  const handleSignOut = async () => {
    const before = currentContact();
    const previous = await account.signOut();
    setJustSignedInOnStart(false);
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
    hasProofAttached: Boolean(
      selection.showsDeposit &&
        selection.clientForm.proofDeliveryMethod !== 'none' &&
        selection.clientForm.proofDataUrl,
    ),
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
    hasExtrasOptions: selection.hasExtrasOptions,
    isPinned: selection.isPinned,
    pinnedStaffId: selection.pinnedStaffId,
    skipsStaffStep: selection.skipsStaffStep,
    subtotalCents: selection.subtotalCents,
    showsDeposit: selection.showsDeposit,
    client: selection.clientForm,
    signedInPhoneE164: account.profile?.phoneE164 ?? null,
    waitlistOfferToken,
    todayKey: initialTodayKey,
    revalidateActive,
    onBookingConfirmed: (summary) => {
      saveBookingMemory(summary);
      funnel.track('booking_confirmed', {
        serviceSlug: summary.serviceSlug,
        staffSlug: summary.staffSlug,
      });
    },
    navigateToManageUrl: (url) => router.push(url),
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
    prefetchBookingNextStep('service', false);
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
    hasExtrasOptions: selection.hasExtrasOptions,
    hasSelectedService: Boolean(selection.selectedService),
    requiresConfirmation: Boolean(selection.selectedService?.requiresConfirmation),
    totalDurationMinutes: selection.totalDurationMinutes,
    extrasSelectedCount: selection.activeSelectedAddons.length + selection.selectedExtraServices.length,
    chosenStaffId: actions.chosenStaffId,
    isSubmittingBooking: actions.isSubmittingBooking,
    showsDeposit: selection.showsDeposit,
    proofDataUrl: selection.clientForm.proofDataUrl,
    proofDeliveryMethod: selection.clientForm.proofDeliveryMethod,
    hasDesignDetails: Boolean(selection.clientForm.clientNotes.trim() || selection.clientForm.inspoFile),
  });

  const handleBack =
    nav.backTarget && !actions.isSubmittingBooking ? () => actions.goToStep(nav.backTarget!) : null;

  const handleNext = () => {
    prefetchBookingNextStep(flow.step, selection.hasExtrasOptions);
    if (flow.step === 'service') actions.goToStep(selection.hasExtrasOptions ? 'extras' : 'schedule');
    else if (flow.step === 'extras') actions.goToStep('schedule');
    else if (flow.step === 'schedule' && flow.selectedSlot) actions.goToStep('staff');
    else if (flow.step === 'staff' && flow.selectedSlot) actions.goToStep('design');
    else if (flow.step === 'design') actions.goToStep('details');
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
        totalDurationMinutes: selection.totalDurationMinutes,
      }),
    [selection.selectedService, selection.selectedExtraServices, selection.activeSelectedAddons, flow, selection.timeFormat, timezone, settings.address, actions.chosenStaffId, selection.isPinned, selection.totalDurationMinutes],
  );

  const summaryProps = {
    currency: settings.currency, rows: summaryRows, totalPriceCents,
    hasStartingPrice: selection.hasStartingPrice, discountCents,
    depositAmountCents: selection.showsDeposit ? selection.depositAmountCents || 20000 : 0,
    holdRemainingSec, holdTotalSec, isHoldExpired: flow.holdExpired,
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
      <JsonLdScript id="jsonld-reservar" data={bookingBreadcrumbData} />
      <p role="status" aria-live="polite" aria-atomic="true" className="rb-sr-only">
        {liveAnnouncement}
      </p>

      {!isEmbed ? (
        <BookingHeader settings={settings} holdRemainingSec={holdRemainingSec} onBack={handleBack} />
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

            {waitlistOfferToken ? (
              <Banner
                status="info"
                title="Tu lugar prioritario de lista de espera está activo"
                description="Tienes 30 minutos para elegir el horario liberado y confirmar tu cita antes de que pase al siguiente lugar."
              />
            ) : null}

            {flow.step === 'service' && repeatCandidate && !isRepeatDismissed ? (
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

            {flow.step === 'service' && clientAuthEnabled && !account.profile && !isStartPromptDismissed ? (
              <HStack gap={3} align="center" className="rb-signin-card fx-sheet-in">
                <VStack className="rb-signin-card-icon" align="center" justify="center" aria-hidden="true">
                  <BrandIcon name="iniciar-sesion" size={1.625} />
                </VStack>
                <VStack gap={0.5} className="rb-grow">
                  <Text weight="semibold">¿Ya has venido?</Text>
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    Entra con tu WhatsApp y llenamos tus datos.
                  </Text>
                </VStack>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  label="Entrar"
                  className="rb-signin-card-cta fx-press"
                  onClick={() => openSignIn('signin', selection.clientForm.clientPhone)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  label="Ahora no"
                  icon={<X size={16} aria-hidden="true" />}
                  className="rb-signin-card-close"
                  onClick={() => setIsStartPromptDismissed(true)}
                />
              </HStack>
            ) : null}

            {flow.step === 'service' && account.profile && justSignedInOnStart ? (
              <Banner
                status="success"
                title={
                  account.profile.fullName
                    ? `Hola, ${account.profile.fullName.split(/\s+/)[0]}`
                    : 'WhatsApp verificado'
                }
                description={
                  account.profile.isRegistered
                    ? 'Llenamos tus datos para cuando llegues a ese paso.'
                    : 'Tu WhatsApp ya quedó listo para tu reserva.'
                }
                isDismissable
                dismissLabel="Cerrar"
                onDismiss={() => setJustSignedInOnStart(false)}
              />
            ) : null}

            {bookingDraft.hasRestoredDraft ? (
              <Banner
                status="info"
                title="Seguimos donde te quedaste"
                description="Guardamos lo que llevabas para que no lo vuelvas a llenar."
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
            </VStack>

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

      <HoldExtendDialog
        isOpen={isHoldPromptOpen}
        holdRemainingSec={holdRemainingSec}
        extraMinutes={settings.slotHoldMinutes || 5}
        isExtending={actions.isExtendingHold}
        onExtend={() => void handleExtendHold()}
        onDecline={() => setHoldPromptDismissedFor(flow.holdExpiresAt)}
      />

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
