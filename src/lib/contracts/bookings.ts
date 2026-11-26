import { z } from 'zod';
import {
  BookingStatusSchema,
  PaymentMethodSchema,
  PaymentSplitMethodSchema,
  PreferredWindowSchema,
  ProofDeliveryMethodSchema,
  RatingSchema,
} from './enums';
import {
  CentsNonNegativeSchema,
  ClientContactFieldsSchema,
  createDepositProofInputSchema,
  createPublicMediaUrlSchema,
  DateKeySchema,
  NonEmptyIdSchema,
  OptionalEmailSchema,
} from './primitives';

export const PublicCreateBookingSchema = z.object({
  serviceId: NonEmptyIdSchema,
  extraServiceIds: z.array(NonEmptyIdSchema).max(8).default([]),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().nullable().optional(),
  startAt: NonEmptyIdSchema,
  ...ClientContactFieldsSchema.shape,
  clientNotes: z.string().max(1000).optional(),
  inspoPhotoUrl: createPublicMediaUrlSchema('inspo').optional().nullable(),
  paymentProofUrl: createDepositProofInputSchema().optional().nullable(),
  proofDeliveryMethod: ProofDeliveryMethodSchema.optional(),
  couponCode: z.string().max(40).optional().nullable(),
  sessionToken: z.string().optional().nullable(),
  holdId: NonEmptyIdSchema.optional().nullable(),
  waitlistOfferToken: z.string().trim().min(6).max(120).optional().nullable(),
  privacyConsentAccepted: z.boolean(),
  marketingOptIn: z.boolean().default(false),
});

export const AdminCreateBookingSchema = z.object({
  serviceId: NonEmptyIdSchema,
  extraServiceIds: z.array(NonEmptyIdSchema).max(8).default([]),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().nullable().optional(),
  startAt: NonEmptyIdSchema,
  ...ClientContactFieldsSchema.shape,
  clientNotes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
  inspoPhotoUrl: z.string().max(2_500_000).optional().nullable(),
  paymentProofUrl: z.string().max(2_500_000).optional().nullable(),
  proofDeliveryMethod: ProofDeliveryMethodSchema.optional(),
  customDurationMinutes: z.number().int().min(15).max(480).optional().nullable(),
  customPriceCents: CentsNonNegativeSchema.max(10_000_000).optional().nullable(),
  notifyEmail: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  couponCode: z.string().max(40).optional().nullable(),
  source: z.enum(['manual', 'walk_in']).default('manual'),
  forceConfirmed: z.boolean().default(true),
  ownerPin: z.string().max(12).optional(),
  recurrence: z
    .object({
      intervalWeeks: z.union([z.literal(2), z.literal(3), z.literal(4)]),
      count: z.number().int().min(2).max(6),
    })
    .optional(),
});

export const ManageBookingPatchSchema = z.object({
  action: z.enum(['cancel', 'reschedule', 'upload_proof', 'confirm_attendance']),
  reason: z.string().max(400).optional(),
  newStartAt: z.string().optional(),
  newStaffId: z.string().optional(),
  paymentProofUrl: createDepositProofInputSchema().optional(),
});

export const SubmitReviewSchema = z.object({
  rating: RatingSchema,
  comment: z.string().max(600).default(''),
  clickedGoogleReview: z.boolean().optional(),
});

export const SendReminderSchema = z.object({
  action: z.literal('send_reminder'),
  bookingId: NonEmptyIdSchema,
  channel: z.enum(['whatsapp', 'email', 'both']).default('whatsapp'),
});

export const RequestRescheduleSchema = z.object({
  action: z.literal('request_reschedule'),
  bookingId: NonEmptyIdSchema,
  note: z.string().trim().max(400).optional(),
});

export const AdminRescheduleBookingSchema = z.object({
  action: z.literal('reschedule_admin'),
  bookingId: NonEmptyIdSchema,
  startAt: NonEmptyIdSchema,
  staffId: NonEmptyIdSchema.optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  reason: z.string().trim().max(300).optional(),
});

export const AdminRejectDepositSchema = z.object({
  action: z.literal('reject_deposit'),
  bookingId: NonEmptyIdSchema,
  reason: z.string().trim().max(300).optional(),
});

export const CheckoutSplitSchema = z.object({
  action: z.literal('checkout_split'),
  bookingId: NonEmptyIdSchema,
  splits: z
    .array(
      z.object({
        method: PaymentSplitMethodSchema,
        amountCents: CentsNonNegativeSchema.max(10_000_000),
        tipCents: CentsNonNegativeSchema.max(10_000_000).default(0),
        tipStaffId: NonEmptyIdSchema.nullable().optional(),
        reference: z.string().max(160).optional(),
      }),
    )
    .min(1)
    .max(10),
  extraItem: z
    .object({
      inventoryItemId: NonEmptyIdSchema,
      quantity: z.number().int().min(1).max(50),
    })
    .nullable()
    .optional(),
  markCompleted: z.boolean().default(true),
  redeemLoyaltyReward: z.boolean().optional(),
  redeemClientPackageId: NonEmptyIdSchema.nullable().optional(),
});

export const AdminPatchBookingStatusSchema = z.object({
  action: z.literal('update_status').optional(),
  bookingId: NonEmptyIdSchema,
  status: BookingStatusSchema,
  cancellationReason: z.string().optional(),
  internalNotes: z.string().optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  tipCents: CentsNonNegativeSchema.optional(),
  ownerPin: z.string().max(12).optional(),
});

export const CreateSlotHoldSchema = z.object({
  serviceId: NonEmptyIdSchema,
  extraServiceIds: z.array(NonEmptyIdSchema).max(8).default([]),
  addonIds: z.array(z.string()).default([]),
  staffId: NonEmptyIdSchema,
  startAt: NonEmptyIdSchema,
  sessionToken: z.string().min(4).optional(),
});

export const CreateWaitlistSchema = z.object({
  serviceId: NonEmptyIdSchema,
  preferredStaffId: z.string().nullable().optional(),
  desiredDate: DateKeySchema,
  preferredWindow: PreferredWindowSchema.default('any'),
  clientName: z.string().min(2),
  clientPhoneE164: z.string().min(8),
  clientEmail: OptionalEmailSchema,
  notes: z.string().max(400).default(''),
});

export const ValidateCouponSchema = z.object({
  code: NonEmptyIdSchema,
  subtotalCents: CentsNonNegativeSchema,
});
