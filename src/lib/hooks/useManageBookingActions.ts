'use client';

import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { checkManagePolicyWindow } from '@/lib/availability/policy';
import { getDateKeyInTimezone } from '@/lib/format';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import {
  CANCELLATION_REASON_OPTIONS,
  RESCHEDULE_REASON_OPTIONS,
} from '@/lib/notifications/cascade';
import type { PublicLoyaltySummaryDTO, PublicSettingsDTO } from '@/lib/public-dto';
import {
  computeManagePoliciesAndUrls,
  fetchManageBookingSnapshot,
  fetchRescheduleAvailability,
  patchManageBooking,
  postManageBookingReview,
  resolveInitialNowMs,
  resolveNextReasonText,
  type ManageBookingPayload,
} from '@/components/cita/citaApi';
import type { CalendarAddLinks, PublicManageBooking } from '@/components/cita/types';

interface UseManageBookingActionsInput {
  initialBooking: PublicManageBooking;
  settings: PublicSettingsDTO;
  initialCalendarLinks: CalendarAddLinks;
  initialWhatsappUrl: string;
  initialManageUrl?: string;
  initialLoyaltySummary?: PublicLoyaltySummaryDTO | null;
  initialAction?: 'reschedule' | 'cancel' | 'confirm';
  renderedAtIso?: string;
}

export function useManageBookingActions({
  initialBooking,
  settings,
  initialCalendarLinks,
  initialWhatsappUrl,
  initialManageUrl,
  initialLoyaltySummary = null,
  initialAction,
  renderedAtIso,
}: UseManageBookingActionsInput) {
  const [booking, setBooking] = useState<PublicManageBooking>(initialBooking);
  const [calendarLinks, setCalendarLinks] = useState<CalendarAddLinks>(initialCalendarLinks);
  const [whatsappUrl, setWhatsappUrl] = useState(initialWhatsappUrl);
  const [manageUrl, setManageUrl] = useState(initialManageUrl || `/cita/${initialBooking.manageToken}`);
  const [loyaltySummary, setLoyaltySummary] = useState<PublicLoyaltySummaryDTO | null>(initialLoyaltySummary);
  const [nowMs, setNowMs] = useState<number>(() => resolveInitialNowMs(renderedAtIso, initialBooking.updatedAt));

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [conflictSlots, setConflictSlots] = useState<AvailableSlot[]>([]);
  const [submittingSlotStartAt, setSubmittingSlotStartAt] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const proofLockRef = useRef(false);
  const proofSavedFeedback = useEphemeralMessage(4200);

  const initialCanModify = !['canceled', 'completed', 'no_show'].includes(initialBooking.status);
  const [cancelOpen, setCancelOpen] = useState(initialAction === 'cancel' && initialCanModify);
  const [cancelReasonChoice, setCancelReasonChoice] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [confirmingAttendance, setConfirmingAttendance] = useState(false);
  const autoConfirmDoneRef = useRef(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(initialAction === 'reschedule' && initialCanModify);
  const [rescheduleReasonChoice, setRescheduleReasonChoice] = useState<string | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleDays, setRescheduleDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(initialAction === 'reschedule' && initialCanModify);

  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(initialBooking.review?.rating ?? 5);
  const [reviewComment, setReviewComment] = useState(initialBooking.review?.comment ?? '');
  const [reviewSaved, setReviewSaved] = useState(Boolean(initialBooking.review));
  const [hasExistingReview, setHasExistingReview] = useState(Boolean(initialBooking.review));

  const tz = settings.timezone || 'America/Mexico_City';
  const canModify = !['canceled', 'completed', 'no_show'].includes(booking.status);
  const { reschedulePolicy, cancelPolicy, policyHelpWhatsappUrl, touchUpUrl } =
    computeManagePoliciesAndUrls({ booking, settings, nowMs, tz, whatsappUrl });

  const applyPayload = useCallback((data: ManageBookingPayload) => {
    if (data.booking) setBooking(data.booking);
    if (data.calendarLinks) setCalendarLinks(data.calendarLinks);
    if (data.whatsappUrl) setWhatsappUrl(data.whatsappUrl);
    if (data.manageUrl) setManageUrl(data.manageUrl);
    if ('loyaltySummary' in data) setLoyaltySummary(data.loyaltySummary ?? null);
  }, []);

  const clearActionError = () => {
    setActionError(null);
    setActionErrorCode(null);
  };

  const runLocked = async (fn: () => Promise<void>) => {
    if (actionLockRef.current || busy) return;
    actionLockRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      actionLockRef.current = false;
    }
  };

  const syncManageState = useCallback(
    async (signal: AbortSignal) => {
      setNowMs(Date.now());
      try {
        const data = await fetchManageBookingSnapshot(initialBooking.manageToken, signal);
        if (data && !signal.aborted) applyPayload(data);
      } catch {
        return;
      }
    },
    [applyPayload, initialBooking.manageToken],
  );
  useExternalSync(initialBooking.manageToken, syncManageState);

  const extraServiceIdsKey = (booking.extraServiceIds ?? []).join(',');
  const addonIdsKey = booking.addons.map((a) => a.addonId).join(',');

  const loadRescheduleSlots = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingSlots(true);
      try {
        const days = await fetchRescheduleAvailability({
          serviceId: booking.serviceId,
          extraServiceIdsKey,
          addonIdsKey,
          staffId: booking.staffId,
          startDate: getDateKeyInTimezone(new Date(), tz),
          manageToken: booking.manageToken,
          signal,
        });
        if (!signal?.aborted) setRescheduleDays(days);
      } catch {
        return;
      } finally {
        if (!signal?.aborted) setLoadingSlots(false);
      }
    },
    [addonIdsKey, booking.manageToken, booking.serviceId, booking.staffId, extraServiceIdsKey, tz],
  );

  const syncRescheduleSlots = useCallback(
    async (signal: AbortSignal) => {
      if (!rescheduleOpen || !canModify || !reschedulePolicy.allowed) {
        setLoadingSlots(false);
        return;
      }
      await loadRescheduleSlots(signal);
    },
    [canModify, loadRescheduleSlots, rescheduleOpen, reschedulePolicy.allowed],
  );

  useExternalSync(
    rescheduleOpen && canModify && reschedulePolicy.allowed
      ? `reschedule:${booking.id}:${booking.serviceId}:${extraServiceIdsKey}:${addonIdsKey}:${booking.staffId}`
      : 'reschedule:closed',
    syncRescheduleSlots,
  );

  const handleConfirmAttendance = useCallback(async (): Promise<boolean> => {
    if (confirmingAttendance) return false;
    setConfirmingAttendance(true);
    setActionError(null);
    setActionErrorCode(null);
    try {
      const res = await patchManageBooking(booking.manageToken, {
        action: 'confirm_attendance',
      });
      if (!res.ok) {
        setActionError(res.data.error || 'No se pudo confirmar tu asistencia.');
        return false;
      }
      applyPayload(res.data);
      setActionSuccess('¡Listo! Confirmamos tu asistencia. Te esperamos en el estudio.');
      return true;
    } catch {
      setActionError('Error de conexión al confirmar tu asistencia. Intenta de nuevo.');
      return false;
    } finally {
      setConfirmingAttendance(false);
    }
  }, [applyPayload, booking.manageToken, confirmingAttendance]);

  const syncAutoConfirm = useCallback(
    async (signal: AbortSignal) => {
      if (
        initialAction !== 'confirm' ||
        !initialCanModify ||
        initialBooking.attendanceStatus === 'confirmed' ||
        autoConfirmDoneRef.current
      ) {
        return;
      }
      autoConfirmDoneRef.current = true;
      if (signal.aborted) return;
      await handleConfirmAttendance();
    },
    [
      handleConfirmAttendance,
      initialAction,
      initialBooking.attendanceStatus,
      initialCanModify,
    ],
  );
  useExternalSync(
    initialAction === 'confirm' ? `confirm:${initialBooking.manageToken}` : 'confirm:none',
    syncAutoConfirm,
  );

  const openReschedule = () => {
    const freshNow = Date.now();
    setNowMs(freshNow);
    clearActionError();
    setConflictSlots([]);
    const allowedNow = checkManagePolicyWindow({
      startAtIso: booking.startAt,
      nowMs: freshNow,
      minHours: settings.minRescheduleHours,
      action: 'reschedule',
    }).allowed;
    setLoadingSlots(allowedNow);
    setRescheduleOpen(true);
  };

  const openCancel = () => {
    setNowMs(Date.now());
    clearActionError();
    setCancelOpen(true);
  };

  const handleUploadProof = async (dataUrl: string): Promise<boolean> => {
    if (proofLockRef.current || uploadingProof) return false;
    proofLockRef.current = true;
    setUploadingProof(true);
    clearActionError();
    try {
      const res = await patchManageBooking(booking.manageToken, {
        action: 'upload_proof',
        paymentProofUrl: dataUrl,
      });
      if (!res.ok) {
        setActionError(res.data.error || 'No se pudo subir el comprobante.');
        return false;
      }
      applyPayload(res.data);
      proofSavedFeedback.show('Comprobante guardado ✓');
      setActionSuccess('Recibimos tu comprobante. Te confirmamos por WhatsApp cuando lo revisemos.');
      return true;
    } catch {
      setActionError('Error de conexión al subir el comprobante. Intenta de nuevo.');
      return false;
    } finally {
      setUploadingProof(false);
      proofLockRef.current = false;
    }
  };

  const handleConfirmReschedule = async (slot: AvailableSlot) => {
    await runLocked(async () => {
      setSubmittingSlotStartAt(slot.startAt);
      clearActionError();
      try {
        const res = await patchManageBooking(booking.manageToken, {
          action: 'reschedule',
          newStartAt: slot.startAt,
          newStaffId: slot.staffId,
          reason: rescheduleReason.trim() || undefined,
        });
        if (!res.ok) {
          if (res.status === 409 || res.data.code === 'SLOT_TAKEN') {
            setActionErrorCode('SLOT_TAKEN');
            setActionError(
              res.data.error ||
                'Ese horario acaba de ocuparse. Elige una de las alternativas cercanas disponibles.',
            );
            setConflictSlots(
              Array.isArray(res.data.suggestedSlots) ? res.data.suggestedSlots.slice(0, 4) : [],
            );
            void loadRescheduleSlots();
            return;
          }
          if (res.data.code === 'POLICY_WINDOW') {
            setNowMs(Date.now());
            setActionErrorCode('POLICY_WINDOW');
          }
          setActionError(res.data.error || 'No se pudo reagendar.');
          return;
        }
        applyPayload(res.data);
        setNowMs(Date.now());
        setConflictSlots([]);
        setRescheduleReasonChoice(null);
        setRescheduleReason('');
        setRescheduleOpen(false);
        setActionSuccess(
          'Cambiamos tu cita. El calendario y el link de WhatsApp ya tienen la nueva hora.',
        );
      } catch {
        setActionError('Error de conexión al reagendar. Intenta nuevamente.');
      } finally {
        setSubmittingSlotStartAt(null);
      }
    });
  };

  const handleConfirmCancel = async () => {
    await runLocked(async () => {
      clearActionError();
      try {
        const res = await patchManageBooking(booking.manageToken, {
          action: 'cancel',
          reason: cancelReason.trim() || undefined,
        });
        if (!res.ok) {
          if (res.data.code === 'POLICY_WINDOW') {
            setNowMs(Date.now());
            setActionErrorCode('POLICY_WINDOW');
          }
          setActionError(res.data.error || 'No se pudo cancelar la cita.');
          return;
        }
        applyPayload(res.data);
        setCancelOpen(false);
        setCancelReasonChoice(null);
        setCancelReason('');
        setActionSuccess(
          booking.couponCode
            ? `Cita cancelada correctamente. El horario quedó libre y tu código ${booking.couponCode} fue liberado.`
            : 'Cita cancelada correctamente. El espacio se liberó al instante.',
        );
      } catch {
        setActionError('Error de conexión al cancelar la cita. Intenta nuevamente.');
      }
    });
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    await runLocked(async () => {
      setReviewError(null);
      try {
        const res = await postManageBookingReview(booking.manageToken, rating, reviewComment);
        if (!res.ok) {
          setReviewError(res.error || 'No se pudo guardar tu calificación. Intenta de nuevo.');
          return;
        }
        setReviewSaved(true);
        setHasExistingReview(true);
      } catch {
        setReviewError('Error de conexión al guardar tu calificación. Intenta de nuevo.');
      }
    });
  };

  return {
    tz, booking, calendarLinks, whatsappUrl, manageUrl, loyaltySummary,
    canModify, reschedulePolicy, cancelPolicy, policyHelpWhatsappUrl, touchUpUrl,
    actionError, actionErrorCode, actionSuccess, reviewError, conflictSlots,
    submittingSlotStartAt, proofSavedMessage: proofSavedFeedback.message,
    cancelOpen, cancelReasonChoice, cancelReason, busy, uploadingProof, confirmingAttendance,
    rescheduleOpen, rescheduleReasonChoice, rescheduleReason, rescheduleDays, loadingSlots,
    rating, reviewComment, reviewSaved, hasExistingReview,
    setRating, setReviewComment, setCancelReason, setRescheduleReason,
    openReschedule, openCancel, handleConfirmAttendance, handleUploadProof, handleConfirmReschedule,
    handleConfirmCancel, handleSubmitReview,
    handleSelectCancelChip: (option: string) => {
      setCancelReasonChoice(option);
      setCancelReason(resolveNextReasonText(option, cancelReason, CANCELLATION_REASON_OPTIONS));
    },
    handleSelectRescheduleChip: (option: string) => {
      setRescheduleReasonChoice(option);
      setRescheduleReason(resolveNextReasonText(option, rescheduleReason, RESCHEDULE_REASON_OPTIONS));
    },
    dismissActionSuccess: () => setActionSuccess(null),
    dismissActionError: clearActionError,
    startEditReview: () => {
      setReviewError(null);
      setReviewSaved(false);
    },
    cancelEditReview: () => {
      setReviewError(null);
      setReviewSaved(true);
    },
    handleRescheduleOpenChange: (open: boolean) => {
      if (!open) {
        clearActionError();
        setConflictSlots([]);
      }
      setRescheduleOpen(open);
    },
    handleCancelOpenChange: (open: boolean) => {
      if (!open) clearActionError();
      setCancelOpen(open);
    },
  };
}
