import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { CreateClientSchema, PatchClientSchema } from '@/lib/contracts';
import { DeleteClientQuerySchema } from '@/lib/contracts/clients';
import {
  createClientProfile,
  deleteClientProfile,
  getClientArcoExportAsync,
  getInactiveClientsAsync,
  getNearRewardClientsAsync,
  listClientsAsync,
  PolicyError,
  updateClientNotes,
} from '@/lib/repositories/db';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const exportClientId = searchParams.get('exportClientId')?.trim();
  if (exportClientId) {
    const exported = await getClientArcoExportAsync(exportClientId);
    if (!exported) {
      return NextResponse.json({ error: 'Clienta no encontrada' }, { status: 404 });
    }
    const safeFileId = exportClientId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'client';
    return new NextResponse(JSON.stringify(exported, null, 2), {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="arco-${safeFileId}.json"`,
      },
    });
  }

  const inactiveDaysParam = searchParams.get('inactiveDays')?.trim();
  if (inactiveDaysParam) {
    const parsedDays = Number(inactiveDaysParam);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      return NextResponse.json(
        { error: 'inactiveDays debe ser un entero entre 1 y 3650.' },
        { status: 400 },
      );
    }
    const [inactiveClients, nearRewardClients] = await Promise.all([
      getInactiveClientsAsync(parsedDays),
      getNearRewardClientsAsync(),
    ]);
    return NextResponse.json({
      inactiveDays: parsedDays,
      clients: inactiveClients,
      nearRewardClients,
    });
  }

  const [clients, nearRewardClients] = await Promise.all([
    listClientsAsync(),
    getNearRewardClientsAsync(),
  ]);
  return NextResponse.json({
    clients,
    nearRewardClients,
  });
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
    const parsed = CreateClientSchema.parse(await request.json());
    const client = await createClientProfile({
      fullName: parsed.fullName,
      phone: parsed.phone,
      email: parsed.email || null,
      instagramHandle: parsed.instagramHandle,
      birthday: parsed.birthday || null,
      notes: parsed.technicalNotes ?? parsed.notes ?? '',
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'CLIENT_EXISTS' ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos de la clienta.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo registrar la clienta.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  try {
    const parsed = PatchClientSchema.parse(await request.json());
    const client = await updateClientNotes({
      clientId: parsed.clientId,
      fullName: parsed.fullName,
      phone: parsed.phone,
      notes: parsed.technicalNotes ?? parsed.notes,
      birthday: parsed.birthday,
      email: parsed.email === '' ? null : parsed.email,
      instagramHandle: parsed.instagramHandle,
    });
    return NextResponse.json({ client });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'CLIENT_NOT_FOUND'
          ? 404
          : err.code === 'CLIENT_EXISTS'
            ? 409
            : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos de la clienta.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error actualizando clienta.' }, { status: 400 });
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

  try {
    const { searchParams } = new URL(request.url);
    const parsed = DeleteClientQuerySchema.parse({
      id: searchParams.get('id')?.trim() ?? '',
    });
    const deleted = await deleteClientProfile(parsed.id);
    return NextResponse.json({
      ok: true,
      deletedId: deleted.id,
      fullName: deleted.fullName,
    });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'CLIENT_NOT_FOUND'
          ? 404
          : err.code === 'CLIENT_HAS_HISTORY'
            ? 409
            : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'ID de clienta inválido.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error eliminando clienta.' }, { status: 500 });
  }
}
