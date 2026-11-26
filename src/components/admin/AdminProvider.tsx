'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { AdminOverviewPayload } from '@/lib/admin/overview-types';
import {
  ADMIN_CACHE_KEYS,
  mutateAdminCache,
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
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, next);
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(ADMIN_CACHE_KEYS.bookings, {
        bookings: next.bookings,
      });
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
        const res = await fetch('/api/admin/overview', {
          cache: 'no-store',
          signal,
        });
        if (signal?.aborted) return;
        if (res.status === 401) {
          setData(null);
          router.push('/admin/login');
          return;
        }
        if (res.ok) {
          const json = (await res.json()) as AdminOverviewPayload;
          applyPayload(json);
        }
      } catch {
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

  const switchDemoUser = async (email: string) => {
    await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    await refresh();
  };

  const logout = async () => {
    await fetch('/api/admin/session', { method: 'DELETE' });
    setData(null);
    router.push('/admin/login');
  };

  return (
    <AdminContext.Provider
      value={{ data, loading, bookingEventSeq, refresh, switchDemoUser, logout }}
    >
      {children}
    </AdminContext.Provider>
  );
}
