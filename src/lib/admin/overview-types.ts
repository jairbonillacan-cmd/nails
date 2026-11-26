import type { RuntimeIntegrationStatus } from '@/lib/env';
import type { PublicLoyaltySummaryDTO } from '@/lib/public-dto';
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
  WhatsAppMonthlyUsageSummary,
  WhatsAppTemplateConfig,
} from '@/lib/types';

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
  whatsappUsage?: WhatsAppMonthlyUsageSummary;
  whatsappTemplates?: WhatsAppTemplateConfig[];
}
