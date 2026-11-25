import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  getSnapshot,
  PolicyError,
  saveOnboardingSetup,
} from '@/lib/repositories/db';

const starterServiceSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2, 'Nombre de servicio muy corto').max(120),
  priceCents: z.number().int().nonnegative().max(10_000_000),
  durationMinutes: z.number().int().min(15).max(480),
  isStartingPrice: z.boolean().optional(),
});

const onboardingPostSchema = z.object({
  businessType: z.string().trim().min(1).max(120).optional(),
  teamSizeTier: z.string().trim().min(1).max(60).optional(),
  salonName: z.string().trim().min(2, 'Nombre del estudio muy corto').max(120).optional(),
  serviceMode: z.enum(['studio', 'home', 'online']).optional(),
  address: z.string().trim().max(240).optional(),
  soundAlertsEnabled: z.boolean().optional(),
  onboardingCompleted: z.boolean().optional(),
  starterService: starterServiceSchema.optional(),
});

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede acceder a la configuración inicial.' },
      { status: 403 },
    );
  }

  const db = getSnapshot();
  return NextResponse.json({
    onboarding: {
      businessType: db.settings.businessType ?? '',
      teamSizeTier: db.settings.teamSizeTier ?? '',
      salonName: db.settings.name,
      serviceMode: db.settings.serviceMode ?? 'studio',
      address: db.settings.address,
      soundAlertsEnabled: db.settings.soundAlertsEnabled ?? true,
      onboardingCompleted: db.settings.onboardingCompleted ?? false,
    },
    starterServices: db.services.filter((s) => s.isActive).slice(0, 5),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner') {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede guardar la configuración inicial.' },
      { status: 403 },
    );
  }

  try {
    const parsed = onboardingPostSchema.parse(await request.json());
    const result = await saveOnboardingSetup(parsed);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos de configuración.' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo guardar la configuración inicial.' },
      { status: 500 },
    );
  }
}
