import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  deleteGalleryItem,
  updateSalonSettings,
  upsertGalleryItem,
} from '@/lib/repositories/db';

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(['owner']);
  if (!session) {
    return NextResponse.json(
      { error: 'Solo la Dueña (Owner) puede modificar la marca y configuración global.' },
      { status: 403 },
    );
  }
  const patch = await request.json();
  const settings = await updateSalonSettings(patch);
  return NextResponse.json({ settings });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin']);
  if (!session) return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  const body = await request.json();
  const item = await upsertGalleryItem(body);
  return NextResponse.json({ item });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin']);
  if (!session) return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) await deleteGalleryItem(id);
  return NextResponse.json({ ok: true });
}
