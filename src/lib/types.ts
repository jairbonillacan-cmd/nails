export type AdminRole = 'owner' | 'admin' | 'specialist';

export type BookingStatus =
  | 'pending_payment'
  | 'pending_confirmation'
  | 'confirmed'
  | 'completed'
  | 'canceled'
  | 'no_show';

export type BookingSource = 'web' | 'whatsapp' | 'manual' | 'walk_in';

export type BookingLayoutView = 'month' | 'week' | 'column';
export type ThemeModePreference = 'light' | 'dark' | 'system';
export type CornerStyle = 'sharp' | 'soft' | 'rounded' | 'pill';
export type PaymentMode = 'none' | 'manual_transfer' | 'stripe' | 'mercadopago';
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'gift_card';
export type PaymentSplitMethod = 'cash' | 'card' | 'transfer' | 'giftcard' | 'online';
export type NotificationChannel = 'email' | 'whatsapp' | 'sms';
export type AuditAction =
  | 'booking_canceled'
  | 'booking_price_override'
  | 'csv_exported'
  | 'past_booking_override'
  | 'deposit_approved'
  | 'loyalty_redeemed'
  | 'media_retention_warned'
  | 'media_retention_purged';

export interface LandingFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface LandingSectionToggles {
  showMarquee?: boolean;
  showHeroRating?: boolean;
  showMenu?: boolean;
  showCreations?: boolean;
  showReviews?: boolean;
  showTeam?: boolean;
  showConnect?: boolean;
  showFaq?: boolean;
  showVisit?: boolean;
  showMapEmbed?: boolean;
}

export interface LandingContent {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  aboutTitle: string;
  aboutBody: string;
  heroPrimaryCta?: string;
  heroSecondaryCta?: string;
  heroImageDesktopUrl?: string | null;
  heroImageMobileUrl?: string | null;
  marqueeItems?: string[];
  menuTitle?: string;
  menuBannerText?: string;
  creationsTitle?: string;
  creationsSubtitle?: string;
  galleryMode?: 'mix' | 'custom_only';
  reviewsTitle?: string;
  reviewsSubtitle?: string;
  teamTitle?: string;
  teamSubtitle?: string;
  connectTitle?: string;
  connectSubtitle?: string;
  faqTitle?: string;
  faqSubtitle?: string;
  customFaqs?: LandingFaqItem[];
  visitTitle?: string;
  visitHoursDays?: string;
  visitHoursText?: string;
  sections?: LandingSectionToggles;
}

export interface SalonSettings {
  id: 'default';
  name: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  address: string;
  city?: string;
  mapsUrl: string;
  instagramHandle: string;
  instagramUrl?: string;
  sisterStudioHandle?: string;
  whatsappNumber: string;
  contactEmail: string;
  timezone: string;

  brandAccentLight: string;
  brandAccentDark: string;
  defaultPublicMode: ThemeModePreference;
  defaultAdminMode: ThemeModePreference;
  cornerStyle: CornerStyle;
  defaultBookingLayout: BookingLayoutView;
  enabledBookingLayouts: BookingLayoutView[];
  lockTimezone: boolean;
  slotIntervalMinutes: 15 | 30 | 60;
  enableSlotHold: boolean;
  slotHoldMinutes: number;

  minBookingNoticeMinutes: number;
  maxBookingDaysAhead: number;
  minCancelHours: number;
  minRescheduleHours: number;
  cancellationPolicyText: string;
  bookingInstructionsText: string;

  paymentMode: PaymentMode;
  depositBankName: string;
  depositAccountHolder: string;
  depositBeneficiary?: string;
  depositClabe: string;
  depositAmountCents?: number;
  depositInstructions: string;
  currency: 'MXN' | 'USD';

  serviceMode?: 'studio' | 'home' | 'online';
  businessType?: string;
  teamSizeTier?: string;
  onboardingCompleted?: boolean;
  soundAlertsEnabled?: boolean;
  lockPastBookings?: boolean;
  maxActiveBookingsPerClient?: number;
  privacyPolicyVersion?: string;
  optimizeContinuousSlots?: boolean;
  noShowDepositThreshold?: number;
  ownerPinHash?: string | null;
  ownerPinEnabled?: boolean;
  hasOwnerPin?: boolean;

  landingContent: LandingContent;

  whatsappBookingEnabled: boolean;
  smsRemindersEnabled: boolean;
  retentionNoticeEmail?: string | null;
  whatsappMonthlyQuota?: number;

  metaPixelId: string | null;
  ga4MeasurementId: string | null;
  googleReviewUrl: string | null;
  defaultCommissionPercent: number;
  updatedAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  roleTitle: string;
  bio: string;
  avatarUrl: string | null;
  bookingSlug: string;
  commissionPercent: number;
  isActive: boolean;
  displayOrder: number;
  serviceIds: string[];
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  staffMemberId: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
}

export interface Service {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  isStartingPrice?: boolean;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  requiresConfirmation: boolean;
  depositRequired: boolean;
  depositAmountCents: number;
  allowInspoPhoto: boolean;
  isActive: boolean;
  isFeatured: boolean;
  isPrivate?: boolean;
  displayOrder: number;
  imageUrl: string | null;
}

export interface ServiceAddon {
  id: string;
  name: string;
  description: string;
  extraMinutes: number;
  extraPriceCents: number;
  appliesToAll: boolean;
  serviceIds: string[];
  isActive: boolean;
  displayOrder: number;
}

export interface AvailabilityRule {
  id: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
  fixedStartTimes?: string[];
}

export interface AvailabilitySchedule {
  id: string;
  staffId: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: AvailabilityRule[];
}

export interface DateOverride {
  id: string;
  staffId: string;
  overrideDate: string;
  isUnavailable: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  publicNote?: string;
  redirectStaffId?: string | null;
}

export interface CalendarConnection {
  id: string;
  staffId: string;
  provider: 'google';
  accountEmail: string;
  destinationCalendarId: string;
  conflictCalendarIds: string[];
  availableCalendars: Array<{ id: string; summary: string; primary?: boolean }>;
  isConnected: boolean;
  lastSyncedAt: string | null;
  externalBusyBlocks?: Array<{ startAt: string; endAt: string; summary?: string }>;
  accessTokenEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  tokenExpiresAt?: string | null;
  watchChannelId?: string | null;
  watchResourceId?: string | null;
  watchExpiration?: string | null;
}

export type ClientProfile = {
  id: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  instagramHandle?: string;
  birthday: string | null;
  notes: string;
  noShowCount: number;
  createdAt: string;
  updatedAt: string;
};

export interface SlotHold {
  id: string;
  staffId: string;
  serviceId: string;
  sessionToken: string;
  startAt: string;
  endAt: string;
  expiresAt: string;
  createdAt: string;
}

interface BookingAddonSnapshot {
  addonId: string;
  name: string;
  extraMinutes: number;
  extraPriceCents: number;
}

export interface Booking {
  id: string;
  bookingCode: string;
  manageToken: string;
  idempotencyKey: string | null;
  serviceId: string;
  extraServiceIds?: string[];
  staffId: string;
  clientId: string;
  clientInstagram?: string;
  startAt: string;
  endAt: string;
  occupiedStartAt: string;
  occupiedEndAt: string;
  totalDurationMinutes: number;
  customDurationMinutes?: number;
  subtotalCents: number;
  discountCents: number;
  totalPriceCents: number;
  customPriceCents?: number;
  depositAmountCents: number;
  couponCode: string | null;
  status: BookingStatus;
  confirmedVia?: 'manual' | 'email' | 'whatsapp' | 'payment' | null;
  checkoutUrl?: string | null;
  source: BookingSource;
  clientNotes: string;
  internalNotes: string;
  inspoPhotoUrl: string | null;
  paymentProofUrl: string | null;
  proofDeliveryMethod?: 'web_upload' | 'instagram_dm' | 'none';
  googleEventId: string | null;
  cancellationReason: string | null;
  rescheduledFromId: string | null;
  recurrenceSeriesId?: string | null;
  recurrenceIndex?: number;
  recurrenceTotal?: number;
  packageRedemptionId?: string | null;
  noShowPolicyEnforced?: boolean;
  addons: BookingAddonSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface BookingWithRelations extends Booking {
  service: Service;
  staff: StaffMember;
  client: ClientProfile;
  review?: BookingReview | null;
}

export interface NotificationWorkflow {
  id: string;
  name: string;
  triggerEvent:
    | 'booking_created'
    | 'booking_confirmed'
    | 'booking_canceled'
    | 'booking_rescheduled'
    | 'before_booking'
    | 'after_booking';
  offsetMinutes: number;
  channels: NotificationChannel[];
  isEnabled: boolean;
  subjectTemplate: string;
  messageTemplate: string;
}

export interface ScheduledNotification {
  id: string;
  bookingId: string;
  workflowId: string | null;
  channel: NotificationChannel;
  recipient: string;
  scheduledFor: string;
  status: 'pending' | 'sent' | 'failed' | 'canceled';
  subject: string;
  previewText: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface GalleryItem {
  id: string;
  title: string;
  caption: string;
  category: string;
  imageUrl: string;
  serviceId: string | null;
  isFeatured: boolean;
  displayOrder: number;
}

export type Coupon = {
  id: string;
  code: string;
  kind: 'coupon' | 'gift_card';
  discountType: 'percent' | 'fixed_cents';
  discountValue: number;
  remainingBalanceCents: number | null;
  maxUses: number | null;
  usedCount: number;
  minSubtotalCents: number;
  expiresAt: string | null;
  recipientName: string | null;
  isActive: boolean;
  createdAt: string;
};

export interface WaitlistEntry {
  id: string;
  serviceId: string;
  preferredStaffId: string | null;
  desiredDate: string;
  preferredWindow: 'morning' | 'afternoon' | 'any';
  clientName: string;
  clientPhoneE164: string;
  clientEmail: string | null;
  notes: string;
  status: 'waiting' | 'notified' | 'booked' | 'expired';
  notifiedAt: string | null;
  priorityOfferToken?: string | null;
  priorityOfferExpiresAt?: string | null;
  priorityOfferSlotStartAt?: string | null;
  createdAt: string;
}

export interface BookingPayment {
  id: string;
  bookingId: string;
  provider: 'manual_transfer' | 'stripe' | 'mercadopago';
  amountCents: number;
  currency: 'MXN' | 'USD';
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  providerPaymentId?: string | null;
  checkoutUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingReview {
  id: string;
  bookingId: string;
  clientId: string | null;
  staffId: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
  clickedGoogleReview: boolean;
  createdAt: string;
}

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: 'Insumo' | 'Gel / Esmalte' | 'Acrílico' | 'Decoración' | 'Reventa';
  unit: string;
  stockQuantity: number;
  minStockAlert: number;
  costCents: number;
  retailPriceCents: number;
  isForRetail: boolean;
  isActive: boolean;
  updatedAt: string;
};

export interface InventoryMovement {
  id: string;
  itemId: string;
  delta: number;
  reason: 'restock' | 'service_usage' | 'retail_sale' | 'adjustment';
  notes: string;
  bookingId: string | null;
  createdBy: string;
  createdAt: string;
}

export type CashRegisterEntry = {
  id: string;
  bookingId: string | null;
  staffId: string | null;
  entryType: 'service_income' | 'product_sale' | 'deposit' | 'expense' | 'gift_card_sale';
  description: string;
  amountCents: number;
  tipCents: number;
  commissionCents: number;
  paymentMethod: PaymentMethod;
  occurredAt: string;
  recordedBy: string;
};

export interface PaymentSplit {
  id: string;
  bookingId: string;
  method: PaymentSplitMethod;
  amountCents: number;
  tipCents: number;
  tipStaffId: string | null;
  reference?: string;
  createdAt: string;
}

export interface RecurringBlock {
  id: string;
  staffId: string;
  reason: string;
  frequency: 'weekly' | 'monthly';
  weekdays: number[];
  dayOfMonth: number | null;
  startTime: string;
  endTime: string;
  untilDate: string | null;
  isActive: boolean;
}

export interface LoyaltyProgram {
  id: string;
  isActive: boolean;
  name: string;
  stampsRequired: number;
  rewardType: 'free_service' | 'percent_discount';
  rewardServiceId: string | null;
  discountPercent: number | null;
  maxDiscountCents: number | null;
  validDays: number | null;
}

export interface LoyaltyStamp {
  id: string;
  clientId: string;
  bookingId: string;
  programId: string;
  stampedDate: string;
  createdAt: string;
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  bookingId: string;
  clientId: string;
  amountCents: number;
  status: 'active' | 'released';
  createdAt: string;
  releasedAt: string | null;
}

export interface ConsentRecord {
  id: string;
  clientId: string;
  bookingId: string | null;
  policyVersion: string;
  acceptedAt: string;
  marketingOptIn: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: AdminRole;
  action: AuditAction;
  entityType: string;
  entityId: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  serviceId: string;
  totalSessions: number;
  priceCents: number;
  validDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface ClientPackage {
  id: string;
  clientId: string;
  packageId: string;
  packageName: string;
  serviceId: string;
  totalSessions: number;
  usedSessions: number;
  purchasedAt: string;
  expiresAt: string | null;
  status: 'active' | 'exhausted' | 'expired' | 'canceled';
  notes: string;
  redeemedBookingIds?: string[];
}

export interface CampaignDispatchLog {
  id: string;
  kind: 'birthday' | 'reactivation';
  clientId: string;
  clientName: string;
  phoneE164: string;
  channel: 'whatsapp';
  messagePreview: string;
  dispatchedBy: string;
  dispatchedAt: string;
}

export type MediaAssetFolder = 'proofs' | 'inspo' | 'gallery';

export interface MediaAssetRecord {
  id: string;
  storagePath: string;
  folder: MediaAssetFolder;
  bookingId: string | null;
  clientId: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  retentionWarned30dAt: string | null;
  retentionWarned7dAt: string | null;
  purgedAt: string | null;
}

export interface MediaAccessOwner {
  storagePath: string;
  folder: MediaAssetFolder;
  bookingId: string | null;
  staffId: string | null;
  manageToken: string | null;
  clientPhoneE164: string | null;
}

export type WhatsAppTemplateTriggerKey =
  | 'booking_confirmed'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'booking_rescheduled'
  | 'booking_canceled'
  | 'waitlist_offer';

type WhatsAppTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export interface WhatsAppTemplateConfig {
  id: string;
  triggerKey: WhatsAppTemplateTriggerKey;
  templateName: string;
  category: WhatsAppTemplateCategory;
  languageCode: string;
  isActive: boolean;
  updatedAt: string;
}

export type WhatsAppQuotaAlertLevel = 'ok' | 'warning_80' | 'limit_100';

export interface WhatsAppMonthlyUsage {
  monthKey: string;
  sentCount: number;
  quotaLimit: number;
  warned80At: string | null;
  warned100At: string | null;
  updatedAt: string;
}

export interface WhatsAppMonthlyUsageSummary {
  monthKey: string;
  sentCount: number;
  quotaLimit: number;
  percentUsed: number;
  alertLevel: WhatsAppQuotaAlertLevel;
  warned80At: string | null;
  warned100At: string | null;
}

export interface WebhookEventRecord {
  provider: string;
  eventId: string;
  receivedAt: string;
}

export interface DemoDatabase {
  settings: SalonSettings;
  staff: StaffMember[];
  adminUsers: AdminUser[];
  categories: ServiceCategory[];
  services: Service[];
  addons: ServiceAddon[];
  schedules: AvailabilitySchedule[];
  dateOverrides: DateOverride[];
  calendarConnections: CalendarConnection[];
  clients: ClientProfile[];
  slotHolds: SlotHold[];
  bookings: Booking[];
  workflows: NotificationWorkflow[];
  notifications: ScheduledNotification[];
  gallery: GalleryItem[];
  coupons: Coupon[];
  waitlist: WaitlistEntry[];
  reviews: BookingReview[];
  inventory: InventoryItem[];
  inventoryMovements: InventoryMovement[];
  cashEntries: CashRegisterEntry[];
  paymentSplits?: PaymentSplit[];
  recurringBlocks?: RecurringBlock[];
  loyaltyPrograms?: LoyaltyProgram[];
  loyaltyStamps?: LoyaltyStamp[];
  couponRedemptions?: CouponRedemption[];
  consents?: ConsentRecord[];
  auditLogs?: AuditLogEntry[];
  bookingPayments?: BookingPayment[];
  servicePackages?: ServicePackage[];
  clientPackages?: ClientPackage[];
  campaignDispatches?: CampaignDispatchLog[];
  mediaAssets?: MediaAssetRecord[];
  whatsappTemplates?: WhatsAppTemplateConfig[];
  whatsappMonthlyUsage?: WhatsAppMonthlyUsage[];
  webhookEvents?: WebhookEventRecord[];
}
