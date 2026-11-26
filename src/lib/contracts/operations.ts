import { z } from 'zod';
import {
  CashEntryTypeSchema,
  CouponDiscountTypeSchema,
  CouponKindSchema,
  InventoryCategorySchema,
  InventoryMovementReasonSchema,
  NotificationChannelSchema,
  PaymentMethodSchema,
  WaitlistStatusSchema,
} from './enums';
import { CentsNonNegativeSchema, NonEmptyIdSchema } from './primitives';

const CalendarConnectionPatchSchema = z
  .object({
    isConnected: z.boolean(),
    destinationCalendarId: z.string().trim().min(1).max(200),
    conflictCalendarIds: z.array(z.string().trim().min(1).max(200)).max(50),
    accountEmail: z.string().trim().email().max(200),
  })
  .partial()
  .strict();

const CashEntryInputSchema = z
  .object({
    bookingId: NonEmptyIdSchema.nullable().default(null),
    staffId: NonEmptyIdSchema.nullable().default(null),
    entryType: CashEntryTypeSchema,
    description: z.string().trim().min(1, 'Escribe una descripción').max(240),
    amountCents: z.number().int().min(-100_000_000).max(100_000_000),
    tipCents: CentsNonNegativeSchema.max(100_000_000).default(0),
    commissionCents: CentsNonNegativeSchema.max(100_000_000).default(0),
    paymentMethod: PaymentMethodSchema,
  })
  .strict();

const NewInventoryItemSchema = z
  .object({
    sku: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2, 'Escribe un nombre para el producto').max(120),
    category: InventoryCategorySchema,
    unit: z.string().trim().min(1).max(40),
    stockQuantity: z.number().min(0).max(100_000),
    minStockAlert: z.number().min(0).max(100_000),
    costCents: CentsNonNegativeSchema.max(100_000_000),
    retailPriceCents: CentsNonNegativeSchema.max(100_000_000),
    isForRetail: z.boolean(),
    isActive: z.boolean().default(true),
  })
  .strict();

const InventoryActionDataSchema = z.union([
  z
    .object({
      newItem: NewInventoryItemSchema,
    })
    .strict(),
  z
    .object({
      itemId: NonEmptyIdSchema,
      delta: z.number().min(-100_000).max(100_000),
      reason: InventoryMovementReasonSchema.default('adjustment'),
      notes: z.string().max(400).default(''),
    })
    .strict(),
]);

const CouponInputSchema = z
  .object({
    id: NonEmptyIdSchema.optional(),
    code: z.string().trim().min(2, 'Escribe un código válido').max(40),
    kind: CouponKindSchema,
    discountType: CouponDiscountTypeSchema,
    discountValue: z.number().int().positive().max(100_000_000),
    remainingBalanceCents: CentsNonNegativeSchema.max(100_000_000).nullable().default(null),
    maxUses: z.number().int().positive().max(100_000).nullable().default(null),
    minSubtotalCents: CentsNonNegativeSchema.max(100_000_000).default(0),
    expiresAt: z.string().max(64).nullable().default(null),
    recipientName: z.string().max(120).nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .strict();

const WorkflowPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    isEnabled: z.boolean(),
    channels: z.array(NotificationChannelSchema).max(3),
    offsetMinutes: z.number().int().min(-43_200).max(43_200),
    subjectTemplate: z.string().max(240),
    messageTemplate: z.string().max(1500),
  })
  .partial()
  .strict();

export const AdminOperationsPostSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('calendar'),
    staffId: NonEmptyIdSchema,
    patch: CalendarConnectionPatchSchema,
  }),
  z.object({
    kind: z.literal('cash'),
    data: CashEntryInputSchema,
  }),
  z.object({
    kind: z.literal('inventory'),
    data: InventoryActionDataSchema,
  }),
  z.object({
    kind: z.literal('coupon'),
    data: CouponInputSchema,
  }),
  z.object({
    kind: z.literal('waitlist'),
    id: NonEmptyIdSchema,
    status: WaitlistStatusSchema,
  }),
  z.object({
    kind: z.literal('workflow'),
    id: NonEmptyIdSchema,
    patch: WorkflowPatchSchema,
  }),
]);
