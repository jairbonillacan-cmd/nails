'use client';

import { useState } from 'react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  ADMIN_CACHE_KEYS,
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
  revalidateBookings: () => Promise<void>;
}

export function useCitasBookingActions({
  data,
  hasActiveOwnerPin,
  refresh,
  revalidateBookings,
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

    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      applyOptimisticBookingStatus(current ?? prevOverview, bookingId, status),
    );
    mutateAdminCache<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
      (current) =>
        applyOptimisticBookingStatusToList(current ?? prevBookings, bookingId, status),
    );

    setBusyAction({ bookingId, status });
    setFeedback(null);
    if (ownerPin) {
      setPinSubmitting(true);
      setPinError(null);
    }

    const rollbackOptimistic = () => {
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        prevBookings,
      );
    };

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ownerPin) headers['x-owner-pin'] = ownerPin;
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          bookingId,
          status,
          ...(ownerPin ? { ownerPin } : {}),
        }),
      });
      if (res.ok) {
        setPendingCancelBookingId(null);
        setPinError(null);
        invalidateAdminCache('/api/admin/reports');
        inlineNotice.show(`Estado: ${BOOKING_STATUS_BADGE[status].label}`);
        void refresh();
        void revalidateBookings();
        return true;
      }

      rollbackOptimistic();
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
    } catch {
      rollbackOptimistic();
      setFeedback({
        status: 'error',
        title: 'Error de conexión al actualizar la cita.',
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
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
        await refresh();
      } else {
        setFeedback({
          status: 'error',
          title: json?.error || 'No se pudo enviar el recordatorio.',
        });
      }
    } finally {
      setRemindingId(null);
    }
  };

  const requestReschedule = async (bookingId: string) => {
    if (requestingRescheduleId === bookingId) return;
    setRequestingRescheduleId(bookingId);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
        await refresh();
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
    } finally {
      setRequestingRescheduleId(null);
    }
  };

  return {
    feedback,
    setFeedback,
    busyAction,
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
    sendReminder,
    requestReschedule,
  };
}
