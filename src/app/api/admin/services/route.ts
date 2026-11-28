import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { CatalogMutationSchema } from '@/lib/contracts';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import {
  persistBrandMediaField,
  PolicyError,
  upsertAddon,
  upsertService,
  upsertServiceCategory,
} from '@/lib/repositories/db';

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let raw: { kind?: unknown; data?: unknown };
  try {
    raw = (await request.json()) as { kind?: unknown; data?: unknown };
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const normalized =
      raw && typeof raw === 'object' && raw.kind === undefined
        ? { kind: 'service' as const, data: raw.data }
        : raw;
    const parsed = CatalogMutationSchema.parse(normalized);

    if (parsed.kind === 'category') {
      const category = await upsertServiceCategory(parsed.data);
      return NextResponse.json({ category }, { headers: ADMIN_PRIVATE_HEADERS });
    }
    if (parsed.kind === 'addon') {
      const addon = await upsertAddon(parsed.data);
      return NextResponse.json({ addon }, { headers: ADMIN_PRIVATE_HEADERS });
    }
    const serviceInput =
      parsed.data.imageUrl === undefined
        ? parsed.data
        : { ...parsed.data, imageUrl: await persistBrandMediaField(parsed.data.imageUrl) };
    const service = await upsertService(serviceInput);
    return NextResponse.json({ service }, { headers: ADMIN_PRIVATE_HEADERS });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos del catálogo' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_services_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Error guardando catálogo' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
