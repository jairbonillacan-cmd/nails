'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { getDateKeyInTimezone } from '@/lib/format';
import type { BookingStatus, BookingWithRelations } from '@/lib/types';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';

export const ADMIN_CACHE_KEYS = {
  overview: '/api/admin/overview',
  bookings: '/api/admin/bookings',
  clients: '/api/admin/clients',
  clientsInactive: (days: number) => `/api/admin/clients?inactiveDays=${days}`,
  operations: '/api/admin/operations',
  packages: '/api/admin/packages',
  campaigns: '/api/admin/campaigns?birthdayWindowDays=7&inactiveDays=45',
  reports: (period: string) => `/api/admin/reports?period=${encodeURIComponent(period)}`,
} as const;

class AdminFetchError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = 'AdminFetchError';
    this.status = status;
    this.code = code;
  }
}

export async function fetchAdminJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      code?: string;
    } | null;
    throw new AdminFetchError(
      body?.error || `Error HTTP ${res.status}`,
      res.status,
      body?.code ?? null,
    );
  }
  return (await res.json()) as T;
}

interface CacheEntry<T> {
  data: T | undefined;
  hasData: boolean;
  error: Error | null;
  isValidating: boolean;
  updatedAt: number;
  scope: string;
}

interface InFlightEntry {
  promise: Promise<unknown>;
  controller: AbortController;
  scope: string;
  consumers: number;
  isPrefetch: boolean;
}

let activeScope: string | null = null;
const cacheStore = new Map<string, CacheEntry<unknown>>();
const inFlightStore = new Map<string, InFlightEntry>();
const keyListeners = new Map<string, Set<() => void>>();

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  );
}

function notifyKey(key: string): void {
  const listeners = keyListeners.get(key);
  if (!listeners) return;
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

function notifyAll(): void {
  for (const listeners of Array.from(keyListeners.values())) {
    for (const listener of Array.from(listeners)) {
      listener();
    }
  }
}

function subscribeKey(key: string, listener: () => void): () => void {
  let listeners = keyListeners.get(key);
  if (!listeners) {
    listeners = new Set();
    keyListeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = keyListeners.get(key);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) {
      keyListeners.delete(key);
    }
  };
}

export function setAdminCacheScope(nextScope: string | null): void {
  if (nextScope === activeScope) return;
  for (const entry of Array.from(inFlightStore.values())) {
    entry.controller.abort();
  }
  inFlightStore.clear();
  cacheStore.clear();
  activeScope = nextScope;
  notifyAll();
}

export function getAdminCacheSnapshot<T>(key: string): T | undefined {
  const entry = cacheStore.get(key);
  if (!entry || !entry.hasData) return undefined;
  return entry.data as T;
}

function getCacheRecord<T>(key: string): CacheEntry<T> | undefined {
  return cacheStore.get(key) as CacheEntry<T> | undefined;
}

export function mutateAdminCache<T>(
  key: string,
  updater: T | ((previous: T | undefined) => T | undefined),
): T | undefined {
  const existing = cacheStore.get(key);
  const previous = existing?.hasData ? (existing.data as T) : undefined;
  const next =
    typeof updater === 'function'
      ? (updater as (prev: T | undefined) => T | undefined)(previous)
      : updater;

  if (next === undefined) {
    cacheStore.delete(key);
  } else {
    cacheStore.set(key, {
      data: next,
      hasData: true,
      error: null,
      isValidating: existing?.isValidating ?? false,
      updatedAt: Date.now(),
      scope: activeScope ?? '',
    });
  }
  notifyKey(key);
  return next;
}

export function invalidateAdminCache(prefix?: string): void {
  if (!prefix) {
    for (const entry of Array.from(inFlightStore.values())) {
      entry.controller.abort();
    }
    inFlightStore.clear();
    cacheStore.clear();
    notifyAll();
    return;
  }

  const touched = new Set<string>();
  for (const key of Array.from(cacheStore.keys())) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
      touched.add(key);
    }
  }
  for (const [key, entry] of Array.from(inFlightStore.entries())) {
    if (key.startsWith(prefix)) {
      entry.controller.abort();
      inFlightStore.delete(key);
      touched.add(key);
    }
  }
  for (const key of Array.from(touched)) {
    notifyKey(key);
  }
}

export function clearAdminCacheForTests(): void {
  for (const entry of Array.from(inFlightStore.values())) {
    entry.controller.abort();
  }
  inFlightStore.clear();
  cacheStore.clear();
  keyListeners.clear();
  activeScope = null;
}

function runCachedFetch<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: { force?: boolean; staleTimeMs?: number; isPrefetch?: boolean },
): { promise: Promise<T>; release: () => void } {
  const requestScope = activeScope ?? '';
  const staleTimeMs = options.staleTimeMs ?? 0;

  if (!options.force && staleTimeMs > 0) {
    const existing = cacheStore.get(key);
    if (
      existing &&
      existing.hasData &&
      existing.scope === requestScope &&
      Date.now() - existing.updatedAt < staleTimeMs
    ) {
      return {
        promise: Promise.resolve(existing.data as T),
        release: () => undefined,
      };
    }
  }

  const existingInFlight = inFlightStore.get(key);
  if (
    existingInFlight &&
    existingInFlight.scope === requestScope &&
    !existingInFlight.controller.signal.aborted
  ) {
    if (!options.isPrefetch) {
      existingInFlight.consumers += 1;
    }
    return {
      promise: existingInFlight.promise as Promise<T>,
      release: () => {
        if (options.isPrefetch) return;
        existingInFlight.consumers = Math.max(0, existingInFlight.consumers - 1);
        if (existingInFlight.consumers === 0 && !existingInFlight.isPrefetch) {
          existingInFlight.controller.abort();
          if (inFlightStore.get(key) === existingInFlight) {
            inFlightStore.delete(key);
          }
          const latest = cacheStore.get(key);
          if (latest && latest.isValidating) {
            cacheStore.set(key, { ...latest, isValidating: false });
            notifyKey(key);
          }
        }
      },
    };
  }

  const controller = new AbortController();
  const prevRecord = cacheStore.get(key);
  cacheStore.set(key, {
    data: prevRecord?.hasData ? prevRecord.data : undefined,
    hasData: Boolean(prevRecord?.hasData),
    error: prevRecord?.error ?? null,
    isValidating: true,
    updatedAt: prevRecord?.updatedAt ?? 0,
    scope: requestScope,
  });
  notifyKey(key);

  let rawPromise: Promise<T>;
  try {
    rawPromise = fetcher(controller.signal);
  } catch (err: unknown) {
    rawPromise = Promise.reject(err);
  }

  const entry: InFlightEntry = {
    promise: Promise.resolve(),
    controller,
    scope: requestScope,
    consumers: options.isPrefetch ? 0 : 1,
    isPrefetch: Boolean(options.isPrefetch),
  };

  const promise = rawPromise
    .then((data) => {
      if (!controller.signal.aborted && (activeScope ?? '') === requestScope) {
        cacheStore.set(key, {
          data,
          hasData: true,
          error: null,
          isValidating: false,
          updatedAt: Date.now(),
          scope: requestScope,
        });
        notifyKey(key);
      }
      return data;
    })
    .catch((err: unknown) => {
      if (!controller.signal.aborted && (activeScope ?? '') === requestScope) {
        const latest = cacheStore.get(key);
        const nextError =
          !options.isPrefetch && !isAbortError(err)
            ? err instanceof Error
              ? err
              : new Error('Error de conexión')
            : (latest?.error ?? null);
        cacheStore.set(key, {
          data: latest?.hasData ? latest.data : undefined,
          hasData: Boolean(latest?.hasData),
          error: nextError,
          isValidating: false,
          updatedAt: latest?.updatedAt ?? 0,
          scope: requestScope,
        });
        notifyKey(key);
      }
      throw err;
    })
    .finally(() => {
      if (inFlightStore.get(key) === entry) {
        inFlightStore.delete(key);
      }
    });

  entry.promise = promise;
  inFlightStore.set(key, entry);

  return {
    promise,
    release: () => {
      if (options.isPrefetch) return;
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (entry.consumers === 0 && !entry.isPrefetch) {
        controller.abort();
        if (inFlightStore.get(key) === entry) {
          inFlightStore.delete(key);
        }
        const latest = cacheStore.get(key);
        if (latest && latest.isValidating) {
          cacheStore.set(key, { ...latest, isValidating: false });
          notifyKey(key);
        }
      }
    },
  };
}

export async function prefetchAdminData<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: { staleTimeMs?: number },
): Promise<T | undefined> {
  try {
    const { promise } = runCachedFetch(key, fetcher, {
      staleTimeMs: options?.staleTimeMs ?? 5_000,
      isPrefetch: true,
    });
    return await promise;
  } catch {
    return undefined;
  }
}

export interface UseAdminCachedQueryOptions<T> {
  enabled?: boolean;
  initialData?: T;
  staleTimeMs?: number;
  revalidateKey?: string | number;
}

export interface UseAdminCachedQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  revalidate: () => Promise<T | undefined>;
  mutate: (
    updater: T | ((previous: T | undefined) => T | undefined),
  ) => T | undefined;
}

export function useAdminCachedQuery<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  options?: UseAdminCachedQueryOptions<T>,
): UseAdminCachedQueryResult<T> {
  const enabled = options?.enabled ?? true;
  const staleTimeMs = options?.staleTimeMs ?? 0;
  const revalidateKey = options?.revalidateKey ?? 0;
  const fetcherRef = useRef(fetcher);
  const lastRevalidateKeyRef = useRef<string | number>(revalidateKey);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      key ? subscribeKey(key, onStoreChange) : () => undefined,
    [key],
  );

  const getSnapshot = useCallback(
    (): CacheEntry<T> | undefined => (key ? getCacheRecord<T>(key) : undefined),
    [key],
  );

  const getServerSnapshot = useCallback((): CacheEntry<T> | undefined => undefined, []);

  const record = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const data = record?.hasData ? record.data : options?.initialData;
  const error = record?.error ?? null;
  const isValidating = Boolean(enabled && key && record?.isValidating);

  useEffect(() => {
    const force = lastRevalidateKeyRef.current !== revalidateKey;
    lastRevalidateKeyRef.current = revalidateKey;

    if (!enabled || !key) {
      return;
    }

    const { promise, release } = runCachedFetch(
      key,
      (signal) => fetcherRef.current(signal),
      { force, staleTimeMs },
    );
    void promise.catch(() => undefined);

    return () => {
      release();
    };
  }, [enabled, key, revalidateKey, staleTimeMs]);

  const revalidate = useCallback(async (): Promise<T | undefined> => {
    if (!key) return undefined;
    try {
      const { promise } = runCachedFetch(
        key,
        (signal) => fetcherRef.current(signal),
        { force: true },
      );
      return await promise;
    } catch {
      return undefined;
    }
  }, [key]);

  const mutate = useCallback(
    (updater: T | ((previous: T | undefined) => T | undefined)): T | undefined => {
      if (!key) return undefined;
      return mutateAdminCache<T>(key, updater);
    },
    [key],
  );

  const isLoading = Boolean(enabled && key && data === undefined && error === null);

  return {
    data,
    error,
    isLoading,
    isValidating,
    revalidate,
    mutate,
  };
}

export function useAdminCacheSessionSync(
  scopeKey: string | null,
  overviewData: AdminOverviewPayload | null,
): void {
  const lastSeededScopeRef = useRef<string | null>(null);
  const lastSeededOverviewRef = useRef<AdminOverviewPayload | null>(null);

  useEffect(() => {
    if (lastSeededScopeRef.current !== scopeKey) {
      lastSeededScopeRef.current = scopeKey;
      lastSeededOverviewRef.current = null;
      setAdminCacheScope(scopeKey);
    }

    if (scopeKey && overviewData && lastSeededOverviewRef.current !== overviewData) {
      lastSeededOverviewRef.current = overviewData;
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, overviewData);
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(ADMIN_CACHE_KEYS.bookings, {
        bookings: overviewData.bookings,
      });
    }
  }, [scopeKey, overviewData]);
}

export function applyOptimisticBookingStatus(
  overview: AdminOverviewPayload,
  bookingId: string,
  nextStatus: BookingStatus,
): AdminOverviewPayload {
  const tz = overview.settings.timezone || 'America/Mexico_City';
  const todayKey =
    overview.serverTodayKey || getDateKeyInTimezone(new Date(overview.serverNowIso), tz);

  const nextBookings = overview.bookings.map((booking) =>
    booking.id === bookingId ? { ...booking, status: nextStatus } : booking,
  );

  const isStillPending =
    nextStatus === 'pending_confirmation' || nextStatus === 'pending_payment';
  const nextPendingDeposits = isStillPending
    ? overview.pendingDeposits.map((dep) =>
        dep.bookingId === bookingId ? { ...dep, status: nextStatus } : dep,
      )
    : overview.pendingDeposits.filter((dep) => dep.bookingId !== bookingId);

  const nextUncollected =
    nextStatus === 'canceled' || nextStatus === 'no_show'
      ? overview.uncollectedBookings.filter((item) => item.bookingId !== bookingId)
      : overview.uncollectedBookings.map((item) =>
          item.bookingId === bookingId ? { ...item, status: nextStatus } : item,
        );

  const todayBookingsCount = nextBookings.filter(
    (b) =>
      getDateKeyInTimezone(new Date(b.startAt), tz) === todayKey &&
      b.status !== 'canceled',
  ).length;
  const pendingConfirmationsCount = nextBookings.filter(
    (b) => b.status === 'pending_confirmation' || b.status === 'pending_payment',
  ).length;
  const completedCount = nextBookings.filter((b) => b.status === 'completed').length;
  const noShowCount = nextBookings.filter((b) => b.status === 'no_show').length;
  const noShowRatePercent =
    completedCount + noShowCount > 0
      ? Math.round((noShowCount / (completedCount + noShowCount)) * 100)
      : 0;

  return {
    ...overview,
    bookings: nextBookings,
    pendingDeposits: nextPendingDeposits,
    uncollectedBookings: nextUncollected,
    kpis: {
      ...overview.kpis,
      todayBookingsCount,
      pendingConfirmationsCount,
      noShowRatePercent,
    },
  };
}

export function applyOptimisticBookingStatusToList(
  payload: { bookings: BookingWithRelations[] },
  bookingId: string,
  nextStatus: BookingStatus,
): { bookings: BookingWithRelations[] } {
  return {
    bookings: payload.bookings.map((booking) =>
      booking.id === bookingId ? { ...booking, status: nextStatus } : booking,
    ),
  };
}

interface QuickSearchKeyboardNavOptions {
  isOpen: boolean;
  itemCount: number;
  inputRef: RefObject<HTMLInputElement | null>;
  onMove: (delta: -1 | 1 | 'first' | 'last') => void;
  onSelectActive: () => void;
  onClose: () => void;
}

export function useQuickSearchKeyboardNav({
  isOpen,
  itemCount,
  inputRef,
  onMove,
  onSelectActive,
  onClose,
}: QuickSearchKeyboardNavOptions): void {
  const callbacksRef = useRef({ onMove, onSelectActive, onClose, itemCount });

  useEffect(() => {
    callbacksRef.current = { onMove, onSelectActive, onClose, itemCount };
  }, [onMove, onSelectActive, onClose, itemCount]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const focusInput = () => {
      inputRef.current?.focus();
    };
    focusInput();
    const rafId = window.requestAnimationFrame(focusInput);

    const handleKeyDown = (event: KeyboardEvent) => {
      const {
        onMove: move,
        onSelectActive: selectActive,
        onClose: close,
        itemCount: count,
      } = callbacksRef.current;

      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (count <= 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
        focusInput();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
        focusInput();
        return;
      }

      if (event.key === 'Home' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        move('first');
        focusInput();
        return;
      }

      if (event.key === 'End' && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        move('last');
        focusInput();
        return;
      }

      if (
        event.key === 'Enter' &&
        !(event.target instanceof HTMLButtonElement) &&
        !(event.target instanceof HTMLAnchorElement)
      ) {
        event.preventDefault();
        selectActive();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, inputRef]);
}
