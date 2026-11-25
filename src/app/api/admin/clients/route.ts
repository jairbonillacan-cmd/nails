import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  createClientProfile,
  getClientArcoExport,
  getInactiveClients,
  getNearRewardClients,
  getSnapshot,
  PolicyError,
  updateClientNotes,
} from '@/lib/repositories/db';

const createClientSchema = z.object({
  fullName: z.string().trim().min(2, 'Escribe el nombre completo').max(120),
  phone: z.string().trim().min(8, 'Escribe un WhatsApp válido de 10 dígitos').max(30),
  email: z.string().trim().email('Correo inválido').optional().or(z.literal('')).nullable(),
  instagramHandle: z.string().max(120).optional().nullable(),
  birthday: z.string().max(20).optional().nullable(),
  technicalNotes: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

const patchClientSchema = z.object({
  clientId: z.string().min(1),
  notes: z.string().max(1000).optional(),
  technicalNotes: z.string().max(1000).optional(),
  birthday: z.string().max(20).optional().nullable(),
  email: z.string().trim().email('Correo inválido').optional().or(z.literal('')).nullable(),
  instagramHandle: z.string().max(120).optional().nullable(),
});

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
    const exported = getClientArcoExport(exportClientId);
    if (!exported) {
      return NextResponse.json({ error: 'Clienta no encontrada' }, { status: 404 });
    }
    const safeFileId = exportClientId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'client';
    return new NextResponse(JSON.stringify(exported, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="arco-${safeFileId}.json"`,
      },
    });
  }

  const nearRewardClients = getNearRewardClients();
  const inactiveDaysParam = searchParams.get('inactiveDays')?.trim();
  if (inactiveDaysParam) {
    const parsedDays = Number(inactiveDaysParam);
    if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 3650) {
      return NextResponse.json(
        { error: 'inactiveDays debe ser un entero entre 1 y 3650.' },
        { status: 400 },
      );
    }
    const inactiveClients = getInactiveClients(parsedDays);
    return NextResponse.json({
      inactiveDays: parsedDays,
      clients: inactiveClients,
      nearRewardClients,
    });
  }

  const db = getSnapshot();
  return NextResponse.json({
    clients: db.clients,
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
    const parsed = createClientSchema.parse(await request.json());
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
    const parsed = patchClientSchema.parse(await request.json());
    const client = await updateClientNotes({
      clientId: parsed.clientId,
      notes: parsed.technicalNotes ?? parsed.notes,
      birthday: parsed.birthday,
      email: parsed.email === '' ? null : parsed.email,
      instagramHandle: parsed.instagramHandle,
    });
    return NextResponse.json({ client });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'CLIENT_NOT_FOUND' ? 404 : 400;
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
