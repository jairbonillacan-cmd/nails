'use client';

import type React from 'react';
import { useRef, useState } from 'react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { normalizePhoneE164 } from '@/lib/format';
import { getOrCreateBrowserSessionToken } from '@/lib/hooks/useSessionToken';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import {
  requestSlotHold,
  submitBookingRequest,
  validateCouponCode,
  type AppliedCouponState,
} from '@/components/booking/bookingApi';
import {
  prefersReducedMotion,
  validateClientBookingFields,
  type ClientFieldErrors,
  type ProofDeliveryMethod,
} from '@/components/booking/bookingHelpers';
import type {
  BookingFlowAction,
  BookingFlowState,
  BookingStep,
} from '@/components/booking/bookingMachine';
import { buildIdempotencyKey } from '@/components/booking/bookingViewHelpers';

const EMPTY_FIELD_ERRORS: ClientFieldErrors = { name: null, phone: null };

interface ClientFormValues {
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  clientNotes: string;
  inspoDataUrl: string | null;
  proofDeliveryMethod: ProofDeliveryMethod;
  proofDataUrl: string | null;
}

interface UseBookingFlowActionsInput {
  flow: BookingFlowState;
  dispatch: React.Dispatch<BookingFlowAction>;
  settings: PublicSettingsDTO;
  staff: PublicStaffDTO[];
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  hasExtrasOptions: boolean;
  isPinned: boolean;
  pinnedStaffId: string;
  skipsStaffStep: boolean;
  subtotalCents: number;
  showsDeposit: boolean;
  client: ClientFormValues;
  revalidateActive: () => void;
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
  hasExtrasOptions,
  isPinned,
  pinnedStaffId,
  skipsStaffStep,
  subtotalCents,
  showsDeposit,
  client,
  revalidateActive,
  navigateToManageUrl,
}: UseBookingFlowActionsInput) {
  const [chosenStaffId, setChosenStaffId] = useState('any');
  const [takenStaffIds, setTakenStaffIds] = useState<ReadonlySet<string>>(() => new Set());
  const [staffError, setStaffError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingSlotKey, setPendingSlotKey] = useState<string | null>(null);
  const [pendingStaffId, setPendingStaffId] = useState<string | null>(null);
  const [isReholding, setIsReholding] = useState(false);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCouponState | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  const idempotencyKeyRef = useRef('');
  const busyLockRef = useRef(false);
  const submitLockRef = useRef(false);

  const revealPanel = () => {
    if (typeof window !== 'undefined' && window.scrollY > 0) {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    }
  };

  const goToStep = (nextStep: BookingStep) => {
    if (nextStep === 'extras' && !hasExtrasOptions) {
      dispatch({ type: 'GO_TO_STEP', step: flow.step === 'service' ? 'schedule' : 'service' });
      revealPanel();
      return;
    }
    dispatch({ type: 'GO_TO_STEP', step: nextStep });
    revealPanel();
  };

  const resetSelection = () => {
    if (flow.holdId) void fetch('/api/slot-holds', { method: 'DELETE' });
    setAppliedCoupon(null);
    setCouponError(null);
    dispatch({ type: 'SELECTION_CHANGED' });
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

  const handleSelectSlot = async (
    slot: AvailableSlot,
    options?: { stayOnDetails?: boolean },
  ) => {
    if (!selectedService || isBusy || busyLockRef.current) return;
    const slotKey = `${slot.staffId}-${slot.startAt}`;
    busyLockRef.current = true;
    setIsBusy(true);
    setPendingSlotKey(slotKey);
    try {
      const result = await holdSlot(slot, slot.staffId);
      if (!result.ok) {
        dispatch({ type: 'SLOT_CONFLICT', message: result.error, suggestions: result.suggestedSlots });
        revealPanel();
        revalidateActive();
        return;
      }
      idempotencyKeyRef.current = buildIdempotencyKey(slot.staffId);
      const stayOnDetails = Boolean(options?.stayOnDetails);
      const hasStaffChoice = !stayOnDetails && !skipsStaffStep && slot.availableStaffIds.length > 1;
      setChosenStaffId(
        stayOnDetails
          ? slot.staffId
          : isPinned
            ? pinnedStaffId
            : hasStaffChoice
              ? 'any'
              : slot.staffId,
      );
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

  const handlePickStaff = async (staffId: string) => {
    const slot = flow.selectedSlot;
    if (!slot || isBusy || busyLockRef.current) return;
    setStaffError(null);
    const member = staff.find((item) => item.id === staffId);
    if (staffId === 'any' || !member || staffId === slot.staffId) {
      setChosenStaffId(staffId);
      dispatch({ type: 'STAFF_ASSIGNED', slot, holdId: null, holdExpiresAt: null });
      revealPanel();
      return;
    }
    busyLockRef.current = true;
    setIsBusy(true);
    setPendingStaffId(staffId);
    try {
      const result = await holdSlot(slot, staffId);
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
    } finally {
      busyLockRef.current = false;
      setIsBusy(false);
      setPendingStaffId(null);
    }
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
  const fieldErrors = hasTriedSubmit
    ? validateClientBookingFields(client.clientName, client.clientPhone)
    : EMPTY_FIELD_ERRORS;

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
    const errors = validateClientBookingFields(client.clientName, client.clientPhone);
    if (errors.name || errors.phone) {
      dispatch({ type: 'SUBMIT_FAILED', error: errors.name ?? errors.phone ?? '' });
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
    const effectiveProofMethod: ProofDeliveryMethod = !showsDeposit
      ? 'none'
      : client.proofDeliveryMethod === 'instagram_dm'
        ? 'instagram_dm'
        : client.proofDataUrl
          ? 'web_upload'
          : 'none';

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
        clientEmail: client.clientEmail || null,
        clientBirthday: client.clientBirthday || null,
        clientNotes: client.clientNotes,
        inspoPhotoUrl: client.inspoDataUrl,
        paymentProofUrl: effectiveProofMethod === 'web_upload' ? client.proofDataUrl : null,
        proofDeliveryMethod: effectiveProofMethod,
        couponCode: appliedCoupon?.code || null,
        holdId: flow.holdId ?? undefined,
        sessionToken: getOrCreateBrowserSessionToken('nails_session_tok'),
        privacyConsentAccepted: true,
        marketingOptIn: flow.marketingOptIn,
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
    handlePickStaff,
    handleApplyCoupon,
    handleRemoveCoupon,
    handleConfirmBooking,
  };
}
