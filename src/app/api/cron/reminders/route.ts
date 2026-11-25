import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  dispatchEmailNotification,
  dispatchSmsNotification,
  dispatchWhatsAppNotification,
} from '@/lib/integrations/notifications';
import { processDueScheduledNotifications } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const provided = authHeader.slice('Bearer '.length);
  if (!provided || !constantTimeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = getRuntimeIntegrationStatus();
  const summary = await processDueScheduledNotifications(
    async ({ notification, booking, settings }) => {
      if (notification.channel === 'email') {
        return dispatchEmailNotification({
          to: notification.recipient,
          subject: notification.subject,
          bodyText: notification.previewText,
          booking,
          settings,
          appUrl: env.appUrl,
        });
      }
      if (notification.channel === 'whatsapp') {
        return dispatchWhatsAppNotification({
          toPhoneE164: notification.recipient,
          bodyText: notification.previewText,
        });
      }
      return dispatchSmsNotification({
        toPhoneE164: notification.recipient,
        bodyText: notification.previewText,
      });
    },
  );

  return NextResponse.json(summary);
}
