import { z } from 'zod';
import {
  BookingLayoutViewSchema,
  BookingStatusSchema,
  ClientPackageStatusSchema,
  CornerStyleSchema,
  CurrencySchema,
  LandingContentSchema,
  PaymentModeSchema,
  RatingSchema,
  ServiceModeSchema,
  SlotIntervalMinutesSchema,
  ThemeModePreferenceSchema,
} from '@/lib/contracts';
import type {
  BookingReview,
  BookingWithRelations,
  CalendarConnection,
  ClientPackage,
  SalonSettings,
  Service,
  StaffMember,
} from './types';

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
  isPrivate: z.boolean().optional(),
  displayOrder: z.number(),
  imageUrl: z.string().nullable(),
});

export type PublicServiceDTO = z.infer<typeof PublicServiceDTOSchema>;

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
  defaultPublicMode: ThemeModePreferenceSchema,
  cornerStyle: CornerStyleSchema,
  defaultBookingLayout: BookingLayoutViewSchema,
  enabledBookingLayouts: z.array(BookingLayoutViewSchema),
  lockTimezone: z.boolean(),
  slotIntervalMinutes: SlotIntervalMinutesSchema,
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
  depositAmountCents: z.number().optional(),
  depositInstructions: z.string(),
  currency: CurrencySchema,
  serviceMode: ServiceModeSchema.optional(),
  privacyPolicyVersion: z.string().optional(),
  optimizeContinuousSlots: z.boolean().optional(),
  landingContent: LandingContentSchema,
  whatsappBookingEnabled: z.boolean(),
  metaPixelId: z.string().nullable(),
  ga4MeasurementId: z.string().nullable(),
  googleReviewUrl: z.string().nullable(),
  updatedAt: z.string(),
});

export type PublicSettingsDTO = z.infer<typeof PublicSettingsDTOSchema>;

export const PublicReviewDTOSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  clientFirstName: z.string(),
  rating: RatingSchema,
  comment: z.string(),
  createdAt: z.string(),
});

export type PublicReviewDTO = z.infer<typeof PublicReviewDTOSchema>;

export const PublicLoyaltySummarySchema = z.object({
  currentStamps: z.number().int().nonnegative(),
  stampsRequired: z.number().int().positive(),
  remainingForReward: z.number().int().nonnegative(),
  isRewardReady: z.boolean(),
  isNearReward: z.boolean(),
  totalStamps: z.number().int().nonnegative(),
  redemptionsAvailable: z.number().int().nonnegative(),
  rewardLabel: z.string(),
  programName: z.string(),
});

export type PublicLoyaltySummaryDTO = z.infer<typeof PublicLoyaltySummarySchema>;

export const PublicClientPackageDTOSchema = z.object({
  id: z.string(),
  packageId: z.string(),
  packageName: z.string(),
  serviceId: z.string(),
  serviceName: z.string(),
  totalSessions: z.number().int().positive(),
  usedSessions: z.number().int().nonnegative(),
  remainingSessions: z.number().int().nonnegative(),
  purchasedAt: z.string(),
  expiresAt: z.string().nullable(),
  status: ClientPackageStatusSchema,
});

export type PublicClientPackageDTO = z.infer<typeof PublicClientPackageDTOSchema>;

const ClientPortalBookingDTOSchema = z.object({
  id: z.string(),
  bookingCode: z.string(),
  manageToken: z.string(),
  manageUrl: z.string(),
  status: BookingStatusSchema,
  startAt: z.string(),
  endAt: z.string(),
  totalDurationMinutes: z.number(),
  totalPriceCents: z.number(),
  depositAmountCents: z.number(),
  serviceId: z.string(),
  serviceName: z.string(),
  serviceSlug: z.string(),
  staffId: z.string(),
  staffName: z.string(),
  staffBookingSlug: z.string(),
  addons: z.array(
    z.object({
      name: z.string(),
      extraPriceCents: z.number(),
    }),
  ),
  touchUpUrl: z.string(),
});

export type ClientPortalBookingDTO = z.infer<typeof ClientPortalBookingDTOSchema>;

export const ClientPortalSnapshotDTOSchema = z.object({
  phoneE164: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  bookings: z.array(ClientPortalBookingDTOSchema),
  loyaltySummary: PublicLoyaltySummarySchema.nullable(),
  packages: z.array(PublicClientPackageDTOSchema),
});

export type ClientPortalSnapshotDTO = z.infer<typeof ClientPortalSnapshotDTOSchema>;

type AdminSettingsDTO = Omit<SalonSettings, 'ownerPinHash'> & {
  hasOwnerPin: boolean;
};

type AdminCalendarConnectionDTO = Omit<
  CalendarConnection,
  'accessTokenEncrypted' | 'refreshTokenEncrypted'
>;

export function toPublicClientPackageDTO(
  pkg: ClientPackage,
  params: {
    serviceName: string;
    remainingSessions: number;
    effectiveStatus: ClientPackage['status'];
  },
): PublicClientPackageDTO {
  return PublicClientPackageDTOSchema.parse({
    id: pkg.id,
    packageId: pkg.packageId,
    packageName: pkg.packageName,
    serviceId: pkg.serviceId,
    serviceName: params.serviceName,
    totalSessions: pkg.totalSessions,
    usedSessions: pkg.usedSessions,
    remainingSessions: params.remainingSessions,
    purchasedAt: pkg.purchasedAt,
    expiresAt: pkg.expiresAt,
    status: params.effectiveStatus,
  });
}

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
    isPrivate: service.isPrivate,
    displayOrder: service.displayOrder,
    imageUrl: service.imageUrl,
  });
}

export function toPublicBookingDTO(
  booking: BookingWithRelations,
  allServices: readonly Service[],
) {
  const extraIds = booking.extraServiceIds ?? [];
  const extraServices =
    extraIds.length === 0
      ? []
      : extraIds
          .filter((id) => id !== booking.serviceId)
          .map((id) => allServices.find((srv) => srv.id === id))
          .filter((srv): srv is Service => Boolean(srv))
          .map(toPublicServiceDTO);

  return {
    ...booking,
    internalNotes: '',
    client: {
      ...booking.client,
      notes: '',
    },
    staff: toPublicStaffDTO(booking.staff),
    service: toPublicServiceDTO(booking.service),
    extraServices,
  };
}

export function toAdminSettingsDTO(settings: SalonSettings): AdminSettingsDTO {
  const { ownerPinHash, ...rest } = settings;
  const hasOwnerPin = Boolean(ownerPinHash || settings.hasOwnerPin);
  return {
    ...rest,
    enabledBookingLayouts: [...rest.enabledBookingLayouts],
    landingContent: { ...rest.landingContent },
    ownerPinEnabled: Boolean(rest.ownerPinEnabled && hasOwnerPin),
    hasOwnerPin,
  };
}

export function toAdminCalendarConnectionDTO(
  connection: CalendarConnection,
): AdminCalendarConnectionDTO {
  const {
    accessTokenEncrypted: _accessTokenEncrypted,
    refreshTokenEncrypted: _refreshTokenEncrypted,
    ...rest
  } = connection;
  return {
    ...rest,
    conflictCalendarIds: [...rest.conflictCalendarIds],
    availableCalendars: rest.availableCalendars.map((c) => ({ ...c })),
    ...(rest.externalBusyBlocks
      ? { externalBusyBlocks: rest.externalBusyBlocks.map((b) => ({ ...b })) }
      : {}),
  };
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
    privacyPolicyVersion: settings.privacyPolicyVersion,
    optimizeContinuousSlots: settings.optimizeContinuousSlots,
    landingContent: { ...settings.landingContent },
    whatsappBookingEnabled: settings.whatsappBookingEnabled,
    metaPixelId: settings.metaPixelId,
    ga4MeasurementId: settings.ga4MeasurementId,
    googleReviewUrl: settings.googleReviewUrl,
    updatedAt: settings.updatedAt,
  });
}

function extractClientFirstName(fullName?: string | null): string {
  const trimmed = (fullName ?? '').trim();
  if (!trimmed) return 'Clienta verificada';
  const [first] = trimmed.split(/\s+/);
  return first || 'Clienta verificada';
}

export function toPublicReviewDTO(
  review: BookingReview,
  params: { serviceId: string; clientFullName?: string | null },
): PublicReviewDTO {
  return PublicReviewDTOSchema.parse({
    id: review.id,
    serviceId: params.serviceId,
    clientFirstName: extractClientFirstName(params.clientFullName),
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
  });
}
