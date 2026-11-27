'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import { agendaHref } from '@/lib/admin-links';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useIsNarrowScreen } from '@/lib/hooks/useIsNarrowScreen';
import type { BookingWithRelations } from '@/lib/types';
import { phonesMatchE164 } from '@/lib/format';
import type { AgendaRange } from './BookingsFiltersBar';
import {
  filterBookingsForListRange,
  filterBookingsForTab,
} from './BookingsListView';
import type { NewBookingPrefill } from './NewBookingDialog';
import { shiftDateKey } from './scheduleGridGeometry';

export function useCitasWorkspace() {
  const { data: providerData, refresh } = useAdminData();
  const router = useRouter();
  const searchParams = useSearchParams();

  const overviewQuery = useAdminCachedQuery<AdminOverviewPayload>(
    providerData ? ADMIN_CACHE_KEYS.overview : null,
    (signal) => fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    {
      enabled: Boolean(providerData),
      initialData: providerData ?? undefined,
      staleTimeMs: 30_000,
    },
  );

  const data = overviewQuery.data ?? providerData;

  const paramCollect = searchParams.get('collect')?.trim() ?? '';
  const paramNew = searchParams.get('new')?.trim() ?? '';
  const paramClientName = searchParams.get('clientName')?.trim() ?? '';
  const paramClientPhone = searchParams.get('clientPhone')?.trim() ?? '';
  const paramClientInstagram = searchParams.get('clientInstagram')?.trim() ?? '';
  const paramStaffId = searchParams.get('staffId')?.trim() ?? '';
  const paramQuery = searchParams.get('q')?.trim() ?? '';
  const paramDate = searchParams.get('date')?.trim() ?? '';
  const paramStaff = searchParams.get('staff')?.trim() ?? '';
  const paramTab = searchParams.get('tab')?.trim() ?? '';

  const [tab, setTab] = useState('upcoming');
  const isNarrowScreen = useIsNarrowScreen();
  const [viewModeChoice, setViewMode] = useState<'schedule' | 'list' | null>(null);
  const viewMode = viewModeChoice ?? (isNarrowScreen ? 'list' : 'schedule');
  const [agendaRange, setAgendaRange] = useState<AgendaRange>('today');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>(() => {
    if (
      paramStaff &&
      providerData &&
      !(
        providerData.session.user.role === 'specialist' &&
        providerData.session.user.staffMemberId
      ) &&
      providerData.staff.some((s) => s.isActive && s.id === paramStaff)
    ) {
      return paramStaff;
    }
    return 'all';
  });
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
  const lastParamStaffRef = useRef(paramStaff);

  const tz = data?.settings.timezone || 'America/Mexico_City';
  const urlSyncKey = data
    ? `citas-ready|${paramCollect}|${paramNew}|${paramClientName}|${paramClientPhone}|${paramClientInstagram}|${paramStaffId}|${paramQuery}|${paramDate}|${paramStaff}|${paramTab}`
    : 'citas-loading';

  useExternalSync(urlSyncKey, async (signal, key) => {
    if (signal.aborted || !key.startsWith('citas-ready') || !data) return;
    if (lastHandledUrlKeyRef.current === key) return;
    lastHandledUrlKeyRef.current = key;

    const isSpecialist =
      data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);
    if (!isSpecialist) {
      if (paramStaff && data.staff.some((s) => s.isActive && s.id === paramStaff)) {
        setSelectedStaffFilter(paramStaff);
        setTab((prev) => (prev === 'waitlist' ? 'upcoming' : prev));
      } else if (paramStaff === 'all' || (lastParamStaffRef.current && !paramStaff)) {
        setSelectedStaffFilter('all');
      }
    }
    lastParamStaffRef.current = paramStaff;

    if (paramTab === 'waitlist') {
      setTab('waitlist');
      return;
    }
    if (paramTab === 'unconfirmed' || paramTab === 'pending') {
      setTab('unconfirmed');
      setViewMode('list');
      return;
    }
    if (paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate)) {
      setSelectedVisualDate(paramDate);
      setTab('upcoming');
      setViewMode('schedule');
      if (paramDate === data.serverTodayKey) {
        setAgendaRange('today');
      } else if (paramDate === shiftDateKey(data.serverTodayKey, 1)) {
        setAgendaRange('tomorrow');
      } else {
        setAgendaRange('today');
      }
      return;
    }
    if (paramCollect) {
      const target = data.bookings.find((b) => b.id === paramCollect);
      if (target) {
        setPopoverBookingId(null);
        setCheckoutBookingId(target.id);
        setCheckoutSessionKey((prev) => prev + 1);
        router.replace(agendaHref(), { scroll: false });
        return;
      }
    }
    if (paramNew === '1') {
      const requestedStaffId = paramStaffId || paramStaff;
      const validRequestedStaffId =
        !isSpecialist &&
        requestedStaffId &&
        data.staff.some((s) => s.isActive && s.id === requestedStaffId)
          ? requestedStaffId
          : '';
      const resolvedStaffId = isSpecialist
        ? (data.session.user.staffMemberId ?? 'any')
        : validRequestedStaffId || 'any';
      const safeClientName = paramClientName.slice(0, 120);
      const safeClientPhone = paramClientPhone.slice(0, 30);
      const matchedClient = safeClientPhone
        ? data.clients.find((c) => phonesMatchE164(c.phoneE164, safeClientPhone))
        : undefined;
      const resolvedInstagram = (
        paramClientInstagram ||
        matchedClient?.instagramHandle ||
        ''
      ).slice(0, 120);
      const hasPrefillFields = Boolean(
        safeClientName ||
          safeClientPhone ||
          resolvedInstagram ||
          resolvedStaffId !== 'any',
      );
      const nextPrefill: NewBookingPrefill | null = hasPrefillFields
        ? {
            ...(safeClientName ? { clientName: safeClientName } : {}),
            ...(safeClientPhone ? { clientPhone: safeClientPhone } : {}),
            ...(resolvedInstagram ? { clientInstagram: resolvedInstagram } : {}),
            ...(resolvedStaffId !== 'any' ? { staffId: resolvedStaffId } : {}),
          }
        : null;
      setManualInitStaffId(resolvedStaffId);
      setManualPrefill(nextPrefill);
      setManualSessionKey((prev) => prev + 1);
      setManualOpen(true);
      router.replace(agendaHref(), { scroll: false });
      return;
    }
    if (paramQuery) {
      if (!isSpecialist && !paramStaff) {
        setSelectedStaffFilter('all');
      }
      setSearch(paramQuery);
      setViewMode('list');
      const qLower = paramQuery.toLowerCase();
      const matched = data.bookings.find(
        (b) =>
          b.bookingCode.toLowerCase() === qLower ||
          b.id.toLowerCase() === qLower ||
          b.client.fullName.toLowerCase().includes(qLower) ||
          b.client.phoneE164.toLowerCase().includes(qLower),
      );
      if (matched) {
        setTab(
          matched.status === 'pending_confirmation' || matched.status === 'pending_payment'
            ? 'unconfirmed'
            : matched.status === 'completed' || matched.status === 'no_show'
              ? 'past'
              : matched.status === 'canceled'
                ? 'canceled'
                : 'upcoming',
        );
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

  const tabFilteredBookings = useMemo(() => {
    if (!data) return [];
    const filtered = filterBookingsForTab({
      bookings: data.bookings,
      serverNowIso: data.serverNowIso,
      tab,
      search,
      selectedStaffFilter,
    });
    if (filtered.length > 0 || !search.trim()) {
      return filtered;
    }
    return filterBookingsForTab({
      bookings: data.bookings,
      serverNowIso: data.serverNowIso,
      tab: 'all',
      search,
      selectedStaffFilter,
    });
  }, [data, tab, search, selectedStaffFilter]);

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
    handleSelectRange,
  };
}
