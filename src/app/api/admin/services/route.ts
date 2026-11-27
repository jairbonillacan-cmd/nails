import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { CatalogMutationSchema } from '@/lib/contracts';
import { PolicyError, upsertAddon, upsertService } from '@/lib/repositories/db';

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
    const parsed = CatalogMutationSchema.parse(normalized);

    if (parsed.kind === 'addon') {
      const addon = await upsertAddon(parsed.data);
      return NextResponse.json({ addon });
    }
    const service = await upsertService(parsed.data);
    return NextResponse.json({ service });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos del catálogo' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error guardando catálogo' }, { status: 400 });
  }
}
