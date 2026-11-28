import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { BrandPatchSchema, GalleryItemInputSchema } from '@/lib/contracts';
import {
  ADMIN_PRIVATE_HEADERS,
  withAdminPrivateHeaders,
} from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import { toAdminSettingsDTO } from '@/lib/public-dto';
import {
  deleteGalleryItem,
  normalizeInstagramHandle,
  persistBrandMediaField,
  PolicyError,
  updateSalonSettings,
  upsertGalleryItem,
  upsertLoyaltyProgram,
} from '@/lib/repositories/db';
import { hashOwnerPin, isValidOwnerPinFormat } from '@/lib/security/auth-pin';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';
import type { SalonSettings } from '@/lib/types';

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede modificar la marca y configuración global.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const parsed = BrandPatchSchema.parse(rawBody);
    const {
      landingContent,
      loyaltyProgram,
      ownerPin,
      clearOwnerPin,
      ...rest
    } = parsed;
    const patch: Partial<SalonSettings> = { ...rest };

    if (clearOwnerPin || ownerPin !== undefined) {
      const rate = checkRateLimit({
        bucket: 'admin:owner-pin-manage',
        key: `${session.user.id}:${getRequestIp(request)}`,
        limit: 10,
        windowMs: 5 * 60_000,
      });
      if (!rate.allowed) {
        return NextResponse.json(
          {
            code: 'RATE_LIMITED',
            error:
              'Demasiados cambios de PIN de autorización. Espera unos minutos e intenta de nuevo.',
          },
          {
            status: 429,
            headers: withAdminPrivateHeaders({
              'Retry-After': String(rate.retryAfterSeconds),
              'X-RateLimit-Remaining': '0',
            }),
          },
        );
      }
    }

    if (clearOwnerPin) {
      patch.ownerPinHash = null;
      patch.ownerPinEnabled = false;
    } else if (ownerPin !== undefined) {
      if (!isValidOwnerPinFormat(ownerPin)) {
        return NextResponse.json(
          {
            code: 'INVALID_OWNER_PIN',
            error: 'El PIN de dueña debe tener entre 4 y 6 dígitos numéricos.',
          },
          { status: 400, headers: ADMIN_PRIVATE_HEADERS },
        );
      }
      patch.ownerPinHash = hashOwnerPin(ownerPin);
      if (patch.ownerPinEnabled === undefined) {
        patch.ownerPinEnabled = true;
      }
    }

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

    if (parsed.logoUrl !== undefined) {
      patch.logoUrl = await persistBrandMediaField(parsed.logoUrl);
    }
    if (parsed.coverImageUrl !== undefined) {
      patch.coverImageUrl = await persistBrandMediaField(parsed.coverImageUrl);
    }

    const sanitizedLandingContent = landingContent ? { ...landingContent } : undefined;
    if (sanitizedLandingContent && sanitizedLandingContent.heroImageDesktopUrl !== undefined) {
      sanitizedLandingContent.heroImageDesktopUrl = await persistBrandMediaField(
        sanitizedLandingContent.heroImageDesktopUrl,
      );
    }
    if (sanitizedLandingContent && sanitizedLandingContent.heroImageMobileUrl !== undefined) {
      sanitizedLandingContent.heroImageMobileUrl = await persistBrandMediaField(
        sanitizedLandingContent.heroImageMobileUrl,
      );
    }

    const settings = await updateSalonSettings({
      ...patch,
      ...(sanitizedLandingContent ? { landingContent: sanitizedLandingContent } : {}),
    });

    const updatedProgram = loyaltyProgram
      ? await upsertLoyaltyProgram(loyaltyProgram)
      : undefined;

    return NextResponse.json(
      {
        settings: toAdminSettingsDTO(settings),
        ...(updatedProgram ? { loyaltyProgram: updatedProgram } : {}),
      },
      { headers: ADMIN_PRIVATE_HEADERS },
    );
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa la configuración ingresada.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_brand_patch_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Error actualizando configuración' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede modificar la galería de marca.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const parsed = GalleryItemInputSchema.parse(rawBody);
    const storedImageUrl = await persistBrandMediaField(parsed.imageUrl);
    if (!storedImageUrl) {
      return NextResponse.json(
        { error: 'Agrega una imagen válida (PNG, JPG o WEBP).' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    const item = await upsertGalleryItem({
      ...parsed,
      imageUrl: storedImageUrl,
    });
    return NextResponse.json({ item }, { headers: ADMIN_PRIVATE_HEADERS });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos de galería inválidos.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_brand_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Error guardando imagen' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede modificar la galería de marca.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) await deleteGalleryItem(id);
  return NextResponse.json({ ok: true }, { headers: ADMIN_PRIVATE_HEADERS });
}
