'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import type { RealtimeEvent } from '@/lib/realtime';
import {
  fetchAvailabilityWindow,
  type AvailabilityWindowQuery,
} from '@/components/booking/bookingApi';
import {
  buildAvailabilityCacheKey,
  normalizeUniqueSortedIds,
  type AvailabilityCacheKeyInput,
} from '@/components/booking/bookingHelpers';

export const DEFAULT_AVAILABILITY_TTL_MS = 45_000;
const DEFAULT_STALE_MAX_AGE_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 36;
const DEFAULT_WINDOW_DAYS = 35;

export type BookingAvailabilityQuery = AvailabilityCacheKeyInput;

export interface AvailabilityInvalidationFilter {
  staffId?: string | null;
  date?: string;
}

export type AvailabilityWindowFetcher = (
  input: AvailabilityWindowQuery & { signal?: AbortSignal },
) => Promise<DayAvailabilitySummary[] | null>;

interface AvailabilityCacheEntry {
  key: string;
  query: BookingAvailabilityQuery;
  days: DayAvailabilitySummary[];
  fetchedAt: number;
}

interface AvailabilityPeekResult {
  days: DayAvailabilitySummary[];
  isStale: boolean;
  fetchedAt: number;
}

interface InFlightRecord {
  key: string;
  query: BookingAvailabilityQuery;
  controller: AbortController;
  promise: Promise<DayAvailabilitySummary[] | null>;
  waiters: number;
  invalidated: boolean;
}

export interface BookingAvailabilityStore {
  peek: (query: BookingAvailabilityQuery) => AvailabilityPeekResult | null;
  getFresh: (query: BookingAvailabilityQuery) => DayAvailabilitySummary[] | null;
  load: (
    query: BookingAvailabilityQuery,
    options?: { force?: boolean; signal?: AbortSignal },
  ) => Promise<DayAvailabilitySummary[] | null>;
  prefetch: (
    query: BookingAvailabilityQuery,
    options?: { signal?: AbortSignal },
  ) => Promise<DayAvailabilitySummary[] | null>;
  invalidate: (filter?: AvailabilityInvalidationFilter) => number;
  clear: () => void;
  size: () => number;
}

export interface BookingAvailabilityState {
  activeKey: string;
  days: DayAvailabilitySummary[];
  isLoading: boolean;
  isRevalidating: boolean;
}

interface BookingAvailabilityController {
  getState: () => BookingAvailabilityState;
  activate: (
    query: BookingAvailabilityQuery | null,
    options?: { nextWindowStartDate?: string | null },
  ) => Promise<void>;
  prefetchWindow: (query: BookingAvailabilityQuery) => Promise<void>;
  invalidateFromRealtime: (filter?: AvailabilityInvalidationFilter) => boolean;
  revalidateActive: () => Promise<void>;
  dispose: () => void;
}

const AVAILABILITY_REALTIME_EVENTS: ReadonlySet<RealtimeEvent['type']> = new Set([
  'slot_changed',
  'hold_changed',
  'schedule_changed',
  'booking_created',
  'booking_updated',
  'slot_hold_updated',
  'availability_updated',
]);

const EMPTY_AVAILABILITY_STATE: BookingAvailabilityState = {
  activeKey: '',
  days: [],
  isLoading: false,
  isRevalidating: false,
};

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  const dt = new Date(
    Date.UTC(parts[0] ?? 2026, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + deltaDays, 12, 0, 0),
  );
  return dt.toISOString().slice(0, 10);
}

function normalizeQuery(query: BookingAvailabilityQuery): BookingAvailabilityQuery {
  const serviceId = query.serviceId.trim();
  return {
    serviceId,
    extraServiceIds: normalizeUniqueSortedIds(query.extraServiceIds, serviceId),
    addonIds: normalizeUniqueSortedIds(query.addonIds),
    staffId: query.staffId.trim() || 'any',
    windowStartDate: query.windowStartDate.trim(),
  };
}

function getSelectionPrefix(query: BookingAvailabilityQuery): string {
  const normalized = normalizeQuery(query);
  return `${normalized.serviceId}|${normalized.extraServiceIds.join(',')}|${normalized.addonIds.join(',')}|${normalized.staffId}`;
}

export function isAvailabilityRealtimeEvent(type: RealtimeEvent['type']): boolean {
  return AVAILABILITY_REALTIME_EVENTS.has(type);
}

export function matchesInvalidationFilter(
  query: BookingAvailabilityQuery,
  days: readonly DayAvailabilitySummary[],
  filter?: AvailabilityInvalidationFilter,
): boolean {
  if (!filter) return true;
  const targetStaffId = filter.staffId?.trim() ?? '';
  const targetDate = filter.date?.trim() ?? '';
  if (!targetStaffId && !targetDate) return true;

  if (targetStaffId) {
    const queryStaff = query.staffId.trim() || 'any';
    if (queryStaff !== 'any' && queryStaff !== targetStaffId) {
      return false;
    }
  }

  if (targetDate) {
    const firstDate = days[0]?.date ?? query.windowStartDate;
    const lastDate =
      days[days.length - 1]?.date ?? shiftDateKey(query.windowStartDate, DEFAULT_WINDOW_DAYS - 1);
    if (firstDate && lastDate && (targetDate < firstDate || targetDate > lastDate)) {
      return false;
    }
  }

  return true;
}

export function createBookingAvailabilityStore(options?: {
  fetcher?: AvailabilityWindowFetcher;
  freshTtlMs?: number;
  staleMaxAgeMs?: number;
  now?: () => number;
  maxEntries?: number;
}): BookingAvailabilityStore {
  const fetcher = options?.fetcher ?? fetchAvailabilityWindow;
  const freshTtlMs = options?.freshTtlMs ?? DEFAULT_AVAILABILITY_TTL_MS;
  const staleMaxAgeMs = options?.staleMaxAgeMs ?? DEFAULT_STALE_MAX_AGE_MS;
  const now = options?.now ?? (() => Date.now());
  const maxEntries = options?.maxEntries ?? MAX_CACHE_ENTRIES;

  const cache = new Map<string, AvailabilityCacheEntry>();
  const inFlight = new Map<string, InFlightRecord>();

  const pruneOverflow = () => {
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  };

  const peek = (rawQuery: BookingAvailabilityQuery): AvailabilityPeekResult | null => {
    if (!rawQuery.serviceId.trim() || !rawQuery.windowStartDate.trim()) return null;
    const key = buildAvailabilityCacheKey(rawQuery);
    const entry = cache.get(key);
    if (!entry) return null;
    const age = now() - entry.fetchedAt;
    if (age > staleMaxAgeMs) {
      cache.delete(key);
      return null;
    }
    return {
      days: entry.days,
      isStale: age >= freshTtlMs,
      fetchedAt: entry.fetchedAt,
    };
  };

  const getFresh = (rawQuery: BookingAvailabilityQuery): DayAvailabilitySummary[] | null => {
    const result = peek(rawQuery);
    return result && !result.isStale ? result.days : null;
  };

  const attachWaiter = (
    record: InFlightRecord,
    signal?: AbortSignal,
  ): Promise<DayAvailabilitySummary[] | null> => {
    if (signal?.aborted) {
      return Promise.resolve(null);
    }
    record.waiters += 1;
    let released = false;

    const release = (abortIfLast: boolean) => {
      if (released) return;
      released = true;
      record.waiters = Math.max(0, record.waiters - 1);
      if (abortIfLast && record.waiters === 0) {
        if (inFlight.get(record.key) === record) {
          inFlight.delete(record.key);
        }
        record.controller.abort();
      }
    };

    return new Promise((resolve) => {
      const onAbort = () => {
        release(true);
        resolve(null);
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      void record.promise.then(
        (days) => {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          const wasAborted = Boolean(signal?.aborted);
          release(false);
          resolve(wasAborted ? null : days);
        },
        () => {
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          release(false);
          resolve(null);
        },
      );
    });
  };

  const load = (
    rawQuery: BookingAvailabilityQuery,
    loadOptions?: { force?: boolean; signal?: AbortSignal },
  ): Promise<DayAvailabilitySummary[] | null> => {
    const query = normalizeQuery(rawQuery);
    if (!query.serviceId || !query.windowStartDate || loadOptions?.signal?.aborted) {
      return Promise.resolve(null);
    }

    const key = buildAvailabilityCacheKey(query);
    if (!loadOptions?.force) {
      const fresh = getFresh(query);
      if (fresh) {
        return Promise.resolve(fresh);
      }
    }

    const existing = inFlight.get(key);
    if (existing && !existing.invalidated) {
      return attachWaiter(existing, loadOptions?.signal);
    }

    const controller = new AbortController();
    const record: InFlightRecord = {
      key,
      query,
      controller,
      promise: Promise.resolve(null),
      waiters: 0,
      invalidated: false,
    };

    record.promise = (async () => {
      try {
        const days = await fetcher({
          serviceId: query.serviceId,
          extraServiceIds: query.extraServiceIds,
          addonIds: query.addonIds,
          staffId: query.staffId,
          startDate: query.windowStartDate,
          days: DEFAULT_WINDOW_DAYS,
          signal: controller.signal,
        });
        if (controller.signal.aborted || record.invalidated || days === null) {
          return days && !controller.signal.aborted ? days : null;
        }
        cache.delete(key);
        cache.set(key, {
          key,
          query,
          days,
          fetchedAt: now(),
        });
        pruneOverflow();
        return days;
      } catch {
        return null;
      } finally {
        if (inFlight.get(key) === record) {
          inFlight.delete(key);
        }
      }
    })();

    inFlight.set(key, record);
    return attachWaiter(record, loadOptions?.signal);
  };

  const prefetch = (
    rawQuery: BookingAvailabilityQuery,
    prefetchOptions?: { signal?: AbortSignal },
  ): Promise<DayAvailabilitySummary[] | null> => {
    const query = normalizeQuery(rawQuery);
    if (!query.serviceId || !query.windowStartDate || prefetchOptions?.signal?.aborted) {
      return Promise.resolve(null);
    }
    const fresh = getFresh(query);
    if (fresh) {
      return Promise.resolve(fresh);
    }
    return load(query, { signal: prefetchOptions?.signal });
  };

  const invalidate = (filter?: AvailabilityInvalidationFilter): number => {
    let removed = 0;
    for (const [key, entry] of Array.from(cache.entries())) {
      if (matchesInvalidationFilter(entry.query, entry.days, filter)) {
        cache.delete(key);
        removed += 1;
      }
    }
    for (const [key, record] of Array.from(inFlight.entries())) {
      if (matchesInvalidationFilter(record.query, [], filter)) {
        record.invalidated = true;
        inFlight.delete(key);
      }
    }
    return removed;
  };

  const clear = () => {
    cache.clear();
    for (const record of Array.from(inFlight.values())) {
      record.invalidated = true;
      record.controller.abort();
    }
    inFlight.clear();
  };

  const size = () => cache.size;

  return {
    peek,
    getFresh,
    load,
    prefetch,
    invalidate,
    clear,
    size,
  };
}

export function createBookingAvailabilityController(options: {
  store: BookingAvailabilityStore;
  onStateChange: (state: BookingAvailabilityState) => void;
}): BookingAvailabilityController {
  const { store, onStateChange } = options;

  let state: BookingAvailabilityState = EMPTY_AVAILABILITY_STATE;
  let activeQuery: BookingAvailabilityQuery | null = null;
  let activeSelectionPrefix = '';
  let activeController: AbortController | null = null;
  let activeRequestSeq = 0;
  let nextMonthStart: string | null = null;
  let nextMonthKey = '';
  let nextMonthController: AbortController | null = null;
  let candidateController: AbortController | null = null;
  let disposed = false;

  const emit = (next: BookingAvailabilityState) => {
    if (disposed) return;
    if (
      state.activeKey === next.activeKey &&
      state.days === next.days &&
      state.isLoading === next.isLoading &&
      state.isRevalidating === next.isRevalidating
    ) {
      return;
    }
    state = next;
    onStateChange(next);
  };

  const abortNextMonthPrefetch = () => {
    if (nextMonthController) {
      nextMonthController.abort();
      nextMonthController = null;
      nextMonthKey = '';
    }
  };

  const scheduleNextMonthPrefetch = () => {
    if (disposed || !activeQuery || !nextMonthStart) return;
    if (nextMonthStart === activeQuery.windowStartDate) return;
    const nextQuery: BookingAvailabilityQuery = {
      ...activeQuery,
      windowStartDate: nextMonthStart,
    };
    const key = buildAvailabilityCacheKey(nextQuery);
    if (store.getFresh(nextQuery)) return;
    if (nextMonthController && nextMonthKey === key) return;
    abortNextMonthPrefetch();
    const controller = new AbortController();
    nextMonthController = controller;
    nextMonthKey = key;
    void store.prefetch(nextQuery, { signal: controller.signal }).finally(() => {
      if (nextMonthController === controller) {
        nextMonthController = null;
        nextMonthKey = '';
      }
    });
  };

  const runActiveFetch = async (
    query: BookingAvailabilityQuery,
    key: string,
    fetchOptions: { force: boolean; preserveVisibleDays: boolean },
  ): Promise<void> => {
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    const controller = new AbortController();
    activeController = controller;
    const seq = ++activeRequestSeq;

    if (fetchOptions.preserveVisibleDays) {
      emit({
        activeKey: key,
        days: state.activeKey === key ? state.days : [],
        isLoading: false,
        isRevalidating: true,
      });
    } else {
      emit({
        activeKey: key,
        days: [],
        isLoading: true,
        isRevalidating: false,
      });
    }

    const days = await store.load(query, {
      force: fetchOptions.force,
      signal: controller.signal,
    });

    if (disposed || controller.signal.aborted || seq !== activeRequestSeq) {
      return;
    }
    if (activeController === controller) {
      activeController = null;
    }

    emit({
      activeKey: key,
      days: days ?? (fetchOptions.preserveVisibleDays ? state.days : []),
      isLoading: false,
      isRevalidating: false,
    });

    if (days && days.length > 0) {
      scheduleNextMonthPrefetch();
    }
  };

  const activate = async (
    rawQuery: BookingAvailabilityQuery | null,
    activateOptions?: { nextWindowStartDate?: string | null },
  ): Promise<void> => {
    if (disposed) return;
    nextMonthStart = activateOptions?.nextWindowStartDate ?? null;

    if (!rawQuery || !rawQuery.serviceId.trim() || !rawQuery.windowStartDate.trim()) {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      abortNextMonthPrefetch();
      activeQuery = null;
      activeSelectionPrefix = '';
      activeRequestSeq += 1;
      emit(EMPTY_AVAILABILITY_STATE);
      return;
    }

    const query = normalizeQuery(rawQuery);
    const key = buildAvailabilityCacheKey(query);
    const nextPrefix = getSelectionPrefix(query);
    const selectionChanged = nextPrefix !== activeSelectionPrefix;
    const keyChanged = key !== state.activeKey || activeQuery === null;

    activeQuery = query;
    activeSelectionPrefix = nextPrefix;

    if (selectionChanged) {
      abortNextMonthPrefetch();
    }

    const cached = store.peek(query);
    if (cached && !cached.isStale) {
      if (keyChanged && activeController) {
        activeController.abort();
        activeController = null;
        activeRequestSeq += 1;
      }
      emit({
        activeKey: key,
        days: cached.days,
        isLoading: false,
        isRevalidating: false,
      });
      scheduleNextMonthPrefetch();
      return;
    }

    if (!keyChanged && activeController) {
      return;
    }

    if (cached && cached.isStale) {
      emit({
        activeKey: key,
        days: cached.days,
        isLoading: false,
        isRevalidating: true,
      });
      await runActiveFetch(query, key, {
        force: true,
        preserveVisibleDays: true,
      });
      return;
    }

    await runActiveFetch(query, key, {
      force: false,
      preserveVisibleDays: false,
    });
  };

  const prefetchWindow = async (rawQuery: BookingAvailabilityQuery): Promise<void> => {
    if (disposed) return;
    const query = normalizeQuery(rawQuery);
    if (!query.serviceId || !query.windowStartDate) return;
    if (store.getFresh(query)) return;
    if (candidateController) {
      candidateController.abort();
      candidateController = null;
    }
    const controller = new AbortController();
    candidateController = controller;
    await store.prefetch(query, { signal: controller.signal }).finally(() => {
      if (candidateController === controller) {
        candidateController = null;
      }
    });
  };

  const revalidateActive = async (): Promise<void> => {
    if (disposed || !activeQuery) return;
    const key = buildAvailabilityCacheKey(activeQuery);
    store.invalidate({
      staffId: activeQuery.staffId === 'any' ? undefined : activeQuery.staffId,
    });
    const hasVisibleDays = state.activeKey === key && state.days.length > 0;
    await runActiveFetch(activeQuery, key, {
      force: true,
      preserveVisibleDays: hasVisibleDays,
    });
  };

  const invalidateFromRealtime = (filter?: AvailabilityInvalidationFilter): boolean => {
    if (disposed) return false;
    store.invalidate(filter);
    if (!activeQuery) return false;
    const affected = matchesInvalidationFilter(activeQuery, state.days, filter);
    if (!affected) return false;
    const key = buildAvailabilityCacheKey(activeQuery);
    const hasVisibleDays = state.activeKey === key && state.days.length > 0;
    void runActiveFetch(activeQuery, key, {
      force: true,
      preserveVisibleDays: hasVisibleDays,
    });
    return true;
  };

  const dispose = () => {
    disposed = true;
    activeRequestSeq += 1;
    if (activeController) {
      activeController.abort();
      activeController = null;
    }
    abortNextMonthPrefetch();
    if (candidateController) {
      candidateController.abort();
      candidateController = null;
    }
  };

  return {
    getState: () => state,
    activate,
    prefetchWindow,
    invalidateFromRealtime,
    revalidateActive,
    dispose,
  };
}

const sharedAvailabilityStore = createBookingAvailabilityStore();

interface UseBookingAvailabilityParams {
  serviceId: string | null;
  extraServiceIds: readonly string[];
  addonIds: readonly string[];
  staffId: string;
  windowStartDate: string;
  nextWindowStartDate?: string | null;
}

interface UseBookingAvailabilityResult {
  days: DayAvailabilitySummary[];
  isLoading: boolean;
  isRevalidating: boolean;
  prefetchWindow: (query: BookingAvailabilityQuery) => void;
  invalidateFromRealtime: (filter?: AvailabilityInvalidationFilter) => boolean;
  revalidateActive: () => void;
}

export function useBookingAvailability(
  params: UseBookingAvailabilityParams,
): UseBookingAvailabilityResult {
  const serviceId = params.serviceId?.trim() ?? '';
  const sortedExtraKey = normalizeUniqueSortedIds(params.extraServiceIds, serviceId).join(',');
  const sortedAddonKey = normalizeUniqueSortedIds(params.addonIds).join(',');
  const staffId = params.staffId.trim() || 'any';
  const windowStartDate = params.windowStartDate.trim();
  const nextWindowStartDate = params.nextWindowStartDate?.trim() || null;

  const query = useMemo<BookingAvailabilityQuery | null>(() => {
    if (!serviceId || !windowStartDate) return null;
    return {
      serviceId,
      extraServiceIds: sortedExtraKey ? sortedExtraKey.split(',') : [],
      addonIds: sortedAddonKey ? sortedAddonKey.split(',') : [],
      staffId,
      windowStartDate,
    };
  }, [serviceId, sortedExtraKey, sortedAddonKey, staffId, windowStartDate]);

  const queryKey = query ? buildAvailabilityCacheKey(query) : '';

  const [snapshot, setSnapshot] = useState<BookingAvailabilityState>(() => {
    if (!query) return EMPTY_AVAILABILITY_STATE;
    const cached = sharedAvailabilityStore.peek(query);
    if (cached) {
      return {
        activeKey: queryKey,
        days: cached.days,
        isLoading: false,
        isRevalidating: cached.isStale,
      };
    }
    return {
      activeKey: queryKey,
      days: [],
      isLoading: true,
      isRevalidating: false,
    };
  });

  const controllerRef = useRef<BookingAvailabilityController | null>(null);

  useEffect(() => {
    const controller = createBookingAvailabilityController({
      store: sharedAvailabilityStore,
      onStateChange: setSnapshot,
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    void controller.activate(query, { nextWindowStartDate });
  }, [query, nextWindowStartDate]);

  const prefetchWindow = useCallback((targetQuery: BookingAvailabilityQuery) => {
    const controller = controllerRef.current;
    if (!controller) {
      void sharedAvailabilityStore.prefetch(targetQuery);
      return;
    }
    void controller.prefetchWindow(targetQuery);
  }, []);

  const invalidateFromRealtime = useCallback(
    (filter?: AvailabilityInvalidationFilter): boolean => {
      const controller = controllerRef.current;
      if (!controller) {
        return sharedAvailabilityStore.invalidate(filter) > 0;
      }
      return controller.invalidateFromRealtime(filter);
    },
    [],
  );

  const revalidateActive = useCallback(() => {
    void controllerRef.current?.revalidateActive();
  }, []);

  const syncCached = query ? sharedAvailabilityStore.peek(query) : null;
  const effectiveState: BookingAvailabilityState = !query
    ? EMPTY_AVAILABILITY_STATE
    : snapshot.activeKey === queryKey
      ? snapshot
      : syncCached
        ? {
            activeKey: queryKey,
            days: syncCached.days,
            isLoading: false,
            isRevalidating: syncCached.isStale,
          }
        : {
            activeKey: queryKey,
            days: [],
            isLoading: true,
            isRevalidating: false,
          };

  return {
    days: effectiveState.days,
    isLoading: effectiveState.isLoading,
    isRevalidating: effectiveState.isRevalidating,
    prefetchWindow,
    invalidateFromRealtime,
    revalidateActive,
  };
}
