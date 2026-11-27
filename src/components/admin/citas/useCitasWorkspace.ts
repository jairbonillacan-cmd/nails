'use client';

import { useMemo, useRef, useState } from 'react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import {
  computeBookingBalance,
  isPendingDepositStatus,
} from '@/lib/booking/balance';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useAgendaUrlState } from '@/lib/hooks/useAgendaUrlState';
import { useCurrentClockTick } from '@/lib/hooks/useCurrentClockTick';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { BookingWithRelations } from '@/lib/types';
import { phonesMatchE164 } from '@/lib/format';
import {
  filterBookingsForAgendaStatus,
  filterBookingsForListDate,
} from './BookingsListView';
import type { NewBookingPrefill } from './NewBookingDialog';
import { shiftDateKey } from './scheduleGridGeometry';

export function useCitasWorkspace() {
  const { data: providerData, refresh } = useAdminData();

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
  const tz = data?.settings.timezone || 'America/Mexico_City';
  const todayKey = data?.serverTodayKey ?? '';
  const tomorrowKey = todayKey ? shiftDateKey(todayKey, 1) : '';
  const isSpecialistOnly = Boolean(
    data && data.session.user.role === 'specialist' && data.session.user.staffMemberId,
  );
  const lockedStaffId = isSpecialistOnly ? (data?.session.user.staffMemberId ?? null) : null;

  const orderedStaff = useMemo(
    () =>
      (data?.staff ?? [])
        .filter((s) => s.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder),
    [data?.staff],
  );
  const validStaffIds = useMemo(
    () => new Set(orderedStaff.map((s) => s.id)),
    [orderedStaff],
  );
  const allStaffColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    orderedStaff.forEach((st, idx) => map.set(st.id, idx % 4));
    return map;
  }, [orderedStaff]);

  const urlState = useAgendaUrlState({
    todayKey,
    lockedStaffId,
    validStaffIds,
  });

  const [searchDraft, setSearchDraft] = useState<{ baseQ: string; value: string } | null>(null);
  const search =
    searchDraft && searchDraft.baseQ === urlState.q ? searchDraft.value : urlState.q;

  const handleChangeSearch = (nextValue: string) => {
    setSearchDraft({ baseQ: urlState.q, value: nextValue });
    urlState.setSearch(nextValue);
  };

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
  const lastHandledOneShotKeyRef = useRef('');

  const { oneShot } = urlState;
  const oneShotSyncKey =
    data && urlState.hasOneShotParams
      ? `oneshot|${oneShot.collectId ?? ''}|${oneShot.isNew ? '1' : '0'}|${oneShot.clientName}|${oneShot.clientPhone}|${oneShot.clientInstagram}|${oneShot.staffId}|${oneShot.serviceId}`
      : 'oneshot-idle';

  useExternalSync(oneShotSyncKey, async (signal, key) => {
    if (signal.aborted || key === 'oneshot-idle' || !data) return;
    if (lastHandledOneShotKeyRef.current === key) return;
    lastHandledOneShotKeyRef.current = key;

    if (oneShot.collectId) {
      const target = data.bookings.find((b) => b.id === oneShot.collectId);
      if (target) {
        setPopoverBookingId(null);
        setCheckoutBookingId(target.id);
        setCheckoutSessionKey((prev) => prev + 1);
      }
      urlState.clearOneShotParams();
      return;
    }

    if (oneShot.isNew) {
      const requestedStaffId = oneShot.staffId || (urlState.staffFilter !== 'all' ? urlState.staffFilter : '');
      const validRequestedStaffId =
        !isSpecialistOnly &&
        requestedStaffId &&
        data.staff.some((s) => s.isActive && s.id === requestedStaffId)
          ? requestedStaffId
          : '';
      const resolvedStaffId = lockedStaffId ?? (validRequestedStaffId || 'any');
      const safeClientName = oneShot.clientName.slice(0, 120);
      const safeClientPhone = oneShot.clientPhone.slice(0, 30);
      const matchedClient = safeClientPhone
        ? data.clients.find((c) => phonesMatchE164(c.phoneE164, safeClientPhone))
        : undefined;
      const resolvedInstagram = (
        oneShot.clientInstagram ||
        matchedClient?.instagramHandle ||
        ''
      ).slice(0, 120);
      const validServiceId =
        oneShot.serviceId && data.services.some((s) => s.isActive && s.id === oneShot.serviceId)
          ? oneShot.serviceId
          : '';
      const hasPrefillFields = Boolean(
        safeClientName ||
          safeClientPhone ||
          resolvedInstagram ||
          validServiceId ||
          resolvedStaffId !== 'any',
      );
      const nextPrefill: NewBookingPrefill | null = hasPrefillFields
        ? {
            ...(validServiceId ? { serviceId: validServiceId } : {}),
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
      urlState.clearOneShotParams();
    }
  });

  const statusFilteredBookings = useMemo(() => {
    if (!data) return [];
    const filtered = filterBookingsForAgendaStatus({
      bookings: data.bookings,
      paymentSplits: data.paymentSplits,
      cashEntries: data.cashEntries,
      serverNowIso: data.serverNowIso,
      status: urlState.status,
      search,
      selectedStaffFilter: urlState.staffFilter,
    });
    if (filtered.length > 0 || !search.trim()) {
      return filtered;
    }
    return filterBookingsForAgendaStatus({
      bookings: data.bookings,
      paymentSplits: data.paymentSplits,
      cashEntries: data.cashEntries,
      serverNowIso: data.serverNowIso,
      status: 'all',
      search,
      selectedStaffFilter: urlState.staffFilter,
    });
  }, [data, urlState.status, search, urlState.staffFilter]);

  const listBookings = useMemo(
    () =>
      data
        ? filterBookingsForListDate({
            filtered: statusFilteredBookings,
            status: urlState.status,
            search,
            dateKey: urlState.dateKey,
            timezone: tz,
          })
        : [],
    [data, statusFilteredBookings, urlState.status, search, urlState.dateKey, tz],
  );

  const nowMs = useCurrentClockTick(data?.serverNowIso ?? '');

  const chipCounts = useMemo(() => {
    if (!data) {
      return {
        pendingCount: 0,
        uncollectedCount: 0,
        uncollectedTotalCents: 0,
        todayWaitingCount: 0,
        totalWaitingCount: 0,
      };
    }
    const scopedBookings =
      urlState.staffFilter === 'all'
        ? data.bookings
        : data.bookings.filter((b) => b.staffId === urlState.staffFilter);

    let pendingCount = 0;
    let uncollectedCount = 0;
    let uncollectedTotalCents = 0;
    for (const booking of scopedBookings) {
      if (isPendingDepositStatus(booking.status)) {
        pendingCount += 1;
      }
      const balance = computeBookingBalance(
        booking,
        data.paymentSplits,
        data.cashEntries,
        nowMs,
      );
      if (balance.isUncollected) {
        uncollectedCount += 1;
        uncollectedTotalCents += balance.remainingCents;
      }
    }

    const activeWaiting = data.waitlist.filter((w) => w.status === 'waiting');
    const todayWaitingCount = activeWaiting.filter(
      (w) => w.desiredDate === urlState.dateKey || w.desiredDate === todayKey,
    ).length;

    return {
      pendingCount,
      uncollectedCount,
      uncollectedTotalCents,
      todayWaitingCount,
      totalWaitingCount: activeWaiting.length,
    };
  }, [data, urlState.staffFilter, urlState.dateKey, todayKey, nowMs]);

  const openManualModal = (preferredStaffId = 'any', prefill: NewBookingPrefill | null = null) => {
    const resolvedStaff =
      lockedStaffId ??
      (preferredStaffId !== 'any'
        ? preferredStaffId
        : urlState.staffFilter !== 'all'
          ? urlState.staffFilter
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

  return {
    data,
    tz,
    todayKey,
    tomorrowKey,
    isSpecialistOnly,
    lockedStaffId,
    orderedStaff,
    allStaffColorIndex,
    statusFilteredBookings,
    listBookings,
    chipCounts,
    refresh,
    explicitView: urlState.explicitView,
    resolvedView: urlState.resolvedView,
    isNarrow: urlState.isNarrow,
    isHydrated: urlState.isHydrated,
    dateKey: urlState.dateKey,
    selectedStaffFilter: urlState.staffFilter,
    status: urlState.status,
    search,
    waitlistOpen: urlState.waitlistOpen,
    setView: urlState.setView,
    setDate: urlState.setDate,
    setStaff: urlState.setStaff,
    setStatus: urlState.setStatus,
    setWaitlistOpen: urlState.setWaitlistOpen,
    setSearch: handleChangeSearch,
    updateFilters: urlState.updateFilters,
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
  };
}
