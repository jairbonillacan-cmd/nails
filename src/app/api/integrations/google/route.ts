import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { buildGoogleOAuthUrl } from '@/lib/integrations/google-calendar';

export async function GET(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const staffId = searchParams.get('staffId') || session.user.staffMemberId || '';
  const oauthUrl = buildGoogleOAuthUrl(staffId);

  return NextResponse.json({
    configured: Boolean(oauthUrl),
    oauthUrl,
  });
}
