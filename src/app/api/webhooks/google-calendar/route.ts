import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import { fetchGoogleFreeBusy } from '@/lib/integrations/google-calendar';
import { logError, logWarn } from '@/lib/logger';
import { publishRealtimeEvent } from '@/lib/realtime';
import {
  claimWebhookEventIdempotent,
  getRepository,
  syncCalendarConnectionBusyBlocks,
} from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const expectedToken = process.env.GOOGLE_WEBHOOK_TOKEN?.trim();
  if (!expectedToken) {
    logError('webhook_gcal_missing_token');
    return NextResponse.json(
      { error: 'GOOGLE_WEBHOOK_TOKEN no configurado' },
      { status: 503 },
    );
  }

  const providedToken = request.headers.get('x-goog-channel-token')?.trim() ?? '';
  if (!providedToken || !constantTimeEqual(providedToken, expectedToken)) {
    logWarn('webhook_gcal_invalid_channel_token');
    return NextResponse.json(
      { error: 'Token de canal Google Calendar inválido' },
      { status: 401 },
    );
  }

  const channelId = request.headers.get('x-goog-channel-id')?.trim() ?? '';
  if (!channelId) {
    return NextResponse.json({ ok: true, matched: false });
  }

  const messageNumber = request.headers.get('x-goog-message-number')?.trim() ?? '';
  const resourceState = request.headers.get('x-goog-resource-state')?.trim() ?? 'exists';
  if (messageNumber) {
    const claimed = await claimWebhookEventIdempotent(
      'google_calendar',
      `${channelId}:${messageNumber}:${resourceState}`,
    );
    if (!claimed) {
      return NextResponse.json({ ok: true, idempotent: true, matched: true });
    }
  }

  const connection = await getRepository().getCalendarConnectionByWatchChannelId(channelId);
  if (!connection) {
    return NextResponse.json({ ok: true, matched: false });
  }

  try {
    const freeBusy = await fetchGoogleFreeBusy({ connection });
    if (freeBusy.synced) {
      await syncCalendarConnectionBusyBlocks({
        staffId: connection.staffId,
        busyBlocks: freeBusy.busyBlocks,
        refreshedAccessTokenEncrypted: freeBusy.refreshedAccessTokenEncrypted,
        refreshedTokenExpiresAt: freeBusy.refreshedTokenExpiresAt,
      });
      publishRealtimeEvent('slot_changed', { staffId: connection.staffId });
    } else {
      logWarn('webhook_gcal_freebusy_not_synced', { staffId: connection.staffId });
    }

    return NextResponse.json({
      ok: true,
      matched: true,
      staffId: connection.staffId,
      busyCount: freeBusy.busyBlocks.length,
    });
  } catch (err) {
    logError('webhook_gcal_sync_exception', {
      staffId: connection.staffId,
      error: err,
    });
    return NextResponse.json(
      { error: 'No se pudo sincronizar Google Calendar' },
      { status: 500 },
    );
  }
}
