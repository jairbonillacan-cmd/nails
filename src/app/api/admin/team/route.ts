import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { upsertAdminUser, upsertStaffMember } from '@/lib/repositories/db';

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.kind === 'admin_user') {
    const session = await requireAdmin(['owner']);
    if (!session) {
      return NextResponse.json(
        { error: 'Solo la Dueña (Owner) puede invitar o cambiar roles de administradores.' },
        { status: 403 },
      );
    }
    const adminUser = await upsertAdminUser(body.data);
    return NextResponse.json({ adminUser });
  }

  const session = await requireAdmin(['owner', 'admin']);
  if (!session) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }
  const staff = await upsertStaffMember(body.data);
  return NextResponse.json({ staff });
}
