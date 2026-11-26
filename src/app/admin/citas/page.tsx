'use client';

import React, { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Copy,
  List as ListIcon,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import { OwnerPinDialog } from '@/components/admin/config/OwnerPinDialog';
import {
  BOOKING_STATUS_BADGE,
  BookingCard,
} from '@/components/admin/citas/BookingCard';
import { BookingQuickPopover } from '@/components/admin/citas/BookingQuickPopover';
import type { NewBookingPrefill } from '@/components/admin/citas/NewBookingDialog';
import { VisualScheduleGrid } from '@/components/admin/citas/VisualScheduleGrid';
import {
  ADMIN_CACHE_KEYS,
  applyOptimisticBookingStatus,
  applyOptimisticBookingStatusToList,
  fetchAdminJson,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  mutateAdminCache,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { BookingStatus, BookingWithRelations, WaitlistEntry } from '@/lib/types';
import {
  buildWhatsAppLink,
  getDateKeyInTimezone,
} from '@/lib/format';

const NewBookingDialog = dynamic(
  () =>
    import('@/components/admin/citas/NewBookingDialog').then(
      (mod) => mod.NewBookingDialog,
    ),
  { ssr: false },
);

const CheckoutDrawerDialog = dynamic(
  () =>
    import('@/components/admin/citas/CheckoutDrawerDialog').then(
      (mod) => mod.CheckoutDrawerDialog,
    ),
  { ssr: false },
);

const QuickSlotFinderDialog = dynamic(
  () =>
    import('@/components/admin/citas/QuickSlotFinderDialog').then(
      (mod) => mod.QuickSlotFinderDialog,
    ),
  { ssr: false },
);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

const WAITLIST_WINDOW_LABELS: Record<WaitlistEntry['preferredWindow'], string> = {
  morning: 'Mañana',
  afternoon: 'Tarde',
  any: 'Cualquier horario',
};

const WAITLIST_STATUS_LABELS: Record<WaitlistEntry['status'], string> = {
  waiting: 'En espera',
  notified: 'Avisada',
  booked: 'Agendada',
  expired: 'Vencida',
};

type AgendaRange = 'today' | 'tomorrow' | 'week';

interface FeedbackState {
  status: 'success' | 'error';
  title: string;
  description?: string;
  waMeUrl?: string;
  rescheduleUrl?: string;
}

export default function AdminBookingsPage() {
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const searchParams = useSearchParams();

  const overviewQuery = useAdminCachedQuery<AdminOverviewPayload>(
    providerData ? ADMIN_CACHE_KEYS.overview : null,
    (signal) => fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    {
      enabled: Boolean(providerData),
      initialData: providerData ?? undefined,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const bookingsQuery = useAdminCachedQuery<{ bookings: BookingWithRelations[] }>(
    providerData ? ADMIN_CACHE_KEYS.bookings : null,
    (signal) =>
      fetchAdminJson<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        signal,
      ),
    {
      enabled: Boolean(providerData),
      initialData: providerData ? { bookings: providerData.bookings } : undefined,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const baseOverview = overviewQuery.data ?? providerData;
  const data = useMemo<AdminOverviewPayload | null>(() => {
    if (!baseOverview) return null;
    const cachedBookings = bookingsQuery.data?.bookings;
    if (!cachedBookings || cachedBookings === baseOverview.bookings) {
      return baseOverview;
    }
    return { ...baseOverview, bookings: cachedBookings };
  }, [baseOverview, bookingsQuery.data]);

  const [tab, setTab] = useState('upcoming');
  const [viewMode, setViewMode] = useState<'schedule' | 'list'>('schedule');
  const [agendaRange, setAgendaRange] = useState<AgendaRange>('today');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [selectedVisualDate, setSelectedVisualDate] = useState<string | null>(null);

  const [quickFinderOpen, setQuickFinderOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInitStaffId, setManualInitStaffId] = useState('any');
  const [manualPrefill, setManualPrefill] = useState<NewBookingPrefill | null>(null);
  const [manualSessionKey, setManualSessionKey] = useState(0);
  const [busyAction, setBusyAction] = useState<{
    bookingId: string;
    status: BookingStatus;
  } | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [requestingRescheduleId, setRequestingRescheduleId] = useState<string | null>(null);
  const [notifyingWaitlistId, setNotifyingWaitlistId] = useState<string | null>(null);
  const copiedLink = useEphemeralMessage(2500);
  const inlineNotice = useEphemeralMessage(3200);

  const [popoverBookingId, setPopoverBookingId] = useState<string | null>(null);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [checkoutSessionKey, setCheckoutSessionKey] = useState(0);

  const [pendingCancelBookingId, setPendingCancelBookingId] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockStaffId, setBlockStaffId] = useState('');
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('Día libre');
  const [blockingDay, setBlockingDay] = useState(false);

  const lastHandledUrlKeyRef = useRef('');

  const tz = data?.settings.timezone || 'America/Mexico_City';
  const paramCollect = searchParams.get('collect')?.trim() ?? '';
  const paramNew = searchParams.get('new')?.trim() ?? '';
  const paramQuery = searchParams.get('q')?.trim() ?? '';
  const urlSyncKey = data
    ? `citas-ready|${paramCollect}|${paramNew}|${paramQuery}`
    : 'citas-loading';

  useExternalSync(urlSyncKey, async (signal, key) => {
    if (signal.aborted || !key.startsWith('citas-ready') || !data) return;
    if (lastHandledUrlKeyRef.current === key) return;
    lastHandledUrlKeyRef.current = key;

    if (paramCollect) {
      const target = data.bookings.find((b) => b.id === paramCollect);
      if (target) {
        setCheckoutBookingId(target.id);
        setCheckoutSessionKey((prev) => prev + 1);
        return;
      }
    }
    if (paramNew === '1') {
      setManualInitStaffId('any');
      setManualPrefill(null);
      setManualSessionKey((prev) => prev + 1);
      setManualOpen(true);
      return;
    }
    if (paramQuery) {
      setSearch(paramQuery);
      const qLower = paramQuery.toLowerCase();
      const matched = data.bookings.find(
        (b) =>
          b.bookingCode.toLowerCase() === qLower ||
          b.client.fullName.toLowerCase().includes(qLower),
      );
      if (matched) {
        if (matched.status === 'completed' || matched.status === 'no_show') {
          setTab('past');
        } else if (matched.status === 'canceled') {
          setTab('canceled');
        } else {
          setTab('upcoming');
        }
        setViewMode('list');
      }
    }
  });

  const orderedStaff = useMemo(
    () =>
      (data?.staff ?? [])
        .filter((s) => s.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder),
    [data?.staff],
  );

  const allStaffColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    orderedStaff.forEach((st, idx) => {
      map.set(st.id, idx % 4);
    });
    return map;
  }, [orderedStaff]);

  const tabFilteredBookings = useMemo(() => {
    if (!data) return [];
    const nowMs = new Date(data.serverNowIso).getTime();
    return data.bookings
      .filter((b) => {
        if (selectedStaffFilter !== 'all' && b.staffId !== selectedStaffFilter) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          const ig = (b.clientInstagram ?? b.client.instagramHandle ?? '').toLowerCase();
          const hit =
            b.client.fullName.toLowerCase().includes(q) ||
            b.service.name.toLowerCase().includes(q) ||
            b.bookingCode.toLowerCase().includes(q) ||
            b.client.phoneE164.includes(q) ||
            ig.includes(q);
          if (!hit) return false;
        }
        if (tab === 'upcoming') {
          return (
            ['confirmed', 'pending_confirmation', 'pending_payment'].includes(b.status) &&
            new Date(b.endAt).getTime() >= nowMs - 86_400_000
          );
        }
        if (tab === 'unconfirmed') {
          return b.status === 'pending_confirmation' || b.status === 'pending_payment';
        }
        if (tab === 'past') {
          return b.status === 'completed' || b.status === 'no_show';
        }
        if (tab === 'canceled') {
          return b.status === 'canceled';
        }
        return true;
      })
      .toSorted((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [data, tab, search, selectedStaffFilter]);

  const listBookings = useMemo(() => {
    if (!data) return [];
    if (search.trim() || tab !== 'upcoming') {
      return tabFilteredBookings;
    }
    const todayKey = data.serverTodayKey;
    const tomorrowKey = shiftDateKey(todayKey, 1);
    const weekEndKey = shiftDateKey(todayKey, 6);

    return tabFilteredBookings.filter((b) => {
      const bookingDateKey = getDateKeyInTimezone(new Date(b.startAt), tz);
      if (agendaRange === 'today') return bookingDateKey === todayKey;
      if (agendaRange === 'tomorrow') return bookingDateKey === tomorrowKey;
      return bookingDateKey >= todayKey && bookingDateKey <= weekEndKey;
    });
  }, [data, tab, search, agendaRange, tabFilteredBookings, tz]);

  if (!data) return null;

  const todayKey = data.serverTodayKey;
  const tomorrowKey = shiftDateKey(todayKey, 1);

  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);
  const lockedStaffId = isSpecialistOnly ? data.session.user.staffMemberId : null;
  const visibleStaff = lockedStaffId
    ? orderedStaff.filter((s) => s.id === lockedStaffId)
    : orderedStaff;
  const scheduleStaff =
    selectedStaffFilter === 'all' || lockedStaffId
      ? visibleStaff
      : visibleStaff.filter((s) => s.id === selectedStaffFilter);

  const activeVisualDate =
    selectedVisualDate ??
    (agendaRange === 'tomorrow' ? tomorrowKey : todayKey);

  const handleSelectRange = (nextRange: AgendaRange) => {
    setAgendaRange(nextRange);
    if (nextRange === 'today') {
      setSelectedVisualDate(todayKey);
    } else if (nextRange === 'tomorrow') {
      setSelectedVisualDate(tomorrowKey);
    } else {
      setSelectedVisualDate(null);
    }
  };

  const handleVisualDateChange = (nextDateKey: string) => {
    setSelectedVisualDate(nextDateKey);
    if (nextDateKey === todayKey) {
      setAgendaRange('today');
    } else if (nextDateKey === tomorrowKey) {
      setAgendaRange('tomorrow');
    }
  };

  const handleJumpToDay = (nextDateKey: string) => {
    setSelectedVisualDate(nextDateKey);
    setAgendaRange(nextDateKey === tomorrowKey ? 'tomorrow' : 'today');
    setViewMode('schedule');
  };

  const openManualModal = (
    preferredStaffId = 'any',
    prefill: NewBookingPrefill | null = null,
  ) => {
    const resolvedStaff =
      lockedStaffId ??
      (preferredStaffId !== 'any'
        ? preferredStaffId
        : selectedStaffFilter !== 'all'
          ? selectedStaffFilter
          : 'any');
    setManualInitStaffId(resolvedStaff);
    setManualPrefill(prefill);
    setManualSessionKey((prev) => prev + 1);
    setManualOpen(true);
  };

  const openCheckoutDrawer = (booking: BookingWithRelations) => {
    setPopoverBookingId(null);
    setCheckoutBookingId(booking.id);
    setCheckoutSessionKey((prev) => prev + 1);
  };

  const handleScheduleRetouch = (booking: BookingWithRelations) => {
    const baseDateKey = getDateKeyInTimezone(new Date(booking.startAt), tz);
    const retouchDateKey = shiftDateKey(baseDateKey, 21);
    setCheckoutBookingId(null);
    openManualModal(booking.staffId, {
      serviceId: booking.serviceId,
      extraServiceIds: booking.extraServiceIds ?? [],
      staffId: booking.staffId,
      startDate: retouchDateKey,
      clientName: booking.client.fullName,
      clientPhone: booking.client.phoneE164,
      clientInstagram: booking.clientInstagram ?? booking.client.instagramHandle ?? '',
      internalNotes: `Retoque 3 semanas (${booking.bookingCode})`,
    });
  };

  const openBlockModal = () => {
    setBlockStaffId(lockedStaffId ?? visibleStaff[0]?.id ?? '');
    setBlockDate(activeVisualDate || todayKey);
    setBlockOpen(true);
  };

  const popoverBooking = popoverBookingId
    ? data.bookings.find((b) => b.id === popoverBookingId) ?? null
    : null;
  const checkoutBooking = checkoutBookingId
    ? data.bookings.find((b) => b.id === checkoutBookingId) ?? null
    : null;

  const noShowThreshold = data.settings.noShowDepositThreshold ?? 2;
  const hasActiveOwnerPin = Boolean(
    data.settings.ownerPinEnabled && data.settings.hasOwnerPin,
  );
  const isNoShowRisk = (booking: BookingWithRelations): boolean =>
    booking.client.noShowCount >= noShowThreshold || Boolean(booking.noShowPolicyEnforced);

  const flaggedBookings = tabFilteredBookings.filter(
    (b) => isNoShowRisk(b) && b.status !== 'canceled',
  );

  const pendingCancelBooking = pendingCancelBookingId
    ? data.bookings.find((b) => b.id === pendingCancelBookingId) ?? null
    : null;

  const updateStatus = async (
    bookingId: string,
    status: BookingStatus,
    ownerPin?: string,
  ): Promise<boolean> => {
    if (busyAction?.bookingId === bookingId) return false;
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
      if (ownerPin) {
        headers['x-owner-pin'] = ownerPin;
      }
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
        void bookingsQuery.revalidate();
        return true;
      } else {
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
      }
    } catch {
      rollbackOptimistic();
      setFeedback({
        status: 'error',
        title: 'Error de conexión al actualizar la cita.',
      });
      return false;
    } finally {
      setBusyAction(null);
      if (ownerPin) {
        setPinSubmitting(false);
      }
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

  const handleCopyRescheduleUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      copiedLink.show('Enlace copiado');
    } catch {
      copiedLink.show('Copia el enlace manualmente');
    }
  };

  const submitQuickBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStaffId || !blockDate || blockingDay) return;
    setBlockingDay(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: blockStaffId,
          overrideDate: blockDate,
          isUnavailable: true,
          startTime: null,
          endTime: null,
          reason: blockReason,
        }),
      });
      if (res.ok) {
        await refresh();
        setBlockOpen(false);
        inlineNotice.show(`Día ${blockDate} bloqueado`);
      } else {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setFeedback({
          status: 'error',
          title: json?.error || 'No se pudo bloquear esa fecha.',
        });
      }
    } catch {
      setFeedback({
        status: 'error',
        title: 'Error de conexión al bloquear la fecha.',
      });
    } finally {
      setBlockingDay(false);
    }
  };

  const handleNotifyWaitlist = async (waitlistId: string) => {
    if (notifyingWaitlistId === waitlistId) return;
    setNotifyingWaitlistId(waitlistId);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'waitlist',
          id: waitlistId,
          status: 'notified',
        }),
      });
      if (res.ok) {
        await refresh();
        inlineNotice.show('Clienta marcada como avisada');
      }
    } finally {
      setNotifyingWaitlistId(null);
    }
  };

  const isDateRangeActive =
    tab === 'upcoming' && !search.trim() && (viewMode === 'schedule' || viewMode === 'list');
  const isTodaySelected = agendaRange === 'today' && activeVisualDate === todayKey;
  const isTomorrowSelected = agendaRange === 'tomorrow' && activeVisualDate === tomorrowKey;

  return (
    <VStack gap={5} className="ad-page fx-fade-up">
      <HStack
        as="header"
        className="ad-page-head"
        justify="between"
        align="end"
        wrap="wrap"
        gap={3}
      >
        <VStack gap={1} className="ad-head-copy">
          <HStack gap={2} align="center" wrap="wrap">
            <Heading level={1} className="ad-page-title">
              Agenda
            </Heading>
            {busyAction || blockingDay ? (
              <Text
                className="fx-save-pill"
                data-state="saving"
                role="status"
                aria-live="polite"
              >
                Actualizando...
              </Text>
            ) : inlineNotice.message ? (
              <Text
                className="fx-save-pill"
                data-state="saved"
                role="status"
                aria-live="polite"
              >
                <Check size={12} aria-hidden="true" />
                {inlineNotice.message}
              </Text>
            ) : null}
          </HStack>
          <Text className="ad-page-sub">
            Revisa tus citas del día, confirma anticipos y cobra en un par de toques.
          </Text>
        </VStack>

        <HStack gap={2} wrap="wrap">
          <Button
            type="button"
            label="Buscar hora libre"
            variant="secondary"
            size="md"
            icon={<Sparkles size={15} />}
            onClick={() => setQuickFinderOpen(true)}
          />
          <Button
            type="button"
            label="Bloquear día"
            variant="ghost"
            size="md"
            icon={<Ban size={15} />}
            onClick={openBlockModal}
          />
          <Button
            type="button"
            label="Nueva cita"
            variant="primary"
            size="md"
            icon={<Plus size={16} />}
            onClick={() => openManualModal()}
          />
        </HStack>
      </HStack>

      <section aria-label="Resumen de agenda" className="ad-kpis-3 fx-stagger">
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Citas hoy
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {data.kpis.todayBookingsCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            En agenda hoy
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Por confirmar
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={data.kpis.pendingConfirmationsCount > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {data.kpis.pendingConfirmationsCount}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            {data.kpis.pendingConfirmationsCount > 0
              ? 'Anticipos por revisar'
              : 'Todo confirmado'}
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Falta cobrar
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={data.uncollectedBookings.length > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {data.uncollectedBookings.length}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            {data.uncollectedBookings.length > 0 ? 'Con saldo pendiente' : 'Todo cobrado'}
          </Text>
        </VStack>
      </section>

      {feedback ? (
        <Banner
          status={feedback.status}
          role={feedback.status === 'error' ? 'alert' : 'status'}
          title={feedback.title}
          description={feedback.description}
          endContent={
            feedback.waMeUrl || feedback.rescheduleUrl ? (
              <HStack gap={1.5} wrap="wrap">
                {feedback.waMeUrl ? (
                  <Button
                    label="Abrir WhatsApp"
                    variant="primary"
                    size="sm"
                    icon={<MessageCircle size={14} />}
                    href={feedback.waMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                ) : null}
                {feedback.rescheduleUrl ? (
                  <Button
                    label={copiedLink.message ?? 'Copiar enlace'}
                    variant="secondary"
                    size="sm"
                    icon={<Copy size={14} />}
                    onClick={() =>
                      feedback.rescheduleUrl &&
                      void handleCopyRescheduleUrl(feedback.rescheduleUrl)
                    }
                  />
                ) : null}
              </HStack>
            ) : undefined
          }
          isDismissable
          onDismiss={() => setFeedback(null)}
        />
      ) : null}

      {flaggedBookings.length > 0 && tab !== 'waitlist' ? (
        <HStack
          className="ad-surface"
          data-tone="warning"
          data-padded="true"
          justify="between"
          align="center"
          wrap="wrap"
          gap={2}
        >
          <HStack gap={2} align="center" wrap="wrap" className="rb-grow">
            <AlertTriangle size={15} aria-hidden="true" />
            <Text size="sm" weight="semibold" hasTabularNumbers>
              Atención: {flaggedBookings.length} cita
              {flaggedBookings.length === 1 ? '' : 's'} de clientas con {noShowThreshold}+
              inasistencias previas (anticipo obligatorio)
            </Text>
          </HStack>
          <HStack gap={1.5} wrap="wrap">
            {flaggedBookings.slice(0, 3).map((bk) => (
              <Button
                key={bk.id}
                type="button"
                size="sm"
                variant="secondary"
                label={`${bk.client.fullName} (${bk.client.noShowCount})`}
                onClick={() => setPopoverBookingId(bk.id)}
              />
            ))}
          </HStack>
        </HStack>
      ) : null}

      <VStack gap={3}>
        <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={3}>
          <TabList
            value={tab}
            onChange={(nextTab) => {
              setTab(nextTab);
              if (nextTab === 'past' || nextTab === 'canceled' || nextTab === 'unconfirmed') {
                setViewMode('list');
              }
            }}
          >
            <Tab value="upcoming" label="Próximas" />
            <Tab
              value="unconfirmed"
              label="Por confirmar"
              endContent={
                data.kpis.pendingConfirmationsCount > 0 ? (
                  <Badge
                    variant="warning"
                    label={String(data.kpis.pendingConfirmationsCount)}
                  />
                ) : undefined
              }
            />
            <Tab value="past" label="Pasadas" />
            <Tab value="canceled" label="Canceladas" />
            <Tab
              value="waitlist"
              label="Lista de espera"
              endContent={
                data.kpis.waitlistCount > 0 ? (
                  <Badge variant="info" label={String(data.kpis.waitlistCount)} />
                ) : undefined
              }
            />
          </TabList>

          <HStack gap={2} align="center" wrap="wrap">
            <TextInput
              type="search"
              label="Buscar cita"
              isLabelHidden
              placeholder="Buscar clienta o código..."
              startIcon={<Search size={14} />}
              size="sm"
              width="min(16rem, 100%)"
              hasClear
              autoCapitalize="none"
              hasAutoCorrect={false}
              hasSpellCheck={false}
              enterKeyHint="search"
              value={search}
              onChange={(val) => {
                setSearch(val);
                if (val.trim() && viewMode === 'schedule') {
                  setViewMode('list');
                }
              }}
            />
            {tab !== 'waitlist' ? (
              <SegmentedControl
                label="Vista de agenda"
                size="sm"
                value={viewMode}
                onChange={(v) => setViewMode(v as 'schedule' | 'list')}
              >
                <SegmentedControlItem
                  value="schedule"
                  label="Horario"
                  icon={<CalendarClock size={14} />}
                />
                <SegmentedControlItem
                  value="list"
                  label="Lista"
                  icon={<ListIcon size={14} />}
                />
              </SegmentedControl>
            ) : null}
          </HStack>
        </HStack>

        {tab !== 'waitlist' ? (
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            {isDateRangeActive ? (
              <HStack gap={1.5} align="center" wrap="wrap" role="group" aria-label="Rango de fechas">
                <button
                  type="button"
                  className="ad-pill fx-press"
                  data-on={isTodaySelected ? 'true' : 'false'}
                  aria-pressed={isTodaySelected}
                  onClick={() => handleSelectRange('today')}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  className="ad-pill fx-press"
                  data-on={isTomorrowSelected ? 'true' : 'false'}
                  aria-pressed={isTomorrowSelected}
                  onClick={() => handleSelectRange('tomorrow')}
                >
                  Mañana
                </button>
                <button
                  type="button"
                  className="ad-pill fx-press"
                  data-on={agendaRange === 'week' ? 'true' : 'false'}
                  aria-pressed={agendaRange === 'week'}
                  onClick={() => handleSelectRange('week')}
                >
                  Semana
                </button>
              </HStack>
            ) : search.trim() ? (
              <Text color="inherit" className="ad-chip" data-tone="neutral">
                Buscando en todas las fechas
              </Text>
            ) : (
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {listBookings.length}{' '}
                {listBookings.length === 1 ? 'cita encontrada' : 'citas encontradas'}
              </Text>
            )}

            {!isSpecialistOnly && visibleStaff.length > 1 ? (
              <HStack
                gap={1.5}
                align="center"
                wrap="wrap"
                role="group"
                aria-label="Filtrar por manicurista"
              >
                <button
                  type="button"
                  className="ad-pill ad-artist-pill fx-press"
                  data-on={selectedStaffFilter === 'all' ? 'true' : 'false'}
                  aria-pressed={selectedStaffFilter === 'all'}
                  onClick={() => setSelectedStaffFilter('all')}
                >
                  <Text className="ad-dot" data-idx="all" aria-hidden="true">
                    {'\u200B'}
                  </Text>
                  Todas
                </button>
                {visibleStaff.map((st) => {
                  const colorIdx = allStaffColorIndex.get(st.id) ?? 0;
                  const isOn = selectedStaffFilter === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className="ad-pill ad-artist-pill fx-press"
                      data-on={isOn ? 'true' : 'false'}
                      aria-pressed={isOn}
                      onClick={() => setSelectedStaffFilter(st.id)}
                    >
                      <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
                        {'\u200B'}
                      </Text>
                      {st.name}
                    </button>
                  );
                })}
              </HStack>
            ) : null}
          </HStack>
        ) : null}
      </VStack>

      {tab === 'waitlist' ? (
        <VStack className="ad-surface fx-step-in" key="waitlist" gap={0}>
          <HStack className="ad-section-head" justify="between" align="center" gap={2}>
            <Heading level={2} className="lk-serif ad-h3">
              Lista de espera
            </Heading>
            <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
              {data.waitlist.length} {data.waitlist.length === 1 ? 'clienta' : 'clientas'}
            </Text>
          </HStack>
          {data.waitlist.length === 0 ? (
            <VStack className="ad-empty" gap={2}>
              <EmptyState
                isCompact
                title="Sin personas en lista de espera"
                description="Cuando un día esté lleno, tus clientas podrán apuntarse desde tu página de reservas."
              />
            </VStack>
          ) : (
            <VStack className="ad-row-list fx-stagger" gap={0}>
              {data.waitlist.map((w) => {
                const srv = data.services.find((s) => s.id === w.serviceId);
                const waHref = buildWhatsAppLink(
                  w.clientPhoneE164,
                  `Hola ${w.clientName}, se abrió un lugar en ${data.settings.name} para ${srv?.name || 'tu servicio'} el ${w.desiredDate}. ¿Te gustaría agendarlo?`,
                );
                return (
                  <HStack
                    key={w.id}
                    className={
                      notifyingWaitlistId === w.id ? 'ad-row-item fx-busy' : 'ad-row-item'
                    }
                    aria-busy={notifyingWaitlistId === w.id || undefined}
                    justify="between"
                    align="center"
                    wrap="wrap"
                    gap={3}
                  >
                    <VStack gap={0.5} className="rb-grow">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{w.clientName}</Text>
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={w.status === 'waiting' ? 'warning' : 'success'}
                        >
                          {WAITLIST_STATUS_LABELS[w.status]}
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {srv?.name} · Día deseado: {w.desiredDate} (
                        {WAITLIST_WINDOW_LABELS[w.preferredWindow]}) · {w.clientPhoneE164}
                      </Text>
                      {w.notes ? (
                        <Text type="supporting" color="secondary">
                          {w.notes}
                        </Text>
                      ) : null}
                    </VStack>
                    <HStack gap={2}>
                      <Button
                        label={
                          notifyingWaitlistId === w.id
                            ? 'Marcando...'
                            : 'Avisar por WhatsApp'
                        }
                        variant="primary"
                        size="sm"
                        icon={<MessageCircle size={14} />}
                        isLoading={notifyingWaitlistId === w.id}
                        isDisabled={notifyingWaitlistId === w.id}
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void handleNotifyWaitlist(w.id)}
                      />
                    </HStack>
                  </HStack>
                );
              })}
            </VStack>
          )}
        </VStack>
      ) : viewMode === 'schedule' ? (
        <VisualScheduleGrid
          rangeMode={agendaRange === 'week' ? 'week' : 'day'}
          dateKey={activeVisualDate}
          todayKey={todayKey}
          timezone={tz}
          staff={scheduleStaff}
          allStaffColorIndex={allStaffColorIndex}
          schedules={data.schedules}
          recurringBlocks={data.recurringBlocks}
          paymentSplits={data.paymentSplits}
          bookings={tabFilteredBookings}
          allServices={data.services}
          busyBookingId={busyAction?.bookingId ?? null}
          busyStatus={busyAction?.status ?? null}
          onChangeDate={handleVisualDateChange}
          onJumpToDay={handleJumpToDay}
          onOpenNewForStaff={(staffId, preferredDate) =>
            openManualModal(staffId, preferredDate ? { startDate: preferredDate } : null)
          }
          onSelectBooking={(b) => setPopoverBookingId(b.id)}
          onUpdateStatus={(id, status) => void updateStatus(id, status)}
          onOpenCheckout={openCheckoutDrawer}
        />
      ) : listBookings.length === 0 ? (
        <VStack className="ad-surface fx-step-in" key={`${tab}-${agendaRange}-empty`} gap={0}>
          <VStack className="ad-empty" gap={2}>
            <EmptyState
              isCompact
              title="No hay citas en esta vista"
              description={
                tab === 'upcoming' && agendaRange !== 'week' && !search.trim()
                  ? 'Puedes ver toda la semana o agendar una nueva cita.'
                  : 'Puedes agendar una nueva cita o ajustar los filtros.'
              }
              actions={
                <HStack gap={2} wrap="wrap" justify="center">
                  {tab === 'upcoming' && agendaRange !== 'week' && !search.trim() ? (
                    <Button
                      label="Ver toda la semana"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSelectRange('week')}
                    />
                  ) : null}
                  <Button
                    label="Nueva cita"
                    variant="primary"
                    size="sm"
                    icon={<Plus size={14} />}
                    onClick={() => openManualModal()}
                  />
                </HStack>
              }
            />
          </VStack>
        </VStack>
      ) : (
        <VStack gap={3} key={`${tab}-${agendaRange}-list`} className="fx-step-in">
          {listBookings.map((b) => (
            <VStack key={b.id} gap={1.5}>
              {isNoShowRisk(b) ? (
                <HStack gap={2} align="center" wrap="wrap">
                  <Badge
                    variant="warning"
                    label={`${b.client.noShowCount} inasistencias previas`}
                  />
                  <Text type="supporting" color="secondary">
                    Anticipo obligatorio activo para {b.client.fullName}.
                  </Text>
                </HStack>
              ) : null}
              <BookingCard
                booking={b}
                allServices={data.services}
                paymentSplits={data.paymentSplits}
                salonName={data.settings.name}
                currency={data.settings.currency}
                timezone={tz}
                busyStatus={busyAction?.bookingId === b.id ? busyAction.status : null}
                isRequestingReschedule={requestingRescheduleId === b.id}
                onSelectBooking={(bk) => setPopoverBookingId(bk.id)}
                onUpdateStatus={(id, status) => void updateStatus(id, status)}
                onOpenCheckout={openCheckoutDrawer}
                onRequestReschedule={(id) => void requestReschedule(id)}
              />
            </VStack>
          ))}
        </VStack>
      )}

      {quickFinderOpen ? (
        <QuickSlotFinderDialog
          isOpen={quickFinderOpen}
          onOpenChange={setQuickFinderOpen}
          services={data.services}
          staff={data.staff}
          currency={data.settings.currency}
          timezone={tz}
          todayKey={todayKey}
          lockedStaffId={lockedStaffId}
          onPickSlot={(selection) => {
            openManualModal(selection.staffId, {
              serviceId: selection.serviceId,
              extraServiceIds: selection.extraServiceIds,
              staffId: selection.staffId,
              startDate: selection.dateKey,
              preferredStartAt: selection.startAt,
            });
          }}
        />
      ) : null}

      <BookingQuickPopover
        booking={popoverBooking}
        allServices={data.services}
        paymentSplits={data.paymentSplits}
        salonName={data.settings.name}
        currency={data.settings.currency}
        timezone={tz}
        busyStatus={
          popoverBooking && busyAction?.bookingId === popoverBooking.id
            ? busyAction.status
            : null
        }
        isReminding={Boolean(popoverBooking && remindingId === popoverBooking.id)}
        isRequestingReschedule={Boolean(
          popoverBooking && requestingRescheduleId === popoverBooking.id,
        )}
        onClose={() => setPopoverBookingId(null)}
        onUpdateStatus={(id, status) => updateStatus(id, status)}
        onOpenCheckout={openCheckoutDrawer}
        onSendReminder={(id) => void sendReminder(id)}
        onRequestReschedule={(id) => void requestReschedule(id)}
      />

      {manualOpen ? (
        <NewBookingDialog
          key={`${manualInitStaffId}-${manualSessionKey}`}
          isOpen={manualOpen}
          onOpenChange={setManualOpen}
          services={data.services}
          addons={data.addons}
          staff={data.staff}
          clients={data.clients}
          todayKey={todayKey}
          currency={data.settings.currency}
          timezone={tz}
          initialStaffId={manualInitStaffId}
          lockedStaffId={lockedStaffId}
          prefill={manualPrefill}
          requireOwnerPinForPriceOverride={hasActiveOwnerPin}
          onCreated={async (message, description) => {
            invalidateAdminCache('/api/admin/reports');
            await refresh();
            void bookingsQuery.revalidate();
            if (description) {
              setFeedback({ status: 'success', title: message, description });
            } else {
              inlineNotice.show(message);
            }
          }}
        />
      ) : null}

      {checkoutBooking ? (
        <CheckoutDrawerDialog
          key={`${checkoutBookingId ?? 'closed'}-${checkoutSessionKey}`}
          booking={checkoutBooking}
          existingSplits={data.paymentSplits.filter((s) => s.bookingId === checkoutBooking.id)}
          inventory={data.inventory}
          staff={data.staff}
          loyaltyProgram={data.loyaltyProgram}
          loyaltyStamps={data.loyaltyStamps}
          currency={data.settings.currency}
          onClose={() => setCheckoutBookingId(null)}
          onCompleted={async () => {
            invalidateAdminCache('/api/admin/reports');
            invalidateAdminCache(ADMIN_CACHE_KEYS.packages);
            await refresh();
            void bookingsQuery.revalidate();
          }}
          onScheduleRetouch={handleScheduleRetouch}
        />
      ) : null}

      <Dialog
        isOpen={blockOpen}
        onOpenChange={(open) => {
          if (!blockingDay) setBlockOpen(open);
        }}
        purpose="form"
        width={440}
        padding={5}
      >
        <DialogHeader
          title="Bloquear día"
          subtitle="Cierra un día completo para una manicurista sin salir de la Agenda."
          onOpenChange={(open) => {
            if (!blockingDay) setBlockOpen(open);
          }}
        />
        <form onSubmit={submitQuickBlock}>
          <VStack
            gap={3}
            paddingBlockStart={4}
            className={blockingDay ? 'fx-busy' : undefined}
            aria-busy={blockingDay || undefined}
          >
            <Selector
              label="Manicurista"
              value={blockStaffId}
              isDisabled={Boolean(lockedStaffId)}
              onChange={(v) => v && setBlockStaffId(v)}
              options={visibleStaff.map((s) => ({ value: s.id, label: s.name }))}
            />
            <DateInput
              label="Fecha"
              value={toIsoDateString(blockDate)}
              format="date_weekday"
              onChange={(val) => {
                if (val) setBlockDate(val);
              }}
              isRequired
            />
            <TextInput
              label="Motivo"
              value={blockReason}
              onChange={setBlockReason}
            />
            <Button
              type="submit"
              label={blockingDay ? 'Bloqueando...' : 'Bloquear día'}
              variant="primary"
              width="100%"
              isLoading={blockingDay}
              isDisabled={blockingDay || !blockStaffId || !blockDate}
            />
          </VStack>
        </form>
      </Dialog>

      <OwnerPinDialog
        isOpen={Boolean(pendingCancelBookingId)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCancelBookingId(null);
            setPinError(null);
          }
        }}
        title="Autorizar cancelación"
        description={
          pendingCancelBooking
            ? `Cancelar la cita ${pendingCancelBooking.bookingCode} de ${pendingCancelBooking.client.fullName} requiere el PIN de autorización de Dueña.`
            : 'Cancelar esta cita requiere el PIN de autorización de Dueña.'
        }
        actionLabel="Confirmar cancelación"
        isSubmitting={pinSubmitting}
        error={pinError}
        onConfirm={async (pin) => {
          if (!pendingCancelBookingId) return;
          await updateStatus(pendingCancelBookingId, 'canceled', pin);
        }}
      />
    </VStack>
  );
}
