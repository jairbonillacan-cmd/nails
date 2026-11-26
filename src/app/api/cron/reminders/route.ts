import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { formatTimeInTimezone } from '@/lib/format';
import {
  dispatchEmailNotification,
  dispatchSmsNotification,
  dispatchWhatsAppNotification,
} from '@/lib/integrations/notifications';
import type { EmailTemplateSituation } from '@/lib/integrations/resend-templates';
import { logError, logInfo, logWarn } from '@/lib/logger';
import {
  cleanupExpiredSlotHolds,
  processDueScheduledNotifications,
} from '@/lib/repositories/db';
import type {
  BookingWithRelations,
  SalonSettings,
  ScheduledNotification,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

function resolveReminderWhatsAppTemplate(
  notification: ScheduledNotification,
  booking: BookingWithRelations,
  settings: SalonSettings,
  appUrl: string,
): {
  triggerKey?: WhatsAppTemplateTriggerKey;
  templateParameters?: string[];
} {
  const tz = settings.timezone || 'America/Mexico_City';
  const timeLabel = formatTimeInTimezone(booking.startAt, tz, false);
  const manageUrl = `${appUrl.replace(/\/+$/, '')}/cita/${booking.manageToken}`;

  if (notification.workflowId === 'wf-24h') {
    return {
      triggerKey: 'reminder_24h',
      templateParameters: [
        booking.client.fullName,
        booking.service.name,
        timeLabel,
        booking.staff.name,
        manageUrl,
      ],
    };
  }

  if (notification.workflowId === 'wf-2h') {
    return {
      triggerKey: 'reminder_2h',
      templateParameters: [
        booking.client.fullName,
        timeLabel,
        settings.address,
      ],
    };
  }

  return {};
}

function resolveReminderEmailSituation(
  notification: ScheduledNotification,
  booking: BookingWithRelations,
): EmailTemplateSituation {
  if (
    notification.workflowId === 'wf-retoque' ||
    /retoque/i.test(notification.subject)
  ) {
    return 'touchup';
  }
  const scheduledMs = new Date(notification.scheduledFor).getTime();
  const startMs = new Date(booking.startAt).getTime();
  const endMs = new Date(booking.endAt).getTime();
  if (Number.isFinite(scheduledMs) && Number.isFinite(endMs) && scheduledMs > endMs) {
    return 'touchup';
  }
  if (
    notification.workflowId === 'wf-2h' ||
    (Number.isFinite(scheduledMs) &&
      Number.isFinite(startMs) &&
      startMs - scheduledMs <= 4 * 60 * 60 * 1000)
  ) {
    return 'reminder_2h';
  }
  return 'reminder_24h';
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    logError('cron_reminders_missing_secret');
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logWarn('cron_reminders_unauthorized', { reason: 'missing_bearer' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const provided = authHeader.slice('Bearer '.length);
  if (!provided || !constantTimeEqual(provided, secret)) {
    logWarn('cron_reminders_unauthorized', { reason: 'invalid_token' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowMs = Date.now();
    const env = getRuntimeIntegrationStatus();
    const holdsCleanup = await cleanupExpiredSlotHolds(nowMs);
    const summary = await processDueScheduledNotifications(
      async ({ notification, booking, settings }) => {
        const emailSituation = resolveReminderEmailSituation(notification, booking);
        if (notification.channel === 'email') {
          return dispatchEmailNotification({
            to: notification.recipient,
            subject: notification.subject,
            bodyText: notification.previewText,
            booking,
            settings,
            appUrl: env.appUrl,
            situation: emailSituation,
            idempotencyKey: `cron-reminder-${notification.id}-email`,
          });
        }
        if (notification.channel === 'whatsapp') {
          const templateMeta = resolveReminderWhatsAppTemplate(
            notification,
            booking,
            settings,
            env.appUrl,
          );
          return dispatchWhatsAppNotification({
            toPhoneE164: notification.recipient,
            bodyText: notification.previewText,
            triggerKey: templateMeta.triggerKey,
            templateParameters: templateMeta.templateParameters,
            withinServiceWindow: false,
            settingsTimezone: settings.timezone,
            fallbackEmail: booking.client.email
              ? {
                  to: booking.client.email,
                  subject: notification.subject,
                  booking,
                  settings,
                  appUrl: env.appUrl,
                  situation: emailSituation,
                  idempotencyKey: `cron-reminder-${notification.id}-wa-fallback`,
                }
              : undefined,
          });
        }
        return dispatchSmsNotification({
          toPhoneE164: notification.recipient,
          bodyText: notification.previewText,
        });
      },
      nowMs,
    );

    const result = {
      ...summary,
      cleanedHoldsCount: holdsCleanup.cleanedCount,
      dbKeepAlive: holdsCleanup.dbAlive,
    };

    if (summary.failedCount > 0 || !holdsCleanup.dbAlive) {
      logWarn('cron_reminders_partial_failure', result);
    } else {
      logInfo('cron_reminders_completed', result);
    }

    return NextResponse.json(result);
  } catch (err) {
    logError('cron_reminders_exception', { error: err });
    return NextResponse.json(
      { error: 'Error procesando recordatorios' },
      { status: 500 },
    );
  }
}
