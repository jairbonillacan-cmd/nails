import { NextRequest, NextResponse } from 'next/server';
import { getSnapshot, hydrateBooking } from '@/lib/repositories/db';
import {
  dispatchEmailNotification,
  dispatchSmsNotification,
  dispatchWhatsAppNotification,
} from '@/lib/integrations/notifications';
import { getRuntimeIntegrationStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const nowMs = Date.now();
  const due = db.notifications.filter(
    (n) => n.status === 'pending' && new Date(n.scheduledFor).getTime() <= nowMs,
  );

  let sentCount = 0;
  let failedCount = 0;

  for (const item of due) {
    const rawBooking = db.bookings.find((b) => b.id === item.bookingId);
    if (!rawBooking || rawBooking.status === 'canceled') {
      item.status = 'canceled';
      continue;
    }

    const hydrated = hydrateBooking(db, rawBooking);
    let res;
    if (item.channel === 'email') {
      res = await dispatchEmailNotification({
        to: item.recipient,
        subject: item.subject,
        bodyText: item.previewText,
        booking: hydrated,
        settings: db.settings,
        appUrl: env.appUrl,
      });
    } else if (item.channel === 'whatsapp') {
      res = await dispatchWhatsAppNotification({
        toPhoneE164: item.recipient,
        bodyText: item.previewText,
      });
    } else {
      res = await dispatchSmsNotification({
        toPhoneE164: item.recipient,
        bodyText: item.previewText,
      });
    }

    item.status = res.status;
    item.providerMessageId = res.providerMessageId;
    item.errorMessage = res.errorMessage;
    if (res.status === 'sent') {
      item.sentAt = new Date().toISOString();
      sentCount += 1;
    } else {
      failedCount += 1;
    }
  }

  return NextResponse.json({ processed: due.length, sentCount, failedCount });
}
