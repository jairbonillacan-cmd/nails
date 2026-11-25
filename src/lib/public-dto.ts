import { z } from 'zod';
import type { SalonSettings, Service, StaffMember } from './types';

export const PublicStaffDTOSchema = z.object({
  id: z.string(),
  name: z.string(),
  roleTitle: z.string(),
  bio: z.string(),
  avatarUrl: z.string().nullable(),
  bookingSlug: z.string(),
  displayOrder: z.number(),
  serviceIds: z.array(z.string()),
});

export type PublicStaffDTO = z.infer<typeof PublicStaffDTOSchema>;

export const PublicServiceDTOSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  durationMinutes: z.number(),
  priceCents: z.number(),
  isStartingPrice: z.boolean().optional(),
  requiresConfirmation: z.boolean(),
  depositRequired: z.boolean(),
  depositAmountCents: z.number(),
  allowInspoPhoto: z.boolean(),
  isFeatured: z.boolean(),
  displayOrder: z.number(),
  imageUrl: z.string().nullable(),
});

export type PublicServiceDTO = z.infer<typeof PublicServiceDTOSchema>;

const PublicLandingContentSchema = z.object({
  heroEyebrow: z.string(),
  heroTitle: z.string(),
  heroSubtitle: z.string(),
  aboutTitle: z.string(),
  aboutBody: z.string(),
});

const BookingLayoutViewSchema = z.enum(['month', 'week', 'column']);

export const PublicSettingsDTOSchema = z.object({
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
  defaultPublicMode: z.enum(['light', 'dark', 'system']),
  cornerStyle: z.enum(['sharp', 'soft', 'rounded', 'pill']),
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
  paymentMode: z.enum(['none', 'manual_transfer', 'stripe', 'mercadopago']),
  depositBankName: z.string(),
  depositAccountHolder: z.string(),
  depositBeneficiary: z.string().optional(),
  depositClabe: z.string(),
  depositAmountCents: z.number().optional(),
  depositInstructions: z.string(),
  currency: z.enum(['MXN', 'USD']),
  serviceMode: z.enum(['studio', 'home', 'online']).optional(),
  landingContent: PublicLandingContentSchema,
  whatsappBookingEnabled: z.boolean(),
  metaPixelId: z.string().nullable(),
  ga4MeasurementId: z.string().nullable(),
  googleReviewUrl: z.string().nullable(),
  updatedAt: z.string(),
});

export type PublicSettingsDTO = z.infer<typeof PublicSettingsDTOSchema>;

export function toPublicStaffDTO(staff: StaffMember): PublicStaffDTO {
  return PublicStaffDTOSchema.parse({
    id: staff.id,
    name: staff.name,
    roleTitle: staff.roleTitle,
    bio: staff.bio,
    avatarUrl: staff.avatarUrl,
    bookingSlug: staff.bookingSlug,
    displayOrder: staff.displayOrder,
    serviceIds: [...staff.serviceIds],
  });
}

export function toPublicServiceDTO(service: Service): PublicServiceDTO {
  return PublicServiceDTOSchema.parse({
    id: service.id,
    categoryId: service.categoryId,
    name: service.name,
    slug: service.slug,
    description: service.description,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    isStartingPrice: service.isStartingPrice,
    requiresConfirmation: service.requiresConfirmation,
    depositRequired: service.depositRequired,
    depositAmountCents: service.depositAmountCents,
    allowInspoPhoto: service.allowInspoPhoto,
    isFeatured: service.isFeatured,
    displayOrder: service.displayOrder,
    imageUrl: service.imageUrl,
  });
}

export function toPublicSettingsDTO(settings: SalonSettings): PublicSettingsDTO {
  return PublicSettingsDTOSchema.parse({
    id: settings.id,
    name: settings.name,
    tagline: settings.tagline,
    description: settings.description,
    logoUrl: settings.logoUrl,
    coverImageUrl: settings.coverImageUrl,
    address: settings.address,
    city: settings.city,
    mapsUrl: settings.mapsUrl,
    instagramHandle: settings.instagramHandle,
    instagramUrl: settings.instagramUrl,
    sisterStudioHandle: settings.sisterStudioHandle,
    whatsappNumber: settings.whatsappNumber,
    contactEmail: settings.contactEmail,
    timezone: settings.timezone,
    brandAccentLight: settings.brandAccentLight,
    brandAccentDark: settings.brandAccentDark,
    defaultPublicMode: settings.defaultPublicMode,
    cornerStyle: settings.cornerStyle,
    defaultBookingLayout: settings.defaultBookingLayout,
    enabledBookingLayouts: [...settings.enabledBookingLayouts],
    lockTimezone: settings.lockTimezone,
    slotIntervalMinutes: settings.slotIntervalMinutes,
    enableSlotHold: settings.enableSlotHold,
    slotHoldMinutes: settings.slotHoldMinutes,
    minBookingNoticeMinutes: settings.minBookingNoticeMinutes,
    maxBookingDaysAhead: settings.maxBookingDaysAhead,
    minCancelHours: settings.minCancelHours,
    minRescheduleHours: settings.minRescheduleHours,
    cancellationPolicyText: settings.cancellationPolicyText,
    bookingInstructionsText: settings.bookingInstructionsText,
    paymentMode: settings.paymentMode,
    depositBankName: settings.depositBankName,
    depositAccountHolder: settings.depositAccountHolder,
    depositBeneficiary: settings.depositBeneficiary,
    depositClabe: settings.depositClabe,
    depositAmountCents: settings.depositAmountCents,
    depositInstructions: settings.depositInstructions,
    currency: settings.currency,
    serviceMode: settings.serviceMode,
    landingContent: { ...settings.landingContent },
    whatsappBookingEnabled: settings.whatsappBookingEnabled,
    metaPixelId: settings.metaPixelId,
    ga4MeasurementId: settings.ga4MeasurementId,
    googleReviewUrl: settings.googleReviewUrl,
    updatedAt: settings.updatedAt,
  });
}
