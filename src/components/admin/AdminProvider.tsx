'use client';

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminOverviewPayload } from '@/lib/admin/overview-types';
import {
  ADMIN_CACHE_KEYS,
  AdminFetchError,
  fetchAdminCached,
  fetchAdminJson,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  invalidateAdminDomain,
  mutateAdminCache,
  setAdminCacheScope,
} from '@/lib/hooks/useAdminCache';
import { useAdminProviderSync } from '@/lib/hooks/useAdminProviderSync';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import type { BookingWithRelations } from '@/lib/types';
import { useSalonAppearance } from '../SalonThemeProvider';

export type { AdminOverviewPayload } from '@/lib/admin/overview-types';

interface AdminContextValue {
  data: AdminOverviewPayload | null;
  loading: boolean;
  error: string | null;
  bookingEventSeq: number;
  refresh: () => Promise<void>;
  dismissError: () => void;
  switchDemoUser: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

function isAbortFailure(err: unknown): boolean {
  return (
    (err instanceof Error && err.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'AbortError')
  );
}

export function useAdminData() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminData must be used within AdminProvider');
  return ctx;
}

export function AdminProvider({
  initialData = null,
  children,
}: {
  initialData?: AdminOverviewPayload | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === '/admin/login';
  const { setSettingsOverride } = useSalonAppearance();
  const [data, setData] = useState<AdminOverviewPayload | null>(initialData);
  const [loading, setLoading] = useState(!initialData && !isLoginRoute);
  const [error, setError] = useState<string | null>(null);
  const [bookingEventSeq, setBookingEventSeq] = useState(0);

  const applyPayload = useCallback(
    (next: AdminOverviewPayload) => {
      setData(next);
      setLoading(false);
      setError(null);
      setSettingsOverride(next.settings);
      if (getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) !== next) {
        mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, next);
      }
      const cachedBookings = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
      );
      if (cachedBookings?.bookings !== next.bookings) {
        mutateAdminCache<{ bookings: BookingWithRelations[] }>(ADMIN_CACHE_KEYS.bookings, {
          bookings: next.bookings,
        });
      }
    },
    [setSettingsOverride],
  );

  useAdminProviderSync({
    initialData,
    currentData: data,
    onHydrateInitial: applyPayload,
    onSyncSettings: setSettingsOverride,
  });

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      try {
        const json = await fetchAdminCached<AdminOverviewPayload>(
          ADMIN_CACHE_KEYS.overview,
          (fetchSignal) =>
            fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, fetchSignal),
          { force: true, signal },
        );
        if (signal?.aborted) return;
        applyPayload(json);
      } catch (err: unknown) {
        if (signal?.aborted || isAbortFailure(err)) return;
        if (err instanceof AdminFetchError && err.status === 401) {
          invalidateAdminCache();
          setAdminCacheScope(null);
          setData(null);
          setError(null);
          router.push('/admin/login');
          return;
        }
        setError(
          err instanceof Error && err.message.trim()
            ? err.message
            : 'No pudimos cargar el panel del salón. Intenta de nuevo.',
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [applyPayload, router],
  );

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  const syncKey = isLoginRoute
    ? 'admin-login'
    : data !== null
      ? 'admin-overview-hydrated'
      : 'admin-overview-fetch';

  useExternalSync(
    syncKey,
    useCallback(
      async (signal, key) => {
        if (key === 'admin-login' || key === 'admin-overview-hydrated') {
          setLoading(false);
          return;
        }
        setLoading(true);
        await refresh(signal);
      },
      [refresh],
    ),
  );

  useRealtimeSubscription(
    useCallback(
      (evt) => {
        if (evt.type === 'connected') return;
        if (
          evt.type === 'slot_changed' ||
          evt.type === 'booking_created' ||
          evt.type === 'booking_updated'
        ) {
          setBookingEventSeq((prev) => prev + 1);
          invalidateAdminDomain('bookings');
        } else if (
          evt.type === 'schedule_changed' ||
          evt.type === 'availability_updated'
        ) {
          invalidateAdminDomain('availability');
        } else if (evt.type === 'settings_updated') {
          invalidateAdminDomain('settings');
        } else {
          invalidateAdminDomain('bookings');
        }
        void refresh();
      },
      [refresh],
    ),
    450,
    !isLoginRoute && Boolean(data),
  );

  const switchDemoUser = useCallback(
    async (email: string) => {
      setError(null);
      const res = await fetchJsonWithTimeout<{ error?: string }>('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        setError(res.error || 'No se pudo cambiar de cuenta de prueba. Intenta de nuevo.');
        return;
      }
      invalidateAdminCache();
      setAdminCacheScope(null);
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetchJsonWithTimeout<unknown>('/api/admin/session', { method: 'DELETE' });
    invalidateAdminCache();
    setAdminCacheScope(null);
    setData(null);
    setError(null);
    router.push('/admin/login');
  }, [router]);

  const contextValue = useMemo<AdminContextValue>(
    () => ({
      data,
      loading,
      error,
      bookingEventSeq,
      refresh,
      dismissError,
      switchDemoUser,
      logout,
    }),
    [data, loading, error, bookingEventSeq, refresh, dismissError, switchDemoUser, logout],
  );

  return (
    <AdminContext.Provider value={contextValue}>
      {children}
    </AdminContext.Provider>
  );
}
