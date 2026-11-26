import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { buildAdminOverviewPayload } from '@/lib/admin/overview-loader';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const payload = await buildAdminOverviewPayload(session);
  return NextResponse.json(payload);
}
