'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AdminUser,
  AuditLogEntry,
  AvailabilitySchedule,
  BookingReview,
  BookingStatus,
  BookingWithRelations,
  CalendarConnection,
  CashRegisterEntry,
  ClientProfile,
  Coupon,
  DateOverride,
  GalleryItem,
  InventoryItem,
  InventoryMovement,
  LoyaltyProgram,
  LoyaltyStamp,
  NotificationWorkflow,
  PaymentSplit,
  RecurringBlock,
  SalonSettings,
  ScheduledNotification,
  Service,
  ServiceAddon,
  ServiceCategory,
  StaffMember,
  WaitlistEntry,
} from '@/lib/types';
import type { PublicLoyaltySummaryDTO } from '@/lib/public-dto';
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
  onboardingChecklist: {
    completedCount: number;
    totalCount: number;
    steps: Array<{
      id: string;
      label: string;
      href: string;
      done: boolean;
    }>;
  };
  pendingDeposits: Array<{
    bookingId: string;
    bookingCode: string;
    status: BookingStatus;
    clientId: string;
    clientName: string;
    clientPhone: string;
    clientInstagram: string | null;
    serviceName: string;
    staffId: string;
    staffName: string;
    startAt: string;
    depositAmountCents: number;
    totalPriceCents: number;
    proofDeliveryMethod: 'web_upload' | 'instagram_dm' | 'none';
    paymentProofUrl: string | null;
  }>;
  retention: {
    returningClientsCount: number;
    inactiveClients: Array<{
      clientId: string;
      fullName: string;
      phoneE164: string;
      instagramHandle: string | null;
      lastVisitAt: string;
      daysSinceLastVisit: number;
      totalVisits: number;
    }>;
  };
  uncollectedBookings: Array<{
    bookingId: string;
    bookingCode: string;
    status: BookingStatus;
    clientId: string;
    clientName: string;
    clientPhone: string;
    clientInstagram: string | null;
    serviceName: string;
    staffId: string;
    staffName: string;
    startAt: string;
    endAt: string;
    totalPriceCents: number;
    paidCents: number;
    remainingCents: number;
  }>;
  nearRewardClients: Array<{
    clientId: string;
    fullName: string;
    phoneE164: string;
    instagramHandle: string | null;
    summary: PublicLoyaltySummaryDTO;
  }>;
  paymentSplits: PaymentSplit[];
  recurringBlocks: RecurringBlock[];
  loyaltyProgram: LoyaltyProgram | null;
  loyaltyStamps: LoyaltyStamp[];
  recentAuditLogs: AuditLogEntry[];
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

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { setSettingsOverride } = useSalonAppearance();
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingEventSeq, setBookingEventSeq] = useState(0);

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
          if (evt.type === 'slot_changed' || evt.type === 'booking_created') {
            setBookingEventSeq((prev) => prev + 1);
          }
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
    <AdminContext.Provider
      value={{ data, loading, bookingEventSeq, refresh, switchDemoUser, logout }}
    >
      {children}
    </AdminContext.Provider>
  );
}
