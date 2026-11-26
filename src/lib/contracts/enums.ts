import { z } from 'zod';

export const AdminRoleSchema = z.enum(['owner', 'admin', 'specialist']);

export const BookingStatusSchema = z.enum([
  'pending_payment',
  'pending_confirmation',
  'confirmed',
  'completed',
  'canceled',
  'no_show',
]);

export const BookingSourceSchema = z.enum(['web', 'whatsapp', 'manual', 'walk_in']);

export const BookingLayoutViewSchema = z.enum(['month', 'week', 'column']);

export const ThemeModePreferenceSchema = z.enum(['light', 'dark', 'system']);

export const CornerStyleSchema = z.enum(['sharp', 'soft', 'rounded', 'pill']);

export const PublicPaletteSchema = z.enum(['laikona', 'monochrome']);

export const PaymentModeSchema = z.enum([
  'none',
  'manual_transfer',
  'stripe',
  'mercadopago',
]);

export const PaymentMethodSchema = z.enum(['cash', 'transfer', 'card', 'gift_card']);

export const PaymentSplitMethodSchema = z.enum([
  'cash',
  'card',
  'transfer',
  'giftcard',
  'online',
]);

export const NotificationChannelSchema = z.enum(['email', 'whatsapp', 'sms']);

export const NotificationTriggerEventSchema = z.enum([
  'booking_created',
  'booking_confirmed',
  'booking_canceled',
  'booking_rescheduled',
  'before_booking',
  'after_booking',
]);

export const CurrencySchema = z.enum(['MXN', 'USD']);

export const ServiceModeSchema = z.enum(['studio', 'home', 'online']);

export const SlotIntervalMinutesSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

export const BookingAttendanceStatusSchema = z.enum([
  'pending',
  'confirmed',
  'rescheduled',
]);

export const FunnelEventTypeSchema = z.enum([
  'page_view',
  'booking_started',
  'slot_held',
  'details_completed',
  'deposit_submitted',
  'booking_confirmed',
]);

export const ProofDeliveryMethodSchema = z.enum([
  'web_upload',
  'web_link',
  'instagram_dm',
  'none',
]);

export const RatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const DayOfWeekSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const RecurringFrequencySchema = z.enum(['weekly', 'monthly']);

export const PreferredWindowSchema = z.enum(['morning', 'afternoon', 'any']);

export const WaitlistStatusSchema = z.enum([
  'waiting',
  'notified',
  'booked',
  'expired',
]);

export const ClientPackageStatusSchema = z.enum([
  'active',
  'exhausted',
  'expired',
  'canceled',
]);

export const CampaignKindSchema = z.enum(['birthday', 'reactivation']);

export const RewardTypeSchema = z.enum(['free_service', 'percent_discount']);

export const AuditActionSchema = z.enum([
  'booking_canceled',
  'booking_price_override',
  'csv_exported',
  'past_booking_override',
  'deposit_approved',
  'deposit_rejected',
  'booking_rescheduled',
  'loyalty_redeemed',
  'media_retention_warned',
  'media_retention_purged',
]);

export const InventoryCategorySchema = z.enum([
  'Insumo',
  'Gel / Esmalte',
  'Acrílico',
  'Decoración',
  'Reventa',
]);

export const InventoryMovementReasonSchema = z.enum([
  'restock',
  'service_usage',
  'retail_sale',
  'adjustment',
]);

export const CashEntryTypeSchema = z.enum([
  'service_income',
  'product_sale',
  'deposit',
  'expense',
  'gift_card_sale',
]);

export const CouponKindSchema = z.enum(['coupon', 'gift_card']);

export const CouponDiscountTypeSchema = z.enum(['percent', 'fixed_cents']);
