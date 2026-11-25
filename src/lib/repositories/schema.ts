import { z } from 'zod';
import type { DemoDatabase } from '../types';

const AdminRoleSchema = z.enum(['owner', 'admin', 'specialist']);
const BookingStatusSchema = z.enum([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
  'completed',
  'canceled',
  'no_show',
]);
const BookingSourceSchema = z.enum(['web', 'whatsapp', 'manual', 'walk_in']);
const BookingLayoutViewSchema = z.enum(['month', 'week', 'column']);
const ThemeModePreferenceSchema = z.enum(['light', 'dark', 'system']);
const CornerStyleSchema = z.enum(['sharp', 'soft', 'rounded', 'pill']);
const PaymentModeSchema = z.enum(['none', 'manual_transfer', 'stripe', 'mercadopago']);
const PaymentMethodSchema = z.enum(['cash', 'transfer', 'card', 'gift_card']);
const PaymentSplitMethodSchema = z.enum(['cash', 'card', 'transfer', 'giftcard', 'online']);
const NotificationChannelSchema = z.enum(['email', 'whatsapp', 'sms']);
const AuditActionSchema = z.enum([
  'booking_canceled',
  'booking_price_override',
  'csv_exported',
  'past_booking_override',
  'deposit_approved',
  'loyalty_redeemed',
]);

const LandingContentSchema = z.object({
  heroEyebrow: z.string(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  aboutTitle: z.string(),
  aboutBody: z.string(),
});

const SalonSettingsSchema = z.object({
  id: z.literal('default'),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  logoUrl: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  address: z.string(),
  city: z.string().optional(),
  mapsUrl: z.string(),
  instagramHandle: z.string(),
  instagramUrl: z.string().optional(),
  sisterStudioHandle: z.string().optional(),
  whatsappNumber: z.string(),
  contactEmail: z.string(),
  timezone: z.string(),
  brandAccentLight: z.string(),
  brandAccentDark: z.string(),
  defaultPublicMode: ThemeModePreferenceSchema,
  defaultAdminMode: ThemeModePreferenceSchema,
  cornerStyle: CornerStyleSchema,
  defaultBookingLayout: BookingLayoutViewSchema,
  enabledBookingLayouts: z.array(BookingLayoutViewSchema),
  lockTimezone: z.boolean(),
  slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  enableSlotHold: z.boolean(),
  slotHoldMinutes: z.number(),
  minBookingNoticeMinutes: z.number(),
  maxBookingDaysAhead: z.number(),
  minCancelHours: z.number(),
  minRescheduleHours: z.number(),
  cancellationPolicyText: z.string(),
  bookingInstructionsText: z.string(),
  paymentMode: PaymentModeSchema,
  depositBankName: z.string(),
  depositAccountHolder: z.string(),
  depositBeneficiary: z.string().optional(),
  depositClabe: z.string(),
  depositAmountCents: z.number().int().nonnegative().optional(),
  depositInstructions: z.string(),
  currency: z.enum(['MXN', 'USD']),
  serviceMode: z.enum(['studio', 'home', 'online']).optional(),
  businessType: z.string().optional(),
  teamSizeTier: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
  soundAlertsEnabled: z.boolean().optional(),
  lockPastBookings: z.boolean().optional(),
  maxActiveBookingsPerClient: z.number().int().positive().max(50).optional(),
  privacyPolicyVersion: z.string().optional(),
  optimizeContinuousSlots: z.boolean().optional(),
  landingContent: LandingContentSchema,
  whatsappBookingEnabled: z.boolean(),
  smsRemindersEnabled: z.boolean(),
  metaPixelId: z.string().nullable(),
  ga4MeasurementId: z.string().nullable(),
  googleReviewUrl: z.string().nullable(),
  defaultCommissionPercent: z.number(),
  updatedAt: z.string(),
});

const StaffMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleTitle: z.string(),
  bio: z.string(),
  avatarUrl: z.string().nullable(),
  bookingSlug: z.string(),
  commissionPercent: z.number(),
  isActive: z.boolean(),
  displayOrder: z.number(),
  serviceIds: z.array(z.string()),
});

const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: AdminRoleSchema,
  staffMemberId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

const ServiceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  displayOrder: z.number(),
});

const ServiceSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  durationMinutes: z.number(),
  priceCents: z.number(),
  isStartingPrice: z.boolean().optional(),
  bufferBeforeMinutes: z.number(),
  bufferAfterMinutes: z.number(),
  requiresConfirmation: z.boolean(),
  depositRequired: z.boolean(),
  depositAmountCents: z.number(),
  allowInspoPhoto: z.boolean(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  isPrivate: z.boolean().optional(),
  displayOrder: z.number(),
  imageUrl: z.string().nullable(),
});

const ServiceAddonSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  extraMinutes: z.number(),
  extraPriceCents: z.number(),
  appliesToAll: z.boolean(),
  serviceIds: z.array(z.string()),
  isActive: z.boolean(),
  displayOrder: z.number(),
});

const DayOfWeekSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const FixedStartTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const AvailabilityRuleSchema = z.object({
  id: z.string(),
  dayOfWeek: DayOfWeekSchema,
  startTime: z.string(),
  endTime: z.string(),
  fixedStartTimes: z.array(FixedStartTimeSchema).optional(),
});

const AvailabilityScheduleSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  name: z.string(),
  timezone: z.string(),
  isDefault: z.boolean(),
  rules: z.array(AvailabilityRuleSchema),
});

const DateOverrideSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  overrideDate: z.string(),
  isUnavailable: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  reason: z.string(),
  publicNote: z.string().optional(),
  redirectStaffId: z.string().nullable().optional(),
});

const CalendarConnectionSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  provider: z.literal('google'),
  accountEmail: z.string(),
  destinationCalendarId: z.string(),
  conflictCalendarIds: z.array(z.string()),
  availableCalendars: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      primary: z.boolean().optional(),
    }),
  ),
  isConnected: z.boolean(),
  lastSyncedAt: z.string().nullable(),
  externalBusyBlocks: z
    .array(
      z.object({
        startAt: z.string(),
        endAt: z.string(),
        summary: z.string().optional(),
      }),
    )
    .optional(),
  accessTokenEncrypted: z.string().nullable().optional(),
  refreshTokenEncrypted: z.string().nullable().optional(),
  tokenExpiresAt: z.string().nullable().optional(),
  watchChannelId: z.string().nullable().optional(),
  watchResourceId: z.string().nullable().optional(),
  watchExpiration: z.string().nullable().optional(),
});

const ClientProfileSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  phoneE164: z.string(),
  email: z.string().nullable(),
  instagramHandle: z.string().optional(),
  birthday: z.string().nullable(),
  notes: z.string(),
  noShowCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const SlotHoldSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  serviceId: z.string(),
  sessionToken: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

const BookingAddonSnapshotSchema = z.object({
  addonId: z.string(),
  name: z.string(),
  extraMinutes: z.number(),
  extraPriceCents: z.number(),
});

const BookingSchema = z.object({
  id: z.string(),
  bookingCode: z.string(),
  manageToken: z.string(),
  idempotencyKey: z.string().nullable(),
  serviceId: z.string(),
  extraServiceIds: z.array(z.string()).optional(),
  staffId: z.string(),
  clientId: z.string(),
  clientInstagram: z.string().optional(),
  startAt: z.string(),
  endAt: z.string(),
  occupiedStartAt: z.string(),
  occupiedEndAt: z.string(),
  totalDurationMinutes: z.number(),
  customDurationMinutes: z.number().int().positive().optional(),
  subtotalCents: z.number(),
  discountCents: z.number(),
  totalPriceCents: z.number(),
  customPriceCents: z.number().int().nonnegative().optional(),
  depositAmountCents: z.number(),
  couponCode: z.string().nullable(),
  status: BookingStatusSchema,
  confirmedVia: z.enum(['manual', 'email', 'whatsapp', 'payment']).nullable().optional(),
  checkoutUrl: z.string().nullable().optional(),
  source: BookingSourceSchema,
  clientNotes: z.string(),
  internalNotes: z.string(),
  inspoPhotoUrl: z.string().nullable(),
  paymentProofUrl: z.string().nullable(),
  proofDeliveryMethod: z.enum(['web_upload', 'instagram_dm', 'none']).optional(),
  googleEventId: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  rescheduledFromId: z.string().nullable(),
  addons: z.array(BookingAddonSnapshotSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const NotificationWorkflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  triggerEvent: z.enum([
    'booking_created',
    'booking_confirmed',
    'booking_canceled',
    'booking_rescheduled',
    'before_booking',
    'after_booking',
  ]),
  offsetMinutes: z.number(),
  channels: z.array(NotificationChannelSchema),
  isEnabled: z.boolean(),
  subjectTemplate: z.string(),
  messageTemplate: z.string(),
});

const ScheduledNotificationSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  workflowId: z.string().nullable(),
  channel: NotificationChannelSchema,
  recipient: z.string(),
  scheduledFor: z.string(),
  status: z.enum(['pending', 'sent', 'failed', 'canceled']),
  subject: z.string(),
  previewText: z.string(),
  providerMessageId: z.string().nullable(),
  errorMessage: z.string().nullable(),
  sentAt: z.string().nullable(),
  createdAt: z.string(),
});

const GalleryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  caption: z.string(),
  category: z.string(),
  imageUrl: z.string(),
  serviceId: z.string().nullable(),
  isFeatured: z.boolean(),
  displayOrder: z.number(),
});

const CouponSchema = z.object({
  id: z.string(),
  code: z.string(),
  kind: z.enum(['coupon', 'gift_card']),
  discountType: z.enum(['percent', 'fixed_cents']),
  discountValue: z.number(),
  remainingBalanceCents: z.number().nullable(),
  maxUses: z.number().nullable(),
  usedCount: z.number(),
  minSubtotalCents: z.number(),
  expiresAt: z.string().nullable(),
  recipientName: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

const WaitlistEntrySchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  preferredStaffId: z.string().nullable(),
  desiredDate: z.string(),
  preferredWindow: z.enum(['morning', 'afternoon', 'any']),
  clientName: z.string(),
  clientPhoneE164: z.string(),
  clientEmail: z.string().nullable(),
  notes: z.string(),
  status: z.enum(['waiting', 'notified', 'booked', 'expired']),
  notifiedAt: z.string().nullable(),
  priorityOfferToken: z.string().nullable().optional(),
  priorityOfferExpiresAt: z.string().nullable().optional(),
  priorityOfferSlotStartAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

const BookingPaymentSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  provider: z.enum(['manual_transfer', 'stripe', 'mercadopago']),
  amountCents: z.number().int().nonnegative(),
  currency: z.enum(['MXN', 'USD']),
  status: z.enum(['pending', 'approved', 'rejected', 'refunded']),
  providerPaymentId: z.string().nullable().optional(),
  checkoutUrl: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const RatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const BookingReviewSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  clientId: z.string().nullable(),
  staffId: z.string().nullable(),
  rating: RatingSchema,
  comment: z.string(),
  clickedGoogleReview: z.boolean(),
  createdAt: z.string(),
});

const InventoryItemSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  category: z.enum(['Insumo', 'Gel / Esmalte', 'Acrílico', 'Decoración', 'Reventa']),
  unit: z.string(),
  stockQuantity: z.number(),
  minStockAlert: z.number(),
  costCents: z.number(),
  retailPriceCents: z.number(),
  isForRetail: z.boolean(),
  isActive: z.boolean(),
  updatedAt: z.string(),
});

const InventoryMovementSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  delta: z.number(),
  reason: z.enum(['restock', 'service_usage', 'retail_sale', 'adjustment']),
  notes: z.string(),
  bookingId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

const CashRegisterEntrySchema = z.object({
  id: z.string(),
  bookingId: z.string().nullable(),
  staffId: z.string().nullable(),
  entryType: z.enum([
    'service_income',
    'product_sale',
    'deposit',
    'expense',
    'gift_card_sale',
  ]),
  description: z.string(),
  amountCents: z.number(),
  tipCents: z.number(),
  commissionCents: z.number(),
  paymentMethod: PaymentMethodSchema,
  occurredAt: z.string(),
  recordedBy: z.string(),
});

const PaymentSplitSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  method: PaymentSplitMethodSchema,
  amountCents: z.number().int().nonnegative(),
  tipCents: z.number().int().nonnegative(),
  tipStaffId: z.string().nullable(),
  reference: z.string().optional(),
  createdAt: z.string(),
});

const RecurringBlockSchema = z.object({
  id: z.string(),
  staffId: z.string(),
  reason: z.string(),
  frequency: z.enum(['weekly', 'monthly']),
  weekdays: z.array(z.number().int().min(0).max(6)),
  dayOfMonth: z.number().int().min(1).max(31).nullable(),
  startTime: FixedStartTimeSchema,
  endTime: FixedStartTimeSchema,
  untilDate: z.string().nullable(),
  isActive: z.boolean(),
});

const LoyaltyProgramSchema = z.object({
  id: z.string(),
  isActive: z.boolean(),
  name: z.string(),
  stampsRequired: z.number().int().positive(),
  rewardType: z.enum(['free_service', 'percent_discount']),
  rewardServiceId: z.string().nullable(),
  discountPercent: z.number().int().min(1).max(100).nullable(),
  maxDiscountCents: z.number().int().nonnegative().nullable(),
  validDays: z.number().int().positive().nullable(),
});

const LoyaltyStampSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  bookingId: z.string(),
  programId: z.string(),
  stampedDate: z.string(),
  createdAt: z.string(),
});

const CouponRedemptionSchema = z.object({
  id: z.string(),
  couponId: z.string(),
  bookingId: z.string(),
  clientId: z.string(),
  amountCents: z.number().int().nonnegative(),
  status: z.enum(['active', 'released']),
  createdAt: z.string(),
  releasedAt: z.string().nullable(),
});

const ConsentRecordSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  bookingId: z.string().nullable(),
  policyVersion: z.string(),
  acceptedAt: z.string(),
  marketingOptIn: z.boolean(),
});

const AuditLogEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorEmail: z.string(),
  actorRole: AdminRoleSchema,
  action: AuditActionSchema,
  entityType: z.string(),
  entityId: z.string(),
  metadata: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
  createdAt: z.string(),
});

export const DemoDatabaseSchema = z.object({
  settings: SalonSettingsSchema,
  staff: z.array(StaffMemberSchema),
  adminUsers: z.array(AdminUserSchema),
  categories: z.array(ServiceCategorySchema),
  services: z.array(ServiceSchema),
  addons: z.array(ServiceAddonSchema),
  schedules: z.array(AvailabilityScheduleSchema),
  dateOverrides: z.array(DateOverrideSchema),
  calendarConnections: z.array(CalendarConnectionSchema),
  clients: z.array(ClientProfileSchema),
  slotHolds: z.array(SlotHoldSchema),
  bookings: z.array(BookingSchema),
  workflows: z.array(NotificationWorkflowSchema),
  notifications: z.array(ScheduledNotificationSchema),
  gallery: z.array(GalleryItemSchema),
  coupons: z.array(CouponSchema),
  waitlist: z.array(WaitlistEntrySchema),
  reviews: z.array(BookingReviewSchema),
  inventory: z.array(InventoryItemSchema),
  inventoryMovements: z.array(InventoryMovementSchema),
  cashEntries: z.array(CashRegisterEntrySchema),
  paymentSplits: z.array(PaymentSplitSchema).default([]),
  recurringBlocks: z.array(RecurringBlockSchema).default([]),
  loyaltyPrograms: z.array(LoyaltyProgramSchema).default([]),
  loyaltyStamps: z.array(LoyaltyStampSchema).default([]),
  couponRedemptions: z.array(CouponRedemptionSchema).default([]),
  consents: z.array(ConsentRecordSchema).default([]),
  auditLogs: z.array(AuditLogEntrySchema).default([]),
  bookingPayments: z.array(BookingPaymentSchema).default([]),
});

export function parseDemoDatabase(raw: unknown): DemoDatabase {
  return DemoDatabaseSchema.parse(raw);
}
