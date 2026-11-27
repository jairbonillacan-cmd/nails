'use client';

import { useState } from 'react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  ADMIN_CACHE_KEYS,
  applyOptimisticBookingReschedule,
  applyOptimisticBookingRescheduleToList,
  applyOptimisticBookingStatus,
  applyOptimisticBookingStatusToList,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  mutateAdminCache,
} from '@/lib/hooks/useAdminCache';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { BookingStatus, BookingWithRelations } from '@/lib/types';
import { BOOKING_STATUS_BADGE } from './BookingCard';

const ADMIN_MUTATION_TIMEOUT_MS = 20_000;

function isTimeoutOrAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

export interface CitasFeedbackState {
  status: 'success' | 'error';
  title: string;
  description?: string;
  waMeUrl?: string;
  rescheduleUrl?: string;
}

interface UseCitasBookingActionsParams {
  data: AdminOverviewPayload | null;
  hasActiveOwnerPin: boolean;
  refresh: () => Promise<void>;
}

export function useCitasBookingActions({
  data,
  hasActiveOwnerPin,
  refresh,
}: UseCitasBookingActionsParams) {
  const [feedback, setFeedback] = useState<CitasFeedbackState | null>(null);
  const [busyAction, setBusyAction] = useState<{
    bookingId: string;
    status: BookingStatus;
  } | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [requestingRescheduleId, setRequestingRescheduleId] = useState<string | null>(null);
  const [pendingCancelBookingId, setPendingCancelBookingId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const inlineNotice = useEphemeralMessage(3200);
  const rescheduleCopy = useCopyToClipboard(2500);

  const updateStatus = async (
    bookingId: string,
    status: BookingStatus,
    ownerPin?: string,
  ): Promise<boolean> => {
    if (!data || busyAction?.bookingId === bookingId) return false;
    if (status === 'canceled' && !ownerPin && hasActiveOwnerPin) {
      setPendingCancelBookingId(bookingId);
      setPinError(null);
      return false;
    }

    const prevOverview =
      getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) ?? data;
    const prevBookings =
      getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
      ) ?? { bookings: data.bookings };

    setBusyAction({ bookingId, status });
    setFeedback(null);
    if (ownerPin) {
      setPinSubmitting(true);
      setPinError(null);
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ownerPin) headers['x-owner-pin'] = ownerPin;
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers,
        signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
        body: JSON.stringify({
          bookingId,
          status,
          ...(ownerPin ? { ownerPin } : {}),
        }),
      });
      if (res.ok) {
        mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
          applyOptimisticBookingStatus(current ?? prevOverview, bookingId, status),
        );
        mutateAdminCache<{ bookings: BookingWithRelations[] }>(
          ADMIN_CACHE_KEYS.bookings,
          (current) =>
            applyOptimisticBookingStatusToList(current ?? prevBookings, bookingId, status),
        );
        setPendingCancelBookingId(null);
        setPinError(null);
        invalidateAdminCache('/api/admin/reports');
        inlineNotice.show(`Estado: ${BOOKING_STATUS_BADGE[status].label}`);
        void refresh();
        return true;
      }

      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      if (
        res.status === 403 &&
        (json?.code === 'OWNER_PIN_REQUIRED' || json?.code === 'OWNER_PIN_INVALID')
      ) {
        setPendingCancelBookingId(bookingId);
        setPinError(
          json.code === 'OWNER_PIN_INVALID'
            ? json.error || 'PIN de autorización incorrecto.'
            : null,
        );
        return false;
      }
      setFeedback({
        status: 'error',
        title:
          res.status === 403 && json?.code === 'PAST_BOOKING_LOCKED'
            ? json.error ||
              'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.'
            : json?.error || 'No se pudo actualizar el estado de la cita.',
      });
      return false;
    } catch (err) {
      setFeedback({
        status: 'error',
        title: isTimeoutOrAbortError(err)
          ? 'La actualización tardó demasiado. Intenta de nuevo en unos segundos.'
          : 'Error de conexión al actualizar la cita.',
      });
      return false;
    } finally {
      setBusyAction(null);
      if (ownerPin) setPinSubmitting(false);
    }
  };

  const sendReminder = async (bookingId: string) => {
    if (remindingId === bookingId) return;
    setRemindingId(bookingId);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
        body: JSON.stringify({
          action: 'send_reminder',
          bookingId,
          channel: 'whatsapp',
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        waMeUrl?: string;
        messagePreview?: string;
      } | null;
      if (res.ok) {
        setFeedback({
          status: 'success',
          title: 'Recordatorio listo para enviar por WhatsApp.',
          description: json?.messagePreview,
          waMeUrl: json?.waMeUrl,
        });
        void refresh();
      } else {
        setFeedback({
          status: 'error',
          title: json?.error || 'No se pudo enviar el recordatorio.',
        });
      }
    } catch (err) {
      setFeedback({
        status: 'error',
        title: isTimeoutOrAbortError(err)
          ? 'El recordatorio tardó demasiado. Intenta de nuevo.'
          : 'Error de conexión al enviar el recordatorio.',
      });
    } finally {
      setRemindingId(null);
    }
  };

  const requestReschedule = async (bookingId: string) => {
    if (requestingRescheduleId === bookingId) return;
    setRequestingRescheduleId(bookingId);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
        body: JSON.stringify({
          action: 'request_reschedule',
          bookingId,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        waMeUrl?: string;
        rescheduleUrl?: string;
        messagePreview?: string;
      } | null;
      if (res.ok) {
        setFeedback({
          status: 'success',
          title: 'Enlace para reagendar listo para enviar a la clienta.',
          description: json?.messagePreview,
          waMeUrl: json?.waMeUrl,
          rescheduleUrl: json?.rescheduleUrl,
        });
        void refresh();
      } else {
        setFeedback({
          status: 'error',
          title:
            res.status === 403 && json?.code === 'PAST_BOOKING_LOCKED'
              ? json.error ||
                'Las citas pasadas están bloqueadas; solo la Dueña puede modificarlas.'
              : json?.error || 'No se pudo generar el enlace para reagendar.',
        });
      }
    } catch (err) {
      setFeedback({
        status: 'error',
        title: isTimeoutOrAbortError(err)
          ? 'La solicitud tardó demasiado. Intenta de nuevo.'
          : 'Error de conexión al generar el enlace para reagendar.',
      });
    } finally {
      setRequestingRescheduleId(null);
    }
  };

  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rejectingDepositId, setRejectingDepositId] = useState<string | null>(null);

  const rejectDeposit = async (
    bookingId: string,
    bookingCode: string,
    reason?: string,
  ): Promise<boolean> => {
    if (!data || rejectingDepositId === bookingId) return false;
    setRejectingDepositId(bookingId);
    setFeedback(null);
    try {
      const cleanReason = reason?.trim();
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
        body: JSON.stringify({
          action: 'reject_deposit',
          bookingId,
          ...(cleanReason ? { reason: cleanReason } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setFeedback({
          status: 'error',
          title: json?.error || 'No se pudo rechazar el comprobante.',
        });
        return false;
      }
      invalidateAdminCache('/api/admin/reports');
      inlineNotice.show(`Comprobante ${bookingCode} rechazado`);
      void refresh();
      return true;
    } catch (err) {
      setFeedback({
        status: 'error',
        title: isTimeoutOrAbortError(err)
          ? 'El rechazo del comprobante tardó demasiado. Intenta de nuevo.'
          : 'Sin conexión. No se pudo rechazar el comprobante.',
      });
      return false;
    } finally {
      setRejectingDepositId(null);
    }
  };

  const rescheduleAdmin = async (params: {
    bookingId: string;
    startAt: string;
    staffId: string;
    durationMinutes: number;
    summaryLabel: string;
  }): Promise<boolean> => {
    if (!data || reschedulingId === params.bookingId) return false;

    const prevOverview =
      getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) ?? data;
    const prevBookings =
      getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
      ) ?? { bookings: data.bookings };

    const endAtIso = new Date(
      Date.parse(params.startAt) + params.durationMinutes * 60_000,
    ).toISOString();
    const staffName = data.staff.find((s) => s.id === params.staffId)?.name;

    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      applyOptimisticBookingReschedule(current ?? prevOverview, {
        bookingId: params.bookingId,
        startAt: params.startAt,
        endAt: endAtIso,
        staffId: params.staffId,
        durationMinutes: params.durationMinutes,
      }),
    );
    mutateAdminCache<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
      (current) =>
        applyOptimisticBookingRescheduleToList(current ?? prevBookings, {
          bookingId: params.bookingId,
          startAt: params.startAt,
          endAt: endAtIso,
          staffId: params.staffId,
          staffName,
          durationMinutes: params.durationMinutes,
        }),
    );

    setReschedulingId(params.bookingId);
    setFeedback(null);

    const rollback = () => {
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        prevBookings,
      );
    };

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS),
        body: JSON.stringify({
          action: 'reschedule_admin',
          bookingId: params.bookingId,
          startAt: params.startAt,
          staffId: params.staffId,
          durationMinutes: params.durationMinutes,
        }),
      });
      if (res.ok) {
        invalidateAdminCache('/api/admin/reports');
        inlineNotice.show(params.summaryLabel);
        void refresh();
        return true;
      }
      rollback();
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      setFeedback({
        status: 'error',
        title: json?.error || 'No se pudo mover o ajustar la cita.',
      });
      return false;
    } catch (err) {
      rollback();
      setFeedback({
        status: 'error',
        title: isTimeoutOrAbortError(err)
          ? 'El cambio de horario tardó demasiado. Intenta de nuevo.'
          : 'Error de conexión al mover la cita.',
      });
      return false;
    } finally {
      setReschedulingId(null);
    }
  };

  return {
    feedback,
    setFeedback,
    busyAction,
    reschedulingId,
    rejectingDepositId,
    remindingId,
    requestingRescheduleId,
    pendingCancelBookingId,
    setPendingCancelBookingId,
    pinError,
    setPinError,
    pinSubmitting,
    inlineNotice,
    rescheduleCopy,
    updateStatus,
    rejectDeposit,
    rescheduleAdmin,
    sendReminder,
    requestReschedule,
  };
}
