import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { OnboardingPostSchema } from '@/lib/contracts';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import { toAdminSettingsDTO } from '@/lib/public-dto';
import {
  getRepository,
  PolicyError,
  saveOnboardingSetup,
} from '@/lib/repositories/db';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede acceder a la configuración inicial.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const repo = getRepository();
  const [settings, starterServices] = await Promise.all([
    repo.getSalonSettings(),
    repo.listActiveServices(5),
  ]);
  return NextResponse.json(
    {
      onboarding: {
        businessType: settings.businessType ?? '',
        teamSizeTier: settings.teamSizeTier ?? '',
        salonName: settings.name,
        serviceMode: settings.serviceMode ?? 'studio',
        address: settings.address,
        soundAlertsEnabled: settings.soundAlertsEnabled ?? true,
        onboardingCompleted: settings.onboardingCompleted ?? false,
      },
      starterServices,
    },
    { headers: ADMIN_PRIVATE_HEADERS },
  );
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
      { error: 'Solo la Dueña (Owner) puede guardar la configuración inicial.' },
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
    const parsed = OnboardingPostSchema.parse(rawBody);
    const result = await saveOnboardingSetup(parsed);
    return NextResponse.json(
      {
        ...result,
        settings: toAdminSettingsDTO(result.settings),
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
        { error: err.issues[0]?.message || 'Revisa los datos de configuración.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_onboarding_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo guardar la configuración inicial.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
