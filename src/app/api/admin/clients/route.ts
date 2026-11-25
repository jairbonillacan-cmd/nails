import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { updateClientNotes } from '@/lib/repositories/db';

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin']);
  if (!session) return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });

  const body = await request.json();
  const client = await updateClientNotes(body);
  return NextResponse.json({ client });
}
