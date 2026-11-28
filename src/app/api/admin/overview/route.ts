import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { buildAdminOverviewPayload } from '@/lib/admin/overview-loader';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autenticado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const payload = await buildAdminOverviewPayload(session);
  return NextResponse.json(payload, { headers: ADMIN_PRIVATE_HEADERS });
}
