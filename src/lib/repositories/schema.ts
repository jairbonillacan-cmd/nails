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
const NotificationChannelSchema = z.enum(['email', 'whatsapp', 'sms']);

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
  mapsUrl: z.string(),
  instagramHandle: z.string(),
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
  depositClabe: z.string(),
  depositInstructions: z.string(),
  currency: z.enum(['MXN', 'USD']),
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
  bufferBeforeMinutes: z.number(),
  bufferAfterMinutes: z.number(),
  requiresConfirmation: z.boolean(),
  depositRequired: z.boolean(),
  depositAmountCents: z.number(),
  allowInspoPhoto: z.boolean(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
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

const AvailabilityRuleSchema = z.object({
  id: z.string(),
  dayOfWeek: DayOfWeekSchema,
  startTime: z.string(),
  endTime: z.string(),
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
});

const ClientProfileSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  phoneE164: z.string(),
  email: z.string().nullable(),
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
  staffId: z.string(),
  clientId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  occupiedStartAt: z.string(),
  occupiedEndAt: z.string(),
  totalDurationMinutes: z.number(),
  subtotalCents: z.number(),
  discountCents: z.number(),
  totalPriceCents: z.number(),
  depositAmountCents: z.number(),
  couponCode: z.string().nullable(),
  status: BookingStatusSchema,
  source: BookingSourceSchema,
  clientNotes: z.string(),
  internalNotes: z.string(),
  inspoPhotoUrl: z.string().nullable(),
  paymentProofUrl: z.string().nullable(),
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
  createdAt: z.string(),
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
});

export function parseDemoDatabase(raw: unknown): DemoDatabase {
  return DemoDatabaseSchema.parse(raw);
}
