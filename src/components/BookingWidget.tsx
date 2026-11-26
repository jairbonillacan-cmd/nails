'use client';

import type React from 'react';
import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { ChevronUp } from 'lucide-react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  buildWhatsAppLink,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
} from '@/lib/format';
import { useBookingUrlSync } from '@/lib/hooks/useBookingUrlSync';
import { useCountdownTimer } from '@/lib/hooks/useCountdownTimer';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { getOrCreateBrowserSessionToken } from '@/lib/hooks/useSessionToken';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { BookingLayoutView, ServiceAddon, ServiceCategory } from '@/lib/types';
import { BookingHeader, BookingHero, STEP_LABELS } from './booking/BookingChrome';
import { BookingSummaryCard, type SummaryRow } from './booking/BookingSummaryCard';
import { ClientConfirmStep, type ClientFieldErrors } from './booking/ClientConfirmStep';
import { ScheduleStep, type ScheduleLayout } from './booking/ScheduleStep';
import { ServiceStep } from './booking/ServiceStep';
import { StaffStep } from './booking/StaffStep';
import { WaitlistDialog } from './booking/WaitlistDialog';
import {
  fetchAvailabilityDays,
  requestSlotHold,
  submitBookingRequest,
  validateCouponCode,
  type AppliedCouponState,
} from './booking/bookingApi';
import {
  formatServicePrice,
  hasConfiguredDeposit,
  resolveDepositAmountCents,
  type ProofDeliveryMethod,
} from './booking/bookingHelpers';
import {
  bookingReducer,
  createInitialBookingFlowState,
  type BookingStep,
} from './booking/bookingMachine';

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
}

const FORM_ID = 'rb-details-form';
const EMPTY_FIELD_ERRORS: ClientFieldErrors = { name: null, phone: null };

function shiftPlainDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(parts[0] ?? 2026, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function getNextMonthStartKey(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(parts[0] ?? 2026, parts[1] ?? 1, 1, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

function toScheduleLayout(view: BookingLayoutView | undefined): ScheduleLayout {
  return view === 'week' || view === 'column' ? 'week' : 'month';
}

function validateClientFields(name: string, phone: string): ClientFieldErrors {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return {
    name: words.length >= 2 ? null : 'Escribe tu nombre y apellido.',
    phone: phone.replace(/\D/g, '').length === 10 ? null : 'Tu WhatsApp debe tener 10 dígitos.',
  };
}

export function BookingWidget({
  settings,
  categories,
  services,
  addons,
  staff,
  initialTodayKey,
  initialServiceSlug,
  initialExtraServiceSlugs,
  initialAddonIds,
  initialStaffSlug,
  initialDate,
  initialLayout,
  initialSlot,
  initialInspoNote,
}: BookingWidgetProps) {
  const router = useRouter();
  const [flow, dispatch] = useReducer(bookingReducer, undefined, createInitialBookingFlowState);
  const timezone = settings.timezone || 'America/Mexico_City';
  const holdTotalSec = (settings.slotHoldMinutes || 5) * 60;

  const initialService = services.find((s) => s.slug === initialServiceSlug) ?? services[0] ?? null;
  const initialPinnedStaff =
    staff.find((member) => member.bookingSlug === initialStaffSlug || member.id === initialStaffSlug)?.id ?? 'any';

  const resolvedInitialExtraIds = useMemo(() => {
    if (!initialExtraServiceSlugs || initialExtraServiceSlugs.length === 0) return [];
    const primaryId = initialService?.id ?? '';
    return Array.from(
      new Set(
        initialExtraServiceSlugs
          .map((token) => services.find((srv) => srv.slug === token || srv.id === token)?.id)
          .filter((id): id is string => Boolean(id) && id !== primaryId),
      ),
    ).slice(0, 8);
  }, [initialExtraServiceSlugs, initialService, services]);

  const resolvedInitialAddonIds = useMemo(() => {
    if (!initialAddonIds || initialAddonIds.length === 0) return [];
    const activeIds = new Set(addons.map((addon) => addon.id));
    return Array.from(new Set(initialAddonIds.filter((id) => activeIds.has(id))));
  }, [addons, initialAddonIds]);

  const resolvedInitialDate = initialDate && initialDate >= initialTodayKey ? initialDate : initialTodayKey;
  const resolvedInitialLayout = toScheduleLayout(
    initialLayout &&
      (settings.enabledBookingLayouts.length === 0 || settings.enabledBookingLayouts.includes(initialLayout))
      ? initialLayout
      : settings.defaultBookingLayout,
  );

  const [selectedServiceId, setSelectedServiceId] = useState(initialService?.id ?? '');
  const [selectedExtraServiceIds, setSelectedExtraServiceIds] = useState<string[]>(resolvedInitialExtraIds);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(resolvedInitialAddonIds);
  const [pinnedStaffId, setPinnedStaffId] = useState(
    staff.length === 1 && staff[0] ? staff[0].id : initialPinnedStaff,
  );
  const [chosenStaffId, setChosenStaffId] = useState('any');
  const [takenStaffIds, setTakenStaffIds] = useState<ReadonlySet<string>>(() => new Set());
  const [staffError, setStaffError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const [layoutView, setLayoutView] = useState<ScheduleLayout>(resolvedInitialLayout);
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h');
  const [windowStartDate, setWindowStartDate] = useState(resolvedInitialDate);
  const [selectedDate, setSelectedDate] = useState(resolvedInitialDate);
  const [availabilityDays, setAvailabilityDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(true);
  const realtimePing = useEphemeralMessage(3500);

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientInstagram, setClientInstagram] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientBirthday, setClientBirthday] = useState('');
  const [clientNotes, setClientNotes] = useState(initialInspoNote ? `Referencia de galería: ${initialInspoNote}` : '');
  const [inspoFile, setInspoFile] = useState<File | null>(null);
  const [inspoDataUrl, setInspoDataUrl] = useState<string | null>(null);
  const [proofDeliveryMethod, setProofDeliveryMethod] = useState<ProofDeliveryMethod>('web_upload');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCouponState | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const idempotencyKeyRef = useRef('');

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? services[0],
    [services, selectedServiceId],
  );
  const selectedExtraServices = useMemo(
    () => services.filter((srv) => srv.id !== selectedService?.id && selectedExtraServiceIds.includes(srv.id)),
    [services, selectedService, selectedExtraServiceIds],
  );
  const selectedServiceIdSet = useMemo(() => {
    const ids = selectedExtraServices.map((srv) => srv.id);
    if (selectedService) ids.push(selectedService.id);
    return new Set(ids);
  }, [selectedService, selectedExtraServices]);

  const compatibleAddons = useMemo(() => {
    if (!selectedService) return [];
    return addons.filter((a) => a.appliesToAll || a.serviceIds.some((id) => selectedServiceIdSet.has(id)));
  }, [addons, selectedService, selectedServiceIdSet]);

  const activeSelectedAddons = useMemo(
    () => compatibleAddons.filter((a) => selectedAddonIds.includes(a.id)),
    [compatibleAddons, selectedAddonIds],
  );

  const eligibleStaff = useMemo(() => {
    if (!selectedService) return staff;
    const requiredIds = Array.from(selectedServiceIdSet);
    return staff.filter(
      (member) => member.serviceIds.length === 0 || requiredIds.every((id) => member.serviceIds.includes(id)),
    );
  }, [staff, selectedService, selectedServiceIdSet]);

  const isPinned = pinnedStaffId !== 'any';
  const pinnedStaff = isPinned ? (staff.find((member) => member.id === pinnedStaffId) ?? null) : null;
  const skipsStaffStep = isPinned || eligibleStaff.length <= 1;

  const totalDurationMinutes = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.durationMinutes +
      selectedExtraServices.reduce((sum, srv) => sum + srv.durationMinutes, 0) +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraMinutes, 0)
    );
  }, [selectedService, selectedExtraServices, activeSelectedAddons]);

  const subtotalCents = useMemo(() => {
    if (!selectedService) return 0;
    return (
      selectedService.priceCents +
      selectedExtraServices.reduce((sum, srv) => sum + srv.priceCents, 0) +
      activeSelectedAddons.reduce((sum, a) => sum + a.extraPriceCents, 0)
    );
  }, [selectedService, selectedExtraServices, activeSelectedAddons]);

  const hasStartingPrice = Boolean(
    selectedService?.isStartingPrice || selectedExtraServices.some((srv) => srv.isStartingPrice),
  );
  const depositAmountCents = useMemo(
    () => resolveDepositAmountCents(settings, selectedService, selectedExtraServices),
    [settings, selectedService, selectedExtraServices],
  );
  const showsDeposit = hasConfiguredDeposit(settings, depositAmountCents);
  const discountCents = appliedCoupon?.discountCents ?? 0;
  const totalPriceCents = Math.max(0, subtotalCents - discountCents);

  const extraServiceKey = selectedExtraServices.map((srv) => srv.id).join(',');
  const addonKey = activeSelectedAddons.map((a) => a.id).join(',');

  useBookingUrlSync({
    servicio: selectedService?.slug,
    extras: selectedExtraServices.map((srv) => srv.slug),
    addons: activeSelectedAddons.map((a) => a.id),
    staff: pinnedStaff?.bookingSlug ?? '',
    date: selectedDate,
    layout: layoutView,
    defaultLayout: toScheduleLayout(settings.defaultBookingLayout),
    slot: flow.selectedSlot?.startAt ?? initialSlot ?? '',
  });

  const maxAllowedDateKey = useMemo(
    () => shiftPlainDateKey(initialTodayKey, Math.max(35, settings.maxBookingDaysAhead || 45)),
    [initialTodayKey, settings.maxBookingDaysAhead],
  );

  const nextMonthStartKey = useMemo(() => {
    const base = selectedDate >= windowStartDate ? selectedDate : windowStartDate;
    const candidate = getNextMonthStartKey(base);
    return candidate > windowStartDate ? candidate : shiftPlainDateKey(windowStartDate, 30);
  }, [selectedDate, windowStartDate]);

  const canAdvanceMonth = nextMonthStartKey <= maxAllowedDateKey;

  const fetchAvailability = useCallback(
    async (signal?: AbortSignal) => {
      if (!selectedService) return;
      try {
        const days = await fetchAvailabilityDays({
          serviceId: selectedService.id,
          extraServiceKey,
          addonKey,
          staffId: pinnedStaffId,
          startDate: windowStartDate,
          signal,
        });
        if (days) {
          setAvailabilityDays(days);
          setSelectedDate((currentDate) => {
            const currentDay = days.find((d) => d.date === currentDate);
            if (currentDay && currentDay.hasSlots) return currentDate;
            return days.find((d) => d.hasSlots)?.date ?? days[0]?.date ?? currentDate;
          });
        }
      } catch {
        return;
      } finally {
        if (!signal?.aborted) setLoadingAvail(false);
      }
    },
    [selectedService, extraServiceKey, addonKey, pinnedStaffId, windowStartDate, setLoadingAvail],
  );

  useExternalSync(
    `${selectedService?.id ?? ''}:${extraServiceKey}:${addonKey}:${pinnedStaffId}:${windowStartDate}`,
    fetchAvailability,
  );

  useRealtimeSubscription(
    useCallback(
      (evt) => {
        if (
          evt.type === 'slot_changed' ||
          evt.type === 'hold_changed' ||
          evt.type === 'schedule_changed' ||
          evt.type === 'booking_created' ||
          evt.type === 'booking_updated' ||
          evt.type === 'slot_hold_updated' ||
          evt.type === 'availability_updated'
        ) {
          realtimePing.show('Disponibilidad actualizada en tiempo real');
          void fetchAvailability();
        }
      },
      [fetchAvailability, realtimePing],
    ),
  );

  const holdRemainingSec = useCountdownTimer(
    flow.holdExpiresAt,
    useCallback(() => {
      dispatch({
        type: 'HOLD_EXPIRED',
        message: `Pasaron los ${settings.slotHoldMinutes || 5} minutos de apartado y el horario se liberó. Elige uno de nuevo.`,
      });
      void fetchAvailability();
    }, [fetchAvailability, settings.slotHoldMinutes]),
  );

  const availableDateSet = useMemo(
    () => new Set(availabilityDays.filter((d) => d.hasSlots).map((d) => d.date)),
    [availabilityDays],
  );
  const selectedDaySummary = useMemo(
    () => availabilityDays.find((d) => d.date === selectedDate) ?? null,
    [availabilityDays, selectedDate],
  );

  const liveAnnouncement = useMemo(() => {
    if (flow.conflict?.message) return `Horario recién ocupado. ${flow.conflict.message}`;
    if (flow.formErrorCode === 'MAX_ACTIVE_BOOKINGS' && flow.formError) {
      return `Límite de citas activas alcanzado. ${flow.formError}`;
    }
    if (holdRemainingSec === holdTotalSec) {
      return `Horario apartado por ${settings.slotHoldMinutes || 5} minutos mientras terminas.`;
    }
    if (holdRemainingSec === 60) return 'Te queda 1 minuto para terminar tu reserva.';
    if (holdRemainingSec === 30) return 'Te quedan 30 segundos para terminar tu reserva.';
    if (holdRemainingSec === 10) return 'Te quedan 10 segundos de apartado.';
    if (realtimePing.message) return realtimePing.message;
    if (flow.step === 'schedule' && !loadingAvail && selectedDaySummary) {
      const dateLabel = formatDateShortInTimezone(`${selectedDaySummary.date}T18:00:00Z`, timezone);
      return selectedDaySummary.slotCount > 0
        ? `${selectedDaySummary.slotCount} horarios disponibles para ${dateLabel}.`
        : `Sin horarios disponibles para ${dateLabel}.`;
    }
    return '';
  }, [
    flow.conflict,
    flow.formError,
    flow.formErrorCode,
    flow.step,
    holdRemainingSec,
    holdTotalSec,
    loadingAvail,
    realtimePing.message,
    selectedDaySummary,
    settings.slotHoldMinutes,
    timezone,
  ]);

  const revealPanel = () => {
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToStep = (step: BookingStep) => {
    dispatch({ type: 'GO_TO_STEP', step });
    revealPanel();
  };

  const releaseHold = () => {
    if (flow.holdId) void fetch('/api/slot-holds', { method: 'DELETE' });
  };

  const resetSelection = () => {
    releaseHold();
    dispatch({ type: 'SELECTION_CHANGED' });
  };

  const handleAdvanceMonth = () => {
    if (!canAdvanceMonth) return;
    setLoadingAvail(true);
    setWindowStartDate(nextMonthStartKey);
    setSelectedDate(nextMonthStartKey);
  };

  const handleReturnToToday = () => {
    setLoadingAvail(true);
    setWindowStartDate(initialTodayKey);
    setSelectedDate(initialTodayKey);
  };

  const handleSelectDate = (nextDate: string) => {
    setSelectedDate(nextDate);
    const loadedEnd = availabilityDays[availabilityDays.length - 1]?.date;
    if (loadedEnd && nextDate > loadedEnd && nextDate <= maxAllowedDateKey) {
      setLoadingAvail(true);
      setWindowStartDate(nextDate);
    }
  };

  const holdSlot = async (slot: AvailableSlot, staffId: string) => {
    if (!selectedService || !settings.enableSlotHold) {
      return { ok: true as const, holdId: null, holdExpiresAt: null };
    }
    try {
      return await requestSlotHold({
        serviceId: selectedService.id,
        extraServiceIds: selectedExtraServices.map((srv) => srv.id),
        addonIds: activeSelectedAddons.map((a) => a.id),
        staffId,
        startAt: slot.startAt,
        sessionToken: getOrCreateBrowserSessionToken('nails_session_tok'),
      });
    } catch {
      return { ok: true as const, holdId: null, holdExpiresAt: null };
    }
  };

  const handleSelectSlot = async (slot: AvailableSlot) => {
    if (!selectedService || isBusy) return;
    setIsBusy(true);
    const result = await holdSlot(slot, slot.staffId);
    setIsBusy(false);
    if (!result.ok) {
      dispatch({ type: 'SLOT_CONFLICT', message: result.error, suggestions: result.suggestedSlots });
      revealPanel();
      void fetchAvailability();
      return;
    }
    const keySuffix =
      typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `${Date.now()}-${slot.staffId}`;
    idempotencyKeyRef.current = `idem-${keySuffix}`;
    const hasStaffChoice = !skipsStaffStep && slot.availableStaffIds.length > 1;
    setChosenStaffId(isPinned ? pinnedStaffId : hasStaffChoice ? 'any' : slot.staffId);
    setTakenStaffIds(new Set());
    setStaffError(null);
    dispatch({
      type: 'SELECT_SLOT_HOLD_ACQUIRED',
      slot,
      holdId: result.holdId,
      holdExpiresAt: result.holdExpiresAt,
      nextStep: hasStaffChoice ? 'staff' : 'details',
    });
    revealPanel();
  };

  const handlePickStaff = async (staffId: string) => {
    const slot = flow.selectedSlot;
    if (!slot || isBusy) return;
    setStaffError(null);
    const member = staff.find((item) => item.id === staffId);
    if (staffId === 'any' || !member || staffId === slot.staffId) {
      setChosenStaffId(staffId);
      dispatch({ type: 'STAFF_ASSIGNED', slot, holdId: null, holdExpiresAt: null });
      revealPanel();
      return;
    }
    setIsBusy(true);
    const result = await holdSlot(slot, staffId);
    setIsBusy(false);
    if (!result.ok) {
      setTakenStaffIds((prev) => new Set([...prev, staffId]));
      setStaffError(`${member.name} acaba de ocupar esa hora. Tu horario sigue apartado: elige otra opción.`);
      return;
    }
    setChosenStaffId(staffId);
    dispatch({
      type: 'STAFF_ASSIGNED',
      slot: { ...slot, staffId, staffName: member.name },
      holdId: result.holdId,
      holdExpiresAt: result.holdExpiresAt,
    });
    revealPanel();
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || couponLoading) return;
    setCouponError(null);
    setCouponLoading(true);
    try {
      const result = await validateCouponCode(couponInput, subtotalCents);
      if (!result.valid) {
        setAppliedCoupon(null);
        setCouponError(result.error);
        return;
      }
      setAppliedCoupon(result.coupon);
    } catch {
      setAppliedCoupon(null);
      setCouponError('Error de conexión al validar el cupón. Intenta de nuevo.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setCouponInput('');
  };

  const fieldErrors = hasTriedSubmit ? validateClientFields(clientName, clientPhone) : EMPTY_FIELD_ERRORS;

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !flow.selectedSlot) return;
    setHasTriedSubmit(true);
    const errors = validateClientFields(clientName, clientPhone);
    if (errors.name || errors.phone) {
      dispatch({ type: 'SUBMIT_FAILED', error: errors.name ?? errors.phone ?? '' });
      return;
    }
    if (!flow.privacyConsentAccepted) {
      dispatch({ type: 'CONSENT_REQUIRED_ERROR', message: 'Necesitamos tu aceptación para apartar la cita.' });
      return;
    }

    dispatch({ type: 'START_SUBMIT' });
    const effectiveProofMethod: ProofDeliveryMethod = !showsDeposit
      ? 'none'
      : proofDeliveryMethod === 'instagram_dm'
        ? 'instagram_dm'
        : proofDataUrl
          ? 'web_upload'
          : 'none';

    try {
      const result = await submitBookingRequest(idempotencyKeyRef.current, {
        serviceId: selectedService.id,
        extraServiceIds: selectedExtraServices.map((srv) => srv.id),
        addonIds: activeSelectedAddons.map((a) => a.id),
        staffId: flow.selectedSlot.staffId,
        startAt: flow.selectedSlot.startAt,
        clientName,
        clientPhone,
        clientInstagram: clientInstagram.trim() || null,
        clientEmail: clientEmail || null,
        clientBirthday: clientBirthday || null,
        clientNotes,
        inspoPhotoUrl: inspoDataUrl,
        paymentProofUrl: effectiveProofMethod === 'web_upload' ? proofDataUrl : null,
        proofDeliveryMethod: effectiveProofMethod,
        couponCode: appliedCoupon?.code || null,
        holdId: flow.holdId ?? undefined,
        sessionToken: getOrCreateBrowserSessionToken('nails_session_tok'),
        privacyConsentAccepted: true,
        marketingOptIn: flow.marketingOptIn,
      });

      if (result.kind === 'conflict') {
        dispatch({ type: 'SLOT_CONFLICT', message: result.error, suggestions: result.suggestedSlots });
        revealPanel();
        void fetchAvailability();
        return;
      }
      if (result.kind === 'error') {
        dispatch({
          type: 'SUBMIT_FAILED',
          error: result.error,
          code: result.code ?? null,
          activeBookings: result.activeBookings,
        });
        revealPanel();
        return;
      }
      dispatch({ type: 'SUBMIT_CONFIRMED', manageUrl: result.manageUrl });
      router.push(result.manageUrl);
    } catch {
      dispatch({ type: 'SUBMIT_FAILED', error: 'Error de conexión. Intenta nuevamente.' });
    }
  };

  const step = flow.step;
  const hasSlot = Boolean(flow.selectedSlot);
  const skipsStaffForSlot = skipsStaffStep || (flow.selectedSlot?.availableStaffIds.length ?? 0) <= 1;
  const completedSteps = new Set<BookingStep>(['service']);
  if (hasSlot) completedSteps.add('schedule');
  if (hasSlot && (skipsStaffForSlot || step === 'details')) completedSteps.add('staff');

  const previousStep = (current: BookingStep): BookingStep | null => {
    if (current === 'details') return skipsStaffForSlot ? 'schedule' : 'staff';
    if (current === 'staff') return 'schedule';
    if (current === 'schedule') return 'service';
    return null;
  };
  const backTarget = previousStep(step);
  const handleBack = backTarget ? () => goToStep(backTarget) : null;

  const handleNext = () => {
    if (step === 'service') goToStep('schedule');
    else if (step === 'schedule' && hasSlot) goToStep(skipsStaffForSlot ? 'details' : 'staff');
    else if (step === 'staff') void handlePickStaff(chosenStaffId);
  };

  const canContinue =
    step === 'service' ? Boolean(selectedService) : step === 'schedule' ? hasSlot : step === 'staff' ? hasSlot : true;
  const nextLabel =
    step === 'details' ? (showsDeposit || selectedService?.requiresConfirmation ? 'Apartar mi cita' : 'Confirmar cita') : 'Continuar';
  const nextHint =
    step === 'service'
      ? `${formatDuration(totalDurationMinutes)} en total`
      : step === 'schedule'
        ? hasSlot
          ? 'Horario apartado'
          : 'Elige un horario'
        : step === 'staff'
          ? chosenStaffId === 'any'
            ? 'Te asignamos a quien esté libre'
            : ''
          : showsDeposit
            ? 'Después subes tu anticipo'
            : '';

  const slot = flow.selectedSlot;
  const slotTime = slot ? (timeFormat === '24h' ? slot.localTime24 : slot.localTime12) : '';
  const staffDecided = Boolean(slot) && (skipsStaffForSlot || step === 'details');
  const summaryRows: SummaryRow[] = [
    {
      key: 'service',
      label: 'Servicio',
      value: [selectedService?.name, ...selectedExtraServices.map((srv) => srv.name)].filter(Boolean).join(' + '),
      sub: activeSelectedAddons.map((a) => a.name).join(' · ') || 'Sin extras',
      mark: '1',
      isDone: true,
    },
    {
      key: 'when',
      label: 'Cuándo',
      value: slot ? `${formatDateLongInTimezone(slot.startAt, timezone)} · ${slotTime}` : 'Por elegir',
      sub: slot ? settings.address : null,
      mark: '2',
      isDone: Boolean(slot),
    },
    {
      key: 'staff',
      label: 'Artista',
      value: !staffDecided
        ? 'Por elegir'
        : chosenStaffId === 'any' && !isPinned
          ? 'Me da igual'
          : (slot?.staffName ?? 'Por elegir'),
      sub: staffDecided && chosenStaffId === 'any' && !isPinned && slot ? `Te atiende ${slot.staffName}` : null,
      mark: '3',
      isDone: staffDecided,
    },
    {
      key: 'duration',
      label: 'Duración',
      value: formatDuration(totalDurationMinutes),
      sub: null,
      mark: 'clock',
      isDone: true,
    },
  ];

  const summaryProps = {
    currency: settings.currency,
    rows: summaryRows,
    totalPriceCents,
    hasStartingPrice,
    discountCents,
    depositAmountCents: showsDeposit ? depositAmountCents || 20000 : 0,
    holdRemainingSec,
    holdTotalSec,
  };

  const whatsappUrl = buildWhatsAppLink(settings.whatsappNumber, `Hola ${settings.name}, tengo una duda para agendar mi cita.`);

  const nextButton = (fullWidth: boolean) =>
    step === 'details' ? (
      <Button
        type="submit"
        form={FORM_ID}
        variant="primary"
        size="lg"
        label={nextLabel}
        width={fullWidth ? '100%' : undefined}
        isLoading={flow.phase === 'submitting'}
        className="rb-cta fx-press"
      />
    ) : (
      <Button
        variant="primary"
        size="lg"
        label={nextLabel}
        width={fullWidth ? '100%' : undefined}
        isDisabled={!canContinue || isBusy}
        isLoading={isBusy && step === 'staff'}
        onClick={handleNext}
        className="rb-cta fx-press"
      />
    );

  return (
    <VStack className="lk-root rb-root">
      <p role="status" aria-live="polite" aria-atomic="true" className="rb-sr-only">
        {liveAnnouncement}
      </p>

      <BookingHeader
        salonName={settings.name}
        step={step}
        holdRemainingSec={holdRemainingSec}
        whatsappUrl={whatsappUrl}
        onBack={handleBack}
      />
      <BookingHero step={step} completedSteps={completedSteps} onGoToStep={goToStep} />

      <VStack as="main" className="rb-wrap rb-main">
        <VStack className="rb-layout">
          <VStack as="section" className="rb-panel" aria-label={STEP_LABELS[step]}>
            {flow.conflict ? (
              <VStack className="fx-fade-up">
                <Banner
                  status="warning"
                  title="Ese horario se acaba de ocupar"
                  description={flow.conflict.message}
                  isDismissable
                  onDismiss={() => dispatch({ type: 'DISMISS_CONFLICT' })}
                >
                  {flow.conflict.suggestions.length > 0 ? (
                    <HStack gap={2} wrap="wrap" paddingBlockStart={2}>
                      {flow.conflict.suggestions.slice(0, 3).map((alt) => (
                        <Button
                          key={`${alt.staffId}-${alt.startAt}`}
                          variant="secondary"
                          size="md"
                          className="fx-press fx-tabular"
                          isDisabled={isBusy}
                          label={`${formatDateShortInTimezone(alt.startAt, timezone)} · ${
                            timeFormat === '24h' ? alt.localTime24 : alt.localTime12
                          }`}
                          onClick={() => void handleSelectSlot(alt)}
                        />
                      ))}
                    </HStack>
                  ) : null}
                </Banner>
              </VStack>
            ) : null}

            {step === 'service' ? (
              <ServiceStep
                currency={settings.currency}
                categories={categories}
                services={services}
                selectedService={selectedService}
                selectedExtraServiceIds={selectedExtraServiceIds}
                compatibleAddons={compatibleAddons}
                selectedAddonIds={selectedAddonIds}
                onSelectService={(serviceId) => {
                  setSelectedServiceId(serviceId);
                  setSelectedExtraServiceIds((prev) => prev.filter((id) => id !== serviceId));
                  resetSelection();
                }}
                onToggleExtraService={(serviceId, checked) => {
                  setSelectedExtraServiceIds((prev) =>
                    checked ? Array.from(new Set([...prev, serviceId])).slice(0, 8) : prev.filter((id) => id !== serviceId),
                  );
                  resetSelection();
                }}
                onToggleAddon={(addonId, checked) => {
                  setSelectedAddonIds((prev) =>
                    checked ? Array.from(new Set([...prev, addonId])) : prev.filter((id) => id !== addonId),
                  );
                  resetSelection();
                }}
              />
            ) : null}

            {step === 'schedule' ? (
              <ScheduleStep
                settings={settings}
                layoutView={layoutView}
                timeFormat={timeFormat}
                todayKey={initialTodayKey}
                selectedDate={selectedDate}
                availabilityDays={availabilityDays}
                availableDateSet={availableDateSet}
                selectedDaySummary={selectedDaySummary}
                selectedSlot={flow.selectedSlot}
                pinnedStaffName={pinnedStaff?.name ?? null}
                isBusy={isBusy}
                loadingAvail={loadingAvail}
                canAdvanceMonth={canAdvanceMonth}
                isViewingFutureWindow={windowStartDate > initialTodayKey}
                onChangeLayoutView={setLayoutView}
                onChangeTimeFormat={setTimeFormat}
                onSelectDate={handleSelectDate}
                onSelectSlot={(next) => void handleSelectSlot(next)}
                onShowAllStaff={() => {
                  setLoadingAvail(true);
                  setPinnedStaffId('any');
                  resetSelection();
                }}
                onRedirectStaff={(staffId) => {
                  setLoadingAvail(true);
                  setPinnedStaffId(staffId);
                  resetSelection();
                }}
                onAdvanceMonth={handleAdvanceMonth}
                onReturnToToday={handleReturnToToday}
                onOpenWaitlist={() => setWaitlistOpen(true)}
              />
            ) : null}

            {step === 'staff' && slot ? (
              <StaffStep
                timezone={timezone}
                timeFormat={timeFormat}
                slot={slot}
                eligibleStaff={eligibleStaff}
                allStaff={staff}
                chosenStaffId={chosenStaffId}
                takenStaffIds={takenStaffIds}
                isBusy={isBusy}
                errorMessage={staffError}
                onPickStaff={(staffId) => void handlePickStaff(staffId)}
              />
            ) : null}

            {step === 'details' ? (
              <ClientConfirmStep
                formId={FORM_ID}
                settings={settings}
                selectedService={selectedService}
                selectedExtraServices={selectedExtraServices}
                activeSelectedAddons={activeSelectedAddons}
                selectedSlot={flow.selectedSlot}
                timeFormat={timeFormat}
                totalDurationMinutes={totalDurationMinutes}
                depositAmountCents={depositAmountCents}
                couponInput={couponInput}
                appliedCoupon={appliedCoupon}
                couponError={couponError}
                couponLoading={couponLoading}
                clientName={clientName}
                clientPhone={clientPhone}
                clientInstagram={clientInstagram}
                clientEmail={clientEmail}
                clientBirthday={clientBirthday}
                clientNotes={clientNotes}
                inspoFile={inspoFile}
                proofDeliveryMethod={proofDeliveryMethod}
                proofFile={proofFile}
                privacyConsentAccepted={flow.privacyConsentAccepted}
                marketingOptIn={flow.marketingOptIn}
                privacyConsentError={flow.privacyConsentError}
                fieldErrors={fieldErrors}
                formError={flow.formError}
                formErrorCode={flow.formErrorCode}
                activeBookings={flow.activeBookings}
                onChangeCouponInput={setCouponInput}
                onApplyCoupon={() => void handleApplyCoupon()}
                onRemoveCoupon={handleRemoveCoupon}
                onChangeClientName={setClientName}
                onChangeClientPhone={setClientPhone}
                onChangeClientInstagram={setClientInstagram}
                onChangeClientEmail={setClientEmail}
                onChangeClientBirthday={setClientBirthday}
                onChangeClientNotes={setClientNotes}
                onChangeInspoFile={(file, dataUrl) => {
                  setInspoFile(file);
                  setInspoDataUrl(dataUrl);
                }}
                onChangeProofMethod={setProofDeliveryMethod}
                onChangeProofFile={(file, dataUrl) => {
                  setProofFile(file);
                  setProofDataUrl(dataUrl);
                }}
                onChangePrivacyConsent={(accepted) => dispatch({ type: 'SET_PRIVACY_CONSENT', accepted })}
                onChangeMarketingOptIn={(optedIn) => dispatch({ type: 'SET_MARKETING_OPT_IN', optedIn })}
                onSubmit={(e) => void handleConfirmBooking(e)}
              />
            ) : null}

            <HStack justify="between" align="center" gap={3} className="rb-actions rb-d">
              <Button
                label="Atrás"
                variant="secondary"
                size="lg"
                className="fx-press"
                isDisabled={!backTarget}
                onClick={() => {
                  if (backTarget) goToStep(backTarget);
                }}
              />
              <HStack gap={3} align="center">
                {nextHint ? (
                  <Text type="supporting" color="secondary">
                    {nextHint}
                  </Text>
                ) : null}
                {nextButton(false)}
              </HStack>
            </HStack>
          </VStack>

          <VStack as="aside" className="rb-aside rb-d" aria-labelledby="rb-summary-aside">
            <BookingSummaryCard {...summaryProps} headingId="rb-summary-aside" />
          </VStack>
        </VStack>
      </VStack>

      <HStack justify="between" align="center" gap={3} className="rb-bottom rb-m">
        <button
          type="button"
          className="rb-bottom-summary fx-press"
          aria-haspopup="dialog"
          onClick={() => setSummaryOpen(true)}
        >
          <Text className="lk-serif rb-bottom-total" hasTabularNumbers>
            {formatServicePrice(totalPriceCents, hasStartingPrice, settings.currency)}
          </Text>
          <Text type="supporting" color="accent" weight="semibold" className="rb-bottom-hint" hasTabularNumbers>
            {formatDuration(totalDurationMinutes)} · Ver resumen
            <ChevronUp size={14} aria-hidden="true" />
          </Text>
        </button>
        {nextButton(false)}
      </HStack>

      <BottomSheet isOpen={summaryOpen} onOpenChange={setSummaryOpen} label="Resumen de tu cita" padding={0} height="hug">
        <VStack className="lk-portal rb-sheet fx-sheet-in">
          <BookingSummaryCard {...summaryProps} headingId="rb-summary-sheet" />
        </VStack>
      </BottomSheet>

      <WaitlistDialog
        isOpen={waitlistOpen}
        serviceId={selectedService?.id}
        selectedStaffId={pinnedStaffId}
        selectedDate={selectedDate}
        onOpenChange={setWaitlistOpen}
      />
    </VStack>
  );
}
