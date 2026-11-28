'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { normalizePhoneE164 } from '@/lib/format';
import { sendBestEffortRequest } from '@/lib/http/client-fetch';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import {
  requestSlotHold,
  submitBookingRequest,
  validateCouponCode,
  type AppliedCouponState,
  type SlotHoldResult,
} from '@/components/booking/bookingApi';
import {
  birthdayInputToIso,
  findAlternativeSlotsForDate,
  findMatchingSlotInAvailability,
  hasClientFieldErrors,
  prefersReducedMotion,
  validateClientBookingFields,
  type ClientFieldErrors,
} from '@/components/booking/bookingHelpers';
import type {
  BookingFlowAction,
  BookingFlowState,
  BookingHoldErrorState,
  BookingStep,
} from '@/components/booking/bookingMachine';
import { buildIdempotencyKey } from '@/components/booking/bookingViewHelpers';
import { isPhoneMatchingSession } from '@/components/booking/clientAccountHelpers';

const EMPTY_FIELD_ERRORS: ClientFieldErrors = { name: null, phone: null, email: null, birthday: null };

type PendingHoldRetryTarget =
  | { kind: 'slot'; slot: AvailableSlot; stayOnDetails: boolean }
  | { kind: 'extend' }
  | { kind: 'staff'; staffId: string };

function toHoldErrorState(
  result: Extract<SlotHoldResult, { kind: 'rate_limited' | 'policy' | 'unavailable' }>,
): BookingHoldErrorState {
  if (result.kind === 'rate_limited') {
    return {
      kind: 'rate_limited',
      message: result.error,
      ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
    };
  }
  return {
    kind: result.kind,
    message: result.error,
  };
}

interface ClientFormValues {
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  clientNotes: string;
  inspoDataUrl: string | null;
}

interface UseBookingFlowActionsInput {
  flow: BookingFlowState;
  dispatch: React.Dispatch<BookingFlowAction>;
  settings: PublicSettingsDTO;
  staff: PublicStaffDTO[];
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  isPinned: boolean;
  pinnedStaffId: string;
  skipsStaffStep: boolean;
  subtotalCents: number;
  client: ClientFormValues;
  signedInPhoneE164?: string | null;
  waitlistOfferToken?: string | null;
  todayKey: string;
  revalidateActive: () => void;
  onBookingConfirmed?: (summary: {
    serviceSlug: string;
    serviceName: string;
    staffSlug: string | null;
    staffName: string | null;
  }) => void;
  navigateToManageUrl: (url: string) => void;
}

export function useBookingFlowActions({
  flow,
  dispatch,
  settings,
  staff,
  selectedService,
  selectedExtraServices,
  activeSelectedAddons,
  isPinned,
  pinnedStaffId,
  skipsStaffStep,
  subtotalCents,
  client,
  signedInPhoneE164 = null,
  waitlistOfferToken = null,
  todayKey,
  revalidateActive,
  onBookingConfirmed,
  navigateToManageUrl,
}: UseBookingFlowActionsInput) {
  const [chosenStaffId, setChosenStaffId] = useState('any');
  const [takenStaffIds, setTakenStaffIds] = useState<ReadonlySet<string>>(() => new Set());
  const [staffError, setStaffError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingSlotKey, setPendingSlotKey] = useState<string | null>(null);
  const [pendingStaffId, setPendingStaffId] = useState<string | null>(null);
  const [isReholding, setIsReholding] = useState(false);
  const [isExtendingHold, setIsExtendingHold] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCouponState | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const idempotencyKeyRef = useRef('');
  const busyLockRef = useRef(false);
  const submitLockRef = useRef(false);
  const lastFailedHoldRef = useRef<PendingHoldRetryTarget | null>(null);

  const revealPanel = () => {
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  };

  const goToStep = (nextStep: BookingStep) => {
    dispatch({ type: 'GO_TO_STEP', step: nextStep });
    revealPanel();
  };

  const resetSelection = () => {
    if (flow.holdId) sendBestEffortRequest('/api/slot-holds', { method: 'DELETE' });
    lastFailedHoldRef.current = null;
    setAppliedCoupon(null);
    setCouponError(null);
    dispatch({ type: 'SELECTION_CHANGED' });
  };

  const holdSlot = async (slot: AvailableSlot, staffId: string): Promise<SlotHoldResult> => {
    if (!selectedService || !settings.enableSlotHold) {
      return { kind: 'held', holdId: null, holdExpiresAt: null };
    }
    return requestSlotHold({
      serviceId: selectedService.id,
      extraServiceIds: selectedExtraServices.map((srv) => srv.id),
      addonIds: activeSelectedAddons.map((a) => a.id),
      staffId,
      startAt: slot.startAt,
      waitlistOfferToken: waitlistOfferToken?.trim() || undefined,
    });
  };

  const handleSelectSlot = async (
    slot: AvailableSlot,
    options?: { stayOnDetails?: boolean },
  ) => {
    if (!selectedService || isBusy || busyLockRef.current) return;
    const skipsStaffForThisSlot = skipsStaffStep || slot.availableStaffIds.length <= 1;
    const resolvedStaffId =
      skipsStaffForThisSlot && !isPinned && slot.availableStaffIds.length === 1
        ? (slot.availableStaffIds[0] ?? slot.staffId)
        : slot.staffId;
    const resolvedMember = staff.find((member) => member.id === resolvedStaffId);
    const targetSlot: AvailableSlot = resolvedMember
      ? { ...slot, staffId: resolvedMember.id, staffName: resolvedMember.name }
      : slot;
    const slotKey = `${slot.staffId}-${slot.startAt}`;
    busyLockRef.current = true;
    setIsBusy(true);
    setPendingSlotKey(slotKey);
    try {
      const result = await holdSlot(targetSlot, targetSlot.staffId);
      if (result.kind === 'conflict') {
        lastFailedHoldRef.current = null;
        dispatch({ type: 'SLOT_CONFLICT', message: result.error, suggestions: result.suggestedSlots });
        revealPanel();
        revalidateActive();
        return;
      }
      if (result.kind !== 'held') {
        lastFailedHoldRef.current = {
          kind: 'slot',
          slot: targetSlot,
          stayOnDetails: Boolean(options?.stayOnDetails),
        };
        dispatch({ type: 'HOLD_ERROR', error: toHoldErrorState(result) });
        revealPanel();
        return;
      }
      lastFailedHoldRef.current = null;
      idempotencyKeyRef.current = buildIdempotencyKey(targetSlot.staffId);
      const stayOnDetails = Boolean(options?.stayOnDetails);
      const hasStaffChoice = !stayOnDetails && !skipsStaffForThisSlot;
      setChosenStaffId(
        stayOnDetails
          ? targetSlot.staffId
          : isPinned
            ? pinnedStaffId
            : hasStaffChoice
              ? 'any'
              : targetSlot.staffId,
      );
      setTakenStaffIds(new Set());
      setStaffError(null);
      dispatch({
        type: 'SELECT_SLOT_HOLD_ACQUIRED',
        slot: targetSlot,
        holdId: result.holdId,
        holdExpiresAt: result.holdExpiresAt,
        nextStep: stayOnDetails ? flow.step : skipsStaffForThisSlot ? 'details' : 'staff',
      });
      revealPanel();
    } finally {
      busyLockRef.current = false;
      setIsBusy(false);
      setPendingSlotKey(null);
    }
  };

  const handleReholdExpiredSlot = async () => {
    const expiredSlot = flow.selectedSlot;
    if (!expiredSlot || isReholding || busyLockRef.current) return;
    setIsReholding(true);
    try {
      await handleSelectSlot(expiredSlot, { stayOnDetails: true });
    } finally {
      setIsReholding(false);
    }
  };

  const handleExtendHold = async (): Promise<boolean> => {
    const slot = flow.selectedSlot;
    if (!slot || flow.holdExpired || isExtendingHold || busyLockRef.current) return false;
    setIsExtendingHold(true);
    try {
      const result = await holdSlot(slot, slot.staffId);
      if (result.kind === 'conflict') {
        lastFailedHoldRef.current = null;
        dispatch({ type: 'SLOT_CONFLICT', message: result.error, suggestions: result.suggestedSlots });
        revalidateActive();
        return false;
      }
      if (result.kind !== 'held') {
        lastFailedHoldRef.current = { kind: 'extend' };
        dispatch({ type: 'HOLD_ERROR', error: toHoldErrorState(result) });
        revealPanel();
        return false;
      }
      lastFailedHoldRef.current = null;
      dispatch({ type: 'HOLD_EXTENDED', holdId: result.holdId, holdExpiresAt: result.holdExpiresAt });
      return true;
    } finally {
      setIsExtendingHold(false);
    }
  };

  const handlePickStaff = async (staffId: string) => {
    const slot = flow.selectedSlot;
    if (!slot || isBusy || busyLockRef.current) return;
    setStaffError(null);
    const member = staff.find((item) => item.id === staffId);
    if (staffId === 'any' || !member || staffId === slot.staffId) {
      lastFailedHoldRef.current = null;
      setChosenStaffId(staffId);
      dispatch({ type: 'STAFF_ASSIGNED', slot, holdId: null, holdExpiresAt: null });
      return;
    }
    busyLockRef.current = true;
    setIsBusy(true);
    setPendingStaffId(staffId);
    try {
      const result = await holdSlot(slot, staffId);
      if (result.kind === 'conflict') {
        lastFailedHoldRef.current = null;
        setTakenStaffIds((prev) => new Set([...prev, staffId]));
        setStaffError(`${member.name} acaba de ocupar esa hora. Tu horario sigue apartado: elige otra opción.`);
        return;
      }
      if (result.kind !== 'held') {
        lastFailedHoldRef.current = { kind: 'staff', staffId };
        dispatch({ type: 'HOLD_ERROR', error: toHoldErrorState(result) });
        revealPanel();
        return;
      }
      lastFailedHoldRef.current = null;
      setChosenStaffId(staffId);
      dispatch({
        type: 'STAFF_ASSIGNED',
        slot: { ...slot, staffId, staffName: member.name },
        holdId: result.holdId,
        holdExpiresAt: result.holdExpiresAt,
      });
    } finally {
      busyLockRef.current = false;
      setIsBusy(false);
      setPendingStaffId(null);
    }
  };

  const handleRetryHold = async () => {
    const target = lastFailedHoldRef.current;
    if (!target) {
      dispatch({ type: 'DISMISS_HOLD_ERROR' });
      return;
    }
    if (target.kind === 'slot') {
      await handleSelectSlot(target.slot, { stayOnDetails: target.stayOnDetails });
      return;
    }
    if (target.kind === 'extend') {
      await handleExtendHold();
      return;
    }
    await handlePickStaff(target.staffId);
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

  const isSubmittingBooking = flow.phase === 'submitting' || flow.phase === 'confirmed';
  const salonTodayKey = todayKey;
  const contactInput = {
    name: client.clientName,
    phone: client.clientPhone,
    email: client.clientEmail,
    birthday: client.clientBirthday,
  };
  const fieldErrors = hasTriedSubmit ? validateClientBookingFields(contactInput, salonTodayKey) : EMPTY_FIELD_ERRORS;

  const hasSessionPhoneMismatch = Boolean(
    signedInPhoneE164 && !isPhoneMatchingSession(client.clientPhone, signedInPhoneE164),
  );

  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      submitLockRef.current ||
      isSubmittingBooking ||
      flow.holdExpired ||
      !selectedService ||
      !flow.selectedSlot
    ) {
      return;
    }
    setHasTriedSubmit(true);
    if (
      hasSessionPhoneMismatch ||
      hasClientFieldErrors(validateClientBookingFields(contactInput, salonTodayKey))
    ) {
      return;
    }
    if (!flow.privacyConsentAccepted) {
      dispatch({ type: 'CONSENT_REQUIRED_ERROR', message: 'Necesitamos tu aceptación para apartar la cita.' });
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = buildIdempotencyKey(flow.selectedSlot.staffId);
    }

    submitLockRef.current = true;
    dispatch({ type: 'START_SUBMIT' });

    try {
      const result = await submitBookingRequest(idempotencyKeyRef.current, {
        serviceId: selectedService.id,
        extraServiceIds: selectedExtraServices.map((srv) => srv.id),
        addonIds: activeSelectedAddons.map((a) => a.id),
        staffId: flow.selectedSlot.staffId,
        startAt: flow.selectedSlot.startAt,
        clientName: client.clientName,
        clientPhone: normalizePhoneE164(client.clientPhone),
        clientInstagram: client.clientInstagram.trim() || null,
        clientEmail: client.clientEmail.trim() || null,
        clientBirthday: birthdayInputToIso(client.clientBirthday, salonTodayKey),
        clientNotes: client.clientNotes,
        inspoPhotoUrl: client.inspoDataUrl,
        paymentProofUrl: null,
        proofDeliveryMethod: 'none',
        couponCode: appliedCoupon?.code || null,
        holdId: flow.holdId ?? undefined,
        privacyConsentAccepted: true,
        marketingOptIn: flow.marketingOptIn,
        waitlistOfferToken: waitlistOfferToken?.trim() || undefined,
      });

      if (result.kind === 'conflict') {
        submitLockRef.current = false;
        dispatch({ type: 'SLOT_CONFLICT', message: result.error, suggestions: result.suggestedSlots });
        revealPanel();
        revalidateActive();
        return;
      }
      if (result.kind === 'error') {
        submitLockRef.current = false;
        dispatch({
          type: 'SUBMIT_FAILED',
          error: result.error,
          code: result.code ?? null,
          activeBookings: result.activeBookings,
        });
        revealPanel();
        return;
      }
      const matchedStaff = staff.find((member) => member.id === flow.selectedSlot?.staffId) ?? null;
      onBookingConfirmed?.({
        serviceSlug: selectedService.slug,
        serviceName: selectedService.name,
        staffSlug: matchedStaff ? (matchedStaff.bookingSlug || matchedStaff.id) : null,
        staffName: matchedStaff?.name ?? flow.selectedSlot.staffName ?? null,
      });
      dispatch({ type: 'SUBMIT_CONFIRMED', manageUrl: result.manageUrl });
      navigateToManageUrl(result.manageUrl);
    } catch {
      submitLockRef.current = false;
      dispatch({ type: 'SUBMIT_FAILED', error: 'Error de conexión. Intenta nuevamente.' });
    }
  };

  return {
    chosenStaffId,
    takenStaffIds,
    staffError,
    isBusy,
    pendingSlotKey,
    pendingStaffId,
    isReholding,
    isExtendingHold,
    isSubmittingBooking,
    fieldErrors,
    couponInput,
    setCouponInput,
    appliedCoupon,
    couponError,
    couponLoading,
    revealPanel,
    goToStep,
    resetSelection,
    handleSelectSlot,
    handleReholdExpiredSlot,
    handleExtendHold,
    handlePickStaff,
    handleRetryHold,
    handleApplyCoupon,
    handleRemoveCoupon,
    handleConfirmBooking,
  };
}

interface UseInitialSlotAutoHoldInput {
  initialSlot?: string;
  preferredDate: string;
  pinnedStaffId: string;
  availabilityDays: readonly DayAvailabilitySummary[];
  loadingAvail: boolean;
  availabilityError: string | null;
  hasSelectedSlot: boolean;
  isBusy: boolean;
  waitlistOfferToken?: string | null;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: AvailableSlot) => Promise<void>;
  onSlotUnavailable: (message: string, suggestions: AvailableSlot[]) => void;
}

export function useInitialSlotAutoHold({
  initialSlot,
  preferredDate,
  pinnedStaffId,
  availabilityDays,
  loadingAvail,
  availabilityError,
  hasSelectedSlot,
  isBusy,
  waitlistOfferToken = null,
  onSelectDate,
  onSelectSlot,
  onSlotUnavailable,
}: UseInitialSlotAutoHoldInput): void {
  const targetSlot = initialSlot?.trim() ?? '';
  const handledRef = useRef(!targetSlot);
  const callbacksRef = useRef({ onSelectDate, onSelectSlot, onSlotUnavailable });

  useEffect(() => {
    callbacksRef.current = { onSelectDate, onSelectSlot, onSlotUnavailable };
  }, [onSelectDate, onSelectSlot, onSlotUnavailable]);

  useEffect(() => {
    if (handledRef.current || !targetSlot) return;
    if (hasSelectedSlot) {
      handledRef.current = true;
      return;
    }
    if (loadingAvail || availabilityError || availabilityDays.length === 0 || isBusy) {
      return;
    }
    handledRef.current = true;
    const matched = findMatchingSlotInAvailability({
      days: availabilityDays,
      targetSlot,
      preferredDate,
      preferredStaffId: pinnedStaffId,
    });
    if (matched) {
      if (matched.date !== preferredDate) {
        callbacksRef.current.onSelectDate(matched.date);
      }
      void callbacksRef.current.onSelectSlot(matched.slot);
      return;
    }
    const suggestions = findAlternativeSlotsForDate(availabilityDays, preferredDate, 3);
    const message = waitlistOfferToken
      ? 'El horario de tu enlace prioritario ya no está disponible o venció. Elige otro horario disponible:'
      : 'El horario del enlace ya no está disponible. Elige uno de los horarios disponibles más cercanos:';
    callbacksRef.current.onSlotUnavailable(message, suggestions);
  }, [
    targetSlot,
    preferredDate,
    pinnedStaffId,
    availabilityDays,
    loadingAvail,
    availabilityError,
    hasSelectedSlot,
    isBusy,
    waitlistOfferToken,
  ]);
}
