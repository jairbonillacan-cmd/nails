import { z } from 'zod';
import { StarterServiceSchema } from './catalog';
import {
  BookingLayoutViewSchema,
  CornerStyleSchema,
  CurrencySchema,
  PaymentModeSchema,
  RewardTypeSchema,
  ServiceModeSchema,
  SlotIntervalMinutesSchema,
  ThemeModePreferenceSchema,
} from './enums';
import { CentsNonNegativeSchema, NonEmptyIdSchema } from './primitives';

export const LandingContentSchema = z.object({
  heroEyebrow: z.string(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  aboutTitle: z.string(),
  aboutBody: z.string(),
});

const LandingContentPatchSchema = z
  .object({
    heroEyebrow: z.string().max(180),
    heroTitle: z.string().max(220),
    heroSubtitle: z.string().max(500),
    aboutTitle: z.string().max(220),
    aboutBody: z.string().max(1200),
  })
  .partial();

const LoyaltyProgramPatchSchema = z
  .object({
    id: NonEmptyIdSchema.optional(),
    isActive: z.boolean().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    stampsRequired: z.number().int().min(1).max(30).optional(),
    rewardType: RewardTypeSchema.optional(),
    rewardServiceId: NonEmptyIdSchema.nullable().optional(),
    discountPercent: z.number().int().min(1).max(100).nullable().optional(),
    maxDiscountCents: CentsNonNegativeSchema.max(10_000_000).nullable().optional(),
    validDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .optional();

export const BrandPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    tagline: z.string().max(240),
    description: z.string().max(1000),
    logoUrl: z.string().max(2_500_000).nullable(),
    coverImageUrl: z.string().max(2_500_000).nullable(),
    address: z.string().max(240),
    city: z.string().max(120),
    mapsUrl: z.string().max(500),
    instagramHandle: z.string().max(120),
    instagramUrl: z.string().max(500),
    sisterStudioHandle: z.string().max(120),
    whatsappNumber: z.string().max(32),
    contactEmail: z.string().email().or(z.literal('')),
    timezone: z.string().min(1).max(80),

    brandAccentLight: z.string().max(32),
    brandAccentDark: z.string().max(32),
    defaultPublicMode: ThemeModePreferenceSchema,
    defaultAdminMode: ThemeModePreferenceSchema,
    cornerStyle: CornerStyleSchema,
    defaultBookingLayout: BookingLayoutViewSchema,
    enabledBookingLayouts: z.array(BookingLayoutViewSchema).min(1),
    lockTimezone: z.boolean(),
    slotIntervalMinutes: SlotIntervalMinutesSchema,
    optimizeContinuousSlots: z.boolean(),
    enableSlotHold: z.boolean(),
    slotHoldMinutes: z.number().int().min(1).max(15),

    minBookingNoticeMinutes: z.number().int().min(0).max(10_080),
    maxBookingDaysAhead: z.number().int().min(1).max(365),
    minCancelHours: z.number().int().min(0).max(168),
    minRescheduleHours: z.number().int().min(0).max(168),
    cancellationPolicyText: z.string().max(1000),
    bookingInstructionsText: z.string().max(1000),

    paymentMode: PaymentModeSchema,
    depositBankName: z.string().max(120),
    depositAccountHolder: z.string().max(160),
    depositBeneficiary: z.string().max(160),
    depositClabe: z.string().max(40),
    depositAmountCents: CentsNonNegativeSchema.max(10_000_000),
    depositInstructions: z.string().max(1000),
    currency: CurrencySchema,

    serviceMode: ServiceModeSchema,
    businessType: z.string().max(120),
    teamSizeTier: z.string().max(60),
    onboardingCompleted: z.boolean(),
    soundAlertsEnabled: z.boolean(),
    lockPastBookings: z.boolean(),
    maxActiveBookingsPerClient: z.number().int().min(1).max(20),
    privacyPolicyVersion: z.string().trim().min(1).max(40),
    noShowDepositThreshold: z.number().int().min(0).max(10),
    ownerPinEnabled: z.boolean(),
    ownerPin: z.string().trim().min(4).max(6),
    clearOwnerPin: z.boolean(),

    landingContent: LandingContentPatchSchema,
    loyaltyProgram: LoyaltyProgramPatchSchema,

    whatsappBookingEnabled: z.boolean(),
    smsRemindersEnabled: z.boolean(),

    metaPixelId: z.string().max(120).nullable(),
    ga4MeasurementId: z.string().max(120).nullable(),
    googleReviewUrl: z.string().max(500).nullable(),
    defaultCommissionPercent: z.number().min(0).max(100),
  })
  .partial();

export const GalleryItemInputSchema = z.object({
  id: NonEmptyIdSchema.optional(),
  title: z.string().trim().min(1).max(120),
  caption: z.string().max(400).default(''),
  category: z.string().max(80).default('Gel'),
  imageUrl: z.string().min(1).max(2_500_000),
  serviceId: NonEmptyIdSchema.nullable().default(null),
  isFeatured: z.boolean().default(true),
});

export const OnboardingPostSchema = z.object({
  businessType: z.string().trim().min(1).max(120).optional(),
  teamSizeTier: z.string().trim().min(1).max(60).optional(),
  salonName: z.string().trim().min(2, 'Nombre del estudio muy corto').max(120).optional(),
  serviceMode: ServiceModeSchema.optional(),
  address: z.string().trim().max(240).optional(),
  soundAlertsEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
  starterService: StarterServiceSchema.optional(),
});

export const ReportPeriodSchema = z.enum(['7d', '30d', '90d', 'all']);
