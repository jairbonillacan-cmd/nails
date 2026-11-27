import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { AdminTeamPostSchema } from '@/lib/contracts';
import {
  persistBrandMediaField,
  PolicyError,
  upsertAdminUser,
  upsertStaffMember,
} from '@/lib/repositories/db';

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ error: 'Solicitud JSON inválida.' }, { status: 400 });
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
          { status: 403 },
        );
      }
      const adminUser = await upsertAdminUser(parsed.data);
      return NextResponse.json({ adminUser });
    }

    if (session.user.role !== 'owner' && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }

    const staffInput =
      parsed.data.avatarUrl === undefined
        ? parsed.data
        : { ...parsed.data, avatarUrl: await persistBrandMediaField(parsed.data.avatarUrl) };
    const staff = await upsertStaffMember(staffInput);
    return NextResponse.json({ staff });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'STAFF_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos del equipo.' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo guardar el registro del equipo.' },
      { status: 400 },
    );
  }
}
