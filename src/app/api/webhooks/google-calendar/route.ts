import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import { fetchGoogleFreeBusy } from '@/lib/integrations/google-calendar';
import { publishRealtimeEvent } from '@/lib/realtime';
import {
  getSnapshot,
  syncCalendarConnectionBusyBlocks,
} from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'GOOGLE_WEBHOOK_TOKEN no configurado' },
      { status: 503 },
    );
  }

  const providedToken = request.headers.get('x-goog-channel-token')?.trim() ?? '';
  if (!providedToken || !constantTimeEqual(providedToken, expectedToken)) {
    return NextResponse.json(
      { error: 'Token de canal Google Calendar inválido' },
      { status: 401 },
    );
  }

  const channelId = request.headers.get('x-goog-channel-id')?.trim() ?? '';
  if (!channelId) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const db = getSnapshot();
  const connection = db.calendarConnections.find(
    (c) => c.watchChannelId === channelId && c.isConnected,
  );
  if (!connection) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const freeBusy = await fetchGoogleFreeBusy({ connection });
  if (freeBusy.synced) {
    await syncCalendarConnectionBusyBlocks({
      staffId: connection.staffId,
      busyBlocks: freeBusy.busyBlocks,
      refreshedAccessTokenEncrypted: freeBusy.refreshedAccessTokenEncrypted,
      refreshedTokenExpiresAt: freeBusy.refreshedTokenExpiresAt,
    });
    publishRealtimeEvent('slot_changed', { staffId: connection.staffId });
  }

  return NextResponse.json({
    ok: true,
    matched: true,
    staffId: connection.staffId,
    busyCount: freeBusy.busyBlocks.length,
  });
}
