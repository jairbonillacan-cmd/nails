'use client';

import { useCallback, useMemo } from 'react';
import type { AgendaViewParam } from '@/lib/admin-links';
import { isMetricDateKey } from '@/lib/metrics';
import type {
  BookingWithRelations,
  CashRegisterEntry,
  PaymentSplit,
} from '@/lib/types';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  useAdminCachedQuery,
} from './useAdminCache';

const RANGE_REQUEST_TIMEOUT_MS = 15_000;

interface AdminBookingsRangeResponse {
  bookings: BookingWithRelations[];
  paymentSplits: PaymentSplit[];
  cashEntries: CashRegisterEntry[];
  range: {
    from: string | null;
    to: string | null;
    staffId: string | null;
  };
  timezone: string;
}

interface AgendaFetchWindow {
  readonly from: string;
  readonly to: string;
}

function shiftCalendarDateKey(dateKey: string, deltaDays: number): string {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateKey;
  }
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeAgendaFetchWindow(
  view: AgendaViewParam | null,
  dateKey: string,
): AgendaFetchWindow | null {
  if (!isMetricDateKey(dateKey)) return null;
  if (view === 'week') {
    return {
      from: dateKey,
      to: shiftCalendarDateKey(dateKey, 6),
    };
  }
  if (view === 'day') {
    return {
      from: shiftCalendarDateKey(dateKey, -3),
      to: shiftCalendarDateKey(dateKey, 3),
    };
  }
  return {
    from: shiftCalendarDateKey(dateKey, -7),
    to: shiftCalendarDateKey(dateKey, 7),
  };
}

export function buildAgendaBookingsRangeUrl(params: {
  from: string;
  to: string;
  staffFilter: string;
}): string {
  const qs = new URLSearchParams();
  qs.set('from', params.from);
  qs.set('to', params.to);
  const cleanStaff = params.staffFilter.trim();
  if (cleanStaff && cleanStaff !== 'all') {
    qs.set('staff', cleanStaff);
  }
  return `${ADMIN_CACHE_KEYS.bookings}?${qs.toString()}`;
}

function mergeRecordsById<T extends { id: string }>(
  base: readonly T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return [...base];
  const byId = new Map<string, T>();
  for (const item of base) {
    byId.set(item.id, item);
  }
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export function mergeAgendaRangeData(params: {
  overviewBookings: readonly BookingWithRelations[];
  overviewSplits: readonly PaymentSplit[];
  overviewCashEntries: readonly CashRegisterEntry[];
  rangeData: AdminBookingsRangeResponse | undefined;
}): {
  bookings: BookingWithRelations[];
  paymentSplits: PaymentSplit[];
  cashEntries: CashRegisterEntry[];
} {
  const { overviewBookings, overviewSplits, overviewCashEntries, rangeData } = params;
  if (!rangeData) {
    return {
      bookings: [...overviewBookings],
      paymentSplits: [...overviewSplits],
      cashEntries: [...overviewCashEntries],
    };
  }
  return {
    bookings: mergeRecordsById(overviewBookings, rangeData.bookings),
    paymentSplits: mergeRecordsById(overviewSplits, rangeData.paymentSplits),
    cashEntries: mergeRecordsById(overviewCashEntries, rangeData.cashEntries),
  };
}

export function invalidateAgendaRangeCache(): void {
  invalidateAdminCache(`${ADMIN_CACHE_KEYS.bookings}?`);
}

interface UseAgendaRangeBookingsParams {
  enabled: boolean;
  view: AgendaViewParam | null;
  dateKey: string;
  staffFilter: string;
  overviewBookings: readonly BookingWithRelations[];
  overviewSplits: readonly PaymentSplit[];
  overviewCashEntries: readonly CashRegisterEntry[];
}

export function useAgendaRangeBookings({
  enabled,
  view,
  dateKey,
  staffFilter,
  overviewBookings,
  overviewSplits,
  overviewCashEntries,
}: UseAgendaRangeBookingsParams) {
  const windowRange = useMemo(
    () => computeAgendaFetchWindow(view, dateKey),
    [view, dateKey],
  );
  const requestUrl = useMemo(
    () =>
      enabled && windowRange
        ? buildAgendaBookingsRangeUrl({
            from: windowRange.from,
            to: windowRange.to,
            staffFilter,
          })
        : null,
    [enabled, windowRange, staffFilter],
  );

  const fetcher = useCallback(
    (signal: AbortSignal) => {
      const timeoutSignal = AbortSignal.timeout(RANGE_REQUEST_TIMEOUT_MS);
      const combinedSignal =
        typeof AbortSignal.any === 'function'
          ? AbortSignal.any([signal, timeoutSignal])
          : signal;
      return fetchAdminJson<AdminBookingsRangeResponse>(
        requestUrl ?? ADMIN_CACHE_KEYS.bookings,
        combinedSignal,
      );
    },
    [requestUrl],
  );

  const query = useAdminCachedQuery<AdminBookingsRangeResponse>(
    requestUrl,
    fetcher,
    {
      enabled: Boolean(requestUrl),
      staleTimeMs: 30_000,
    },
  );

  const merged = useMemo(
    () =>
      mergeAgendaRangeData({
        overviewBookings,
        overviewSplits,
        overviewCashEntries,
        rangeData: query.data,
      }),
    [overviewBookings, overviewSplits, overviewCashEntries, query.data],
  );

  return {
    bookings: merged.bookings,
    paymentSplits: merged.paymentSplits,
    cashEntries: merged.cashEntries,
    isValidating: query.isValidating,
    revalidate: query.revalidate,
  };
}
