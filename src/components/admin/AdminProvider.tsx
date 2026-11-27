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
  mutateAdminCache,
  setAdminCacheScope,
} from '@/lib/hooks/useAdminCache';
import { useAdminProviderSync } from '@/lib/hooks/useAdminProviderSync';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';
import type { BookingWithRelations } from '@/lib/types';
import { useSalonAppearance } from '../SalonThemeProvider';

export type { AdminOverviewPayload } from '@/lib/admin/overview-types';

interface AdminContextValue {
  data: AdminOverviewPayload | null;
  loading: boolean;
  bookingEventSeq: number;
  refresh: () => Promise<void>;
  switchDemoUser: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextValue | null>(null);

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
  const [bookingEventSeq, setBookingEventSeq] = useState(0);

  const applyPayload = useCallback(
    (next: AdminOverviewPayload) => {
      setData(next);
      setLoading(false);
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
        if (signal?.aborted) return;
        if (err instanceof AdminFetchError && err.status === 401) {
          invalidateAdminCache();
          setAdminCacheScope(null);
          setData(null);
          router.push('/admin/login');
        }
        return;
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [applyPayload, router],
  );

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
        if (evt.type !== 'connected') {
          if (evt.type === 'slot_changed' || evt.type === 'booking_created') {
            setBookingEventSeq((prev) => prev + 1);
          }
          void refresh();
        }
      },
      [refresh],
    ),
    450,
    !isLoginRoute && Boolean(data),
  );

  const switchDemoUser = useCallback(
    async (email: string) => {
      try {
        const res = await fetch('/api/admin/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (!res.ok) return;
        invalidateAdminCache();
        setAdminCacheScope(null);
        await refresh();
      } catch {
        return;
      }
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await fetch('/api/admin/session', { method: 'DELETE' });
    } catch {
      void 0;
    }
    invalidateAdminCache();
    setAdminCacheScope(null);
    setData(null);
    router.push('/admin/login');
  }, [router]);

  const contextValue = useMemo<AdminContextValue>(
    () => ({
      data,
      loading,
      bookingEventSeq,
      refresh,
      switchDemoUser,
      logout,
    }),
    [data, loading, bookingEventSeq, refresh, switchDemoUser, logout],
  );

  return (
    <AdminContext.Provider value={contextValue}>
      {children}
    </AdminContext.Provider>
  );
}
