import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  createClientProfile,
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
