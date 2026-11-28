import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { AdminTeamPostSchema } from '@/lib/contracts';
import {
  ADMIN_PRIVATE_HEADERS,
  withAdminPrivateHeaders,
} from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import {
  persistBrandMediaField,
  PolicyError,
  upsertAdminUser,
  upsertStaffMember,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
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
    const parsed = AdminTeamPostSchema.parse(rawBody);

    if (parsed.kind === 'admin_user') {
      if (session.user.role !== 'owner') {
        return NextResponse.json(
          {
            error:
              'Solo la Dueña (Owner) puede invitar o cambiar roles de administradores.',
          },
          { status: 403, headers: ADMIN_PRIVATE_HEADERS },
        );
      }
      const rate = checkRateLimit({
        bucket: 'admin:team-admin-user',
        key: `${session.user.id}:${getRequestIp(request)}`,
        limit: 15,
        windowMs: 5 * 60_000,
      });
      if (!rate.allowed) {
        return NextResponse.json(
          {
            code: 'RATE_LIMITED',
            error: 'Demasiados cambios de accesos. Espera unos minutos e intenta de nuevo.',
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
      const adminUser = await upsertAdminUser(parsed.data);
      return NextResponse.json({ adminUser }, { headers: ADMIN_PRIVATE_HEADERS });
    }

    if (session.user.role !== 'owner' && session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Permisos insuficientes' },
        { status: 403, headers: ADMIN_PRIVATE_HEADERS },
      );
    }

    const staffInput =
      parsed.data.avatarUrl === undefined
        ? parsed.data
        : { ...parsed.data, avatarUrl: await persistBrandMediaField(parsed.data.avatarUrl) };
    const staff = await upsertStaffMember(staffInput);
    return NextResponse.json({ staff }, { headers: ADMIN_PRIVATE_HEADERS });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'STAFF_NOT_FOUND' ? 404 : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos del equipo.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_team_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo guardar el registro del equipo.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
