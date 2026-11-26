'use client';

import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { BookingWithRelations } from '@/lib/types';
import { getDateKeyInTimezone } from '@/lib/format';
import type { AgendaRange } from './BookingsFiltersBar';
import {
  filterBookingsForListRange,
  filterBookingsForTab,
} from './BookingsListView';
import type { NewBookingPrefill } from './NewBookingDialog';
import { shiftDateKey } from './scheduleGridGeometry';

export function useCitasWorkspace() {
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
      fetchAdminJson<{ bookings: BookingWithRelations[] }>(ADMIN_CACHE_KEYS.bookings, signal),
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
    if (!cachedBookings || cachedBookings === baseOverview.bookings) return baseOverview;
    return { ...baseOverview, bookings: cachedBookings };
  }, [baseOverview, bookingsQuery.data]);

  const [tab, setTab] = useState('upcoming');
  const [viewMode, setViewMode] = useState<'schedule' | 'list'>('schedule');
  const [agendaRange, setAgendaRange] = useState<AgendaRange>('today');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedVisualDate, setSelectedVisualDate] = useState<string | null>(null);
  const [quickFinderOpen, setQuickFinderOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInitStaffId, setManualInitStaffId] = useState('any');
  const [manualPrefill, setManualPrefill] = useState<NewBookingPrefill | null>(null);
  const [manualSessionKey, setManualSessionKey] = useState(0);
  const [popoverBookingId, setPopoverBookingId] = useState<string | null>(null);
  const [checkoutBookingId, setCheckoutBookingId] = useState<string | null>(null);
  const [checkoutSessionKey, setCheckoutSessionKey] = useState(0);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockSessionKey, setBlockSessionKey] = useState(0);
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
        setTab(
          matched.status === 'completed' || matched.status === 'no_show'
            ? 'past'
            : matched.status === 'canceled'
              ? 'canceled'
              : 'upcoming',
        );
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
    orderedStaff.forEach((st, idx) => map.set(st.id, idx % 4));
    return map;
  }, [orderedStaff]);

  const tabFilteredBookings = useMemo(
    () =>
      data
        ? filterBookingsForTab({
            bookings: data.bookings,
            serverNowIso: data.serverNowIso,
            tab,
            search,
            selectedStaffFilter,
          })
        : [],
    [data, tab, search, selectedStaffFilter],
  );

  const listBookings = useMemo(
    () =>
      data
        ? filterBookingsForListRange({
            tabFiltered: tabFilteredBookings,
            tab,
            search,
            agendaRange,
            todayKey: data.serverTodayKey,
            timezone: tz,
          })
        : [],
    [data, tabFilteredBookings, tab, search, agendaRange, tz],
  );

  const todayKey = data?.serverTodayKey ?? '';
  const tomorrowKey = todayKey ? shiftDateKey(todayKey, 1) : '';
  const isSpecialistOnly = Boolean(
    data && data.session.user.role === 'specialist' && data.session.user.staffMemberId,
  );
  const lockedStaffId = isSpecialistOnly ? (data?.session.user.staffMemberId ?? null) : null;

  const openManualModal = (preferredStaffId = 'any', prefill: NewBookingPrefill | null = null) => {
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
    const retouchDateKey = shiftDateKey(getDateKeyInTimezone(new Date(booking.startAt), tz), 21);
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

  const handleSelectRange = (nextRange: AgendaRange) => {
    setAgendaRange(nextRange);
    setSelectedVisualDate(
      nextRange === 'today' ? todayKey : nextRange === 'tomorrow' ? tomorrowKey : null,
    );
  };

  return {
    data,
    tz,
    todayKey,
    tomorrowKey,
    isSpecialistOnly,
    lockedStaffId,
    orderedStaff,
    allStaffColorIndex,
    tabFilteredBookings,
    listBookings,
    refresh,
    revalidateBookings: async () => {
      await bookingsQuery.revalidate();
    },
    tab,
    setTab,
    viewMode,
    setViewMode,
    agendaRange,
    setAgendaRange,
    selectedStaffFilter,
    setSelectedStaffFilter,
    search,
    setSearch,
    selectedVisualDate,
    setSelectedVisualDate,
    quickFinderOpen,
    setQuickFinderOpen,
    manualOpen,
    setManualOpen,
    manualInitStaffId,
    manualPrefill,
    manualSessionKey,
    popoverBookingId,
    setPopoverBookingId,
    checkoutBookingId,
    setCheckoutBookingId,
    checkoutSessionKey,
    blockOpen,
    setBlockOpen,
    blockSessionKey,
    openBlockModal: () => {
      setBlockSessionKey((prev) => prev + 1);
      setBlockOpen(true);
    },
    openManualModal,
    openCheckoutDrawer,
    handleScheduleRetouch,
    handleSelectRange,
  };
}
