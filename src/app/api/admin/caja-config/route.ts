import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { CajaConfigSchema } from '@/lib/contracts/brand';
import { normalizeExpenseCategories, resolveCajaConfig } from '@/lib/caja/caja-config';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import { PolicyError, updateSalonSettings } from '@/lib/repositories/db';

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { code: 'FORBIDDEN', error: 'Solo dueña o recepción pueden personalizar la caja.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const body: unknown = await request.json();
    const raw = z.object({ cajaConfig: z.unknown() }).strict().parse(body);
    const candidate = CajaConfigSchema.parse(raw.cajaConfig);
    const cajaConfig = {
      ...candidate,
      expenseCategories: normalizeExpenseCategories(candidate.expenseCategories),
    };
    const settings = await updateSalonSettings({ landingContent: { cajaConfig } });
    return NextResponse.json(
      { cajaConfig: resolveCajaConfig(settings.landingContent) },
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
        {
          code: 'INVALID_CAJA_CONFIG',
          error: err.issues[0]?.message || 'Revisa la configuración de caja.',
        },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_caja_config_put_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo guardar la configuración de caja.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
