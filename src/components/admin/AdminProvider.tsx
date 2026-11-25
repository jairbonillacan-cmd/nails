'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AdminUser,
  AvailabilitySchedule,
  BookingReview,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  Coupon,
  DateOverride,
  GalleryItem,
  InventoryItem,
  InventoryMovement,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
  Service,
  ServiceAddon,
  ServiceCategory,
  StaffMember,
  WaitlistEntry,
} from '@/lib/types';
import type { RuntimeIntegrationStatus } from '@/lib/env';
import { useSalonAppearance } from '../SalonThemeProvider';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription';

export interface AdminOverviewPayload {
  session: { user: AdminUser; isDemo: boolean };
  integration: RuntimeIntegrationStatus;
  serverNowIso: string;
  serverTodayKey: string;
  settings: SalonSettings;
  kpis: {
    todayBookingsCount: number;
    pendingConfirmationsCount: number;
    totalRevenueCents: number;
    totalTipsCents: number;
    totalExpensesCents: number;
    netCashCents: number;
    lowStockCount: number;
    waitlistCount: number;
    noShowRatePercent: number;
    avgRating: number;
    reviewsCount: number;
  };
  bookings: BookingWithRelations[];
  services: Service[];
  categories: ServiceCategory[];
  addons: ServiceAddon[];
  staff: StaffMember[];
  adminUsers: AdminUser[];
  schedules: AvailabilitySchedule[];
  dateOverrides: DateOverride[];
  calendarConnections: CalendarConnection[];
  clients: ClientProfile[];
  workflows: NotificationWorkflow[];
  notifications: ScheduledNotification[];
  gallery: GalleryItem[];
  coupons: Coupon[];
  waitlist: WaitlistEntry[];
  reviews: BookingReview[];
  inventory: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  cashEntries: CashRegisterEntry[];
}

interface AdminContextValue {
  data: AdminOverviewPayload | null;
  loading: boolean;
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

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setSettingsOverride } = useSalonAppearance();
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);

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
          setData(json);
          setSettingsOverride(json.settings);
        }
      } catch {
        return;
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [router, setSettingsOverride],
  );

  useExternalSync('admin-overview', refresh);

  useRealtimeSubscription(
    useCallback(
      (evt) => {
        if (evt.type !== 'connected') {
          void refresh();
        }
      },
      [refresh],
    ),
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
    <AdminContext.Provider value={{ data, loading, refresh, switchDemoUser, logout }}>
      {children}
    </AdminContext.Provider>
  );
}
