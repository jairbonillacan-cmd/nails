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

const LandingFaqItemSchema = z.object({
  id: z.string().trim().min(1).max(80),
  question: z.string().trim().min(1).max(240),
  answer: z.string().trim().min(1).max(1000),
});

const LandingSectionsSchema = z
  .object({
    showMarquee: z.boolean(),
    showHeroRating: z.boolean(),
    showMenu: z.boolean(),
    showCreations: z.boolean(),
    showReviews: z.boolean(),
    showTeam: z.boolean(),
    showConnect: z.boolean(),
    showFaq: z.boolean(),
    showVisit: z.boolean(),
    showMapEmbed: z.boolean(),
  })
  .partial();

const LandingGalleryModeSchema = z.enum(['mix', 'custom_only']);

export const LandingContentSchema = z.object({
  heroEyebrow: z.string(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  aboutTitle: z.string(),
  aboutBody: z.string(),
  heroPrimaryCta: z.string().max(80).optional(),
  heroSecondaryCta: z.string().max(80).optional(),
  heroImageDesktopUrl: z.string().max(3_600_000).nullable().optional(),
  heroImageMobileUrl: z.string().max(3_600_000).nullable().optional(),
  marqueeItems: z.array(z.string().max(120)).max(8).optional(),
  menuTitle: z.string().max(120).optional(),
  menuBannerText: z.string().max(240).optional(),
  creationsTitle: z.string().max(160).optional(),
  creationsSubtitle: z.string().max(320).optional(),
  galleryMode: LandingGalleryModeSchema.optional(),
  reviewsTitle: z.string().max(160).optional(),
  reviewsSubtitle: z.string().max(320).optional(),
  teamTitle: z.string().max(160).optional(),
  teamSubtitle: z.string().max(320).optional(),
  connectTitle: z.string().max(120).optional(),
  connectSubtitle: z.string().max(320).optional(),
  faqTitle: z.string().max(160).optional(),
  faqSubtitle: z.string().max(320).optional(),
  customFaqs: z.array(LandingFaqItemSchema).max(12).optional(),
  visitTitle: z.string().max(120).optional(),
  visitHoursDays: z.string().max(120).optional(),
  visitHoursText: z.string().max(180).optional(),
  sections: LandingSectionsSchema.optional(),
});

const LandingContentPatchSchema = z
  .object({
    heroEyebrow: z.string().max(180),
    heroTitle: z.string().max(220),
    heroSubtitle: z.string().max(500),
    aboutTitle: z.string().max(220),
    aboutBody: z.string().max(1200),
    heroPrimaryCta: z.string().max(80),
    heroSecondaryCta: z.string().max(80),
    heroImageDesktopUrl: z.string().max(3_600_000).nullable(),
    heroImageMobileUrl: z.string().max(3_600_000).nullable(),
    marqueeItems: z.array(z.string().max(120)).max(8),
    menuTitle: z.string().max(120),
    menuBannerText: z.string().max(240),
    creationsTitle: z.string().max(160),
    creationsSubtitle: z.string().max(320),
    galleryMode: LandingGalleryModeSchema,
    reviewsTitle: z.string().max(160),
    reviewsSubtitle: z.string().max(320),
    teamTitle: z.string().max(160),
    teamSubtitle: z.string().max(320),
    connectTitle: z.string().max(120),
    connectSubtitle: z.string().max(320),
    faqTitle: z.string().max(160),
    faqSubtitle: z.string().max(320),
    customFaqs: z.array(LandingFaqItemSchema).max(12),
    visitTitle: z.string().max(120),
    visitHoursDays: z.string().max(120),
    visitHoursText: z.string().max(180),
    sections: LandingSectionsSchema,
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
    logoUrl: z.string().max(3_600_000).nullable(),
    coverImageUrl: z.string().max(3_600_000).nullable(),
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
  imageUrl: z.string().min(1).max(3_600_000),
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
