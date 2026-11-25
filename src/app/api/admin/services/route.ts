import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { upsertAddon, upsertService } from '@/lib/repositories/db';

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin']);
  if (!session) return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });

  try {
    const body = await request.json();
    if (body.kind === 'addon') {
      const addon = await upsertAddon(body.data);
      return NextResponse.json({ addon });
    }
    const service = await upsertService(body.data);
    return NextResponse.json({ service });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error guardando catálogo' },
      { status: 400 },
    );
  }
}
