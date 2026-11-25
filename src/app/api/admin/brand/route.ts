import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  deleteGalleryItem,
  normalizeInstagramHandle,
  PolicyError,
  updateSalonSettings,
  upsertGalleryItem,
  upsertLoyaltyProgram,
} from '@/lib/repositories/db';
import type { SalonSettings } from '@/lib/types';

const landingContentPatchSchema = z
  .object({
    heroEyebrow: z.string().max(180),
    heroTitle: z.string().max(220),
    heroSubtitle: z.string().max(500),
    aboutTitle: z.string().max(220),
    aboutBody: z.string().max(1200),
  })
  .partial();

const loyaltyProgramPatchSchema = z
  .object({
    id: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    name: z.string().trim().min(2).max(120).optional(),
    stampsRequired: z.number().int().min(1).max(30).optional(),
    rewardType: z.enum(['free_service', 'percent_discount']).optional(),
    rewardServiceId: z.string().min(1).nullable().optional(),
    discountPercent: z.number().int().min(1).max(100).nullable().optional(),
    maxDiscountCents: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
    validDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .optional();

const brandPatchSchema = z
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
    defaultPublicMode: z.enum(['light', 'dark', 'system']),
    defaultAdminMode: z.enum(['light', 'dark', 'system']),
    cornerStyle: z.enum(['sharp', 'soft', 'rounded', 'pill']),
    defaultBookingLayout: z.enum(['month', 'week', 'column']),
    enabledBookingLayouts: z.array(z.enum(['month', 'week', 'column'])).min(1),
    lockTimezone: z.boolean(),
    slotIntervalMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    optimizeContinuousSlots: z.boolean(),
    enableSlotHold: z.boolean(),
    slotHoldMinutes: z.number().int().min(1).max(15),

    minBookingNoticeMinutes: z.number().int().min(0).max(10_080),
    maxBookingDaysAhead: z.number().int().min(1).max(365),
    minCancelHours: z.number().int().min(0).max(168),
    minRescheduleHours: z.number().int().min(0).max(168),
    cancellationPolicyText: z.string().max(1000),
    bookingInstructionsText: z.string().max(1000),

    paymentMode: z.enum(['none', 'manual_transfer', 'stripe', 'mercadopago']),
    depositBankName: z.string().max(120),
    depositAccountHolder: z.string().max(160),
    depositBeneficiary: z.string().max(160),
    depositClabe: z.string().max(40),
    depositAmountCents: z.number().int().nonnegative().max(10_000_000),
    depositInstructions: z.string().max(1000),
    currency: z.enum(['MXN', 'USD']),

    serviceMode: z.enum(['studio', 'home', 'online']),
    businessType: z.string().max(120),
    teamSizeTier: z.string().max(60),
    onboardingCompleted: z.boolean(),
    soundAlertsEnabled: z.boolean(),
    lockPastBookings: z.boolean(),
    maxActiveBookingsPerClient: z.number().int().min(1).max(20),
    privacyPolicyVersion: z.string().trim().min(1).max(40),

    landingContent: landingContentPatchSchema,
    loyaltyProgram: loyaltyProgramPatchSchema,

    whatsappBookingEnabled: z.boolean(),
    smsRemindersEnabled: z.boolean(),

    metaPixelId: z.string().max(120).nullable(),
    ga4MeasurementId: z.string().max(120).nullable(),
    googleReviewUrl: z.string().max(500).nullable(),
    defaultCommissionPercent: z.number().min(0).max(100),
  })
  .partial();

const galleryItemSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(120),
  caption: z.string().max(400).default(''),
  category: z.string().max(80).default('Gel'),
  imageUrl: z.string().min(1).max(2_500_000),
  serviceId: z.string().min(1).nullable().default(null),
  isFeatured: z.boolean().default(true),
});

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede modificar la marca y configuración global.' },
      { status: 403 },
    );
  }

  try {
    const parsed = brandPatchSchema.parse(await request.json());
    const { landingContent, loyaltyProgram, ...rest } = parsed;
    const patch: Partial<SalonSettings> = { ...rest };

    if (parsed.instagramHandle !== undefined) {
      patch.instagramHandle = parsed.instagramHandle.trim()
        ? (normalizeInstagramHandle(parsed.instagramHandle) ?? '')
        : '';
    }
    if (parsed.sisterStudioHandle !== undefined) {
      patch.sisterStudioHandle = parsed.sisterStudioHandle.trim()
        ? normalizeInstagramHandle(parsed.sisterStudioHandle)
        : '';
    }
    if (parsed.depositBeneficiary !== undefined && parsed.depositAccountHolder === undefined) {
      patch.depositAccountHolder = parsed.depositBeneficiary;
    }

    const settings = await updateSalonSettings({
      ...patch,
      ...(landingContent ? { landingContent } : {}),
    });

    const updatedProgram = loyaltyProgram
      ? await upsertLoyaltyProgram(loyaltyProgram)
      : undefined;

    return NextResponse.json({
      settings,
      ...(updatedProgram ? { loyaltyProgram: updatedProgram } : {}),
    });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa la configuración ingresada.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error actualizando configuración' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  try {
    const parsed = galleryItemSchema.parse(await request.json());
    const item = await upsertGalleryItem(parsed);
    return NextResponse.json({ item });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos de galería inválidos.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error guardando imagen' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) await deleteGalleryItem(id);
  return NextResponse.json({ ok: true });
}
