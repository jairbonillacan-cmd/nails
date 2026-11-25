import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { upsertAddon, upsertService } from '@/lib/repositories/db';

const serviceInputSchema = z.object({
  id: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(2, 'Nombre requerido').max(120),
  slug: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  durationMinutes: z.number().int().min(15).max(480),
  priceCents: z.number().int().nonnegative().max(10_000_000),
  isStartingPrice: z.boolean().optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  requiresConfirmation: z.boolean().optional(),
  depositRequired: z.boolean().optional(),
  depositAmountCents: z.number().int().nonnegative().max(10_000_000).optional(),
  allowInspoPhoto: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  imageUrl: z.string().max(2_500_000).nullable().optional(),
});

const addonInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(2, 'Nombre requerido').max(120),
  description: z.string().max(600).optional(),
  extraMinutes: z.number().int().min(0).max(240),
  extraPriceCents: z.number().int().nonnegative().max(10_000_000),
  appliesToAll: z.boolean().optional(),
  serviceIds: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

const catalogBodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('addon'),
    data: addonInputSchema,
  }),
  z.object({
    kind: z.literal('service'),
    data: serviceInputSchema,
  }),
]);

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  try {
    const raw = (await request.json()) as { kind?: unknown; data?: unknown };
    const normalized =
      raw && typeof raw === 'object' && raw.kind === undefined
        ? { kind: 'service' as const, data: raw.data }
        : raw;
    const parsed = catalogBodySchema.parse(normalized);

    if (parsed.kind === 'addon') {
      const addon = await upsertAddon(parsed.data);
      return NextResponse.json({ addon });
    }
    const service = await upsertService(parsed.data);
    return NextResponse.json({ service });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos del catálogo' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error guardando catálogo' },
      { status: 400 },
    );
  }
}
