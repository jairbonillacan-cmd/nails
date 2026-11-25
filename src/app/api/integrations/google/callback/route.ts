import { NextRequest, NextResponse } from 'next/server';
import { updateCalendarConnection } from '@/lib/repositories/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const staffId = searchParams.get('state');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (!code || !staffId) {
    return NextResponse.redirect(`${appUrl}/admin/integraciones?google=missing_code`);
  }

  await updateCalendarConnection(staffId, {
    isConnected: true,
    lastSyncedAt: new Date().toISOString(),
  });

  return NextResponse.redirect(`${appUrl}/admin/integraciones?google=connected`);
}
