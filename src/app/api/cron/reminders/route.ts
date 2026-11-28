import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  buildBookingTemplateParameters,
  dispatchEmailNotification,
  dispatchSmsNotification,
  dispatchWhatsAppNotification,
} from '@/lib/integrations/notifications';
import type { EmailTemplateSituation } from '@/lib/integrations/resend-templates';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { inferReminderTriggerKey } from '@/lib/notifications/whatsapp-inbox';
import {
  cleanupExpiredSlotHolds,
  drainStaleOutboxEvents,
  getRepository,
  processDueScheduledNotifications,
  processExpiredWaitlistOffers,
  processProactiveTouchUpInvites,
  recordWhatsAppMessage,
} from '@/lib/repositories/db';
import type { RecordWhatsAppMessageInput } from '@/lib/repositories/port';
import type {
  BookingWithRelations,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

function resolveEmailSituationFromTrigger(
  triggerKey: WhatsAppTemplateTriggerKey | null,
  notification: ScheduledNotification,
  booking: BookingWithRelations,
): EmailTemplateSituation {
  if (triggerKey === 'touchup_invite') return 'touchup';
  if (triggerKey === 'reminder_2h') return 'reminder_2h';
  if (triggerKey === 'reminder_24h') return 'reminder_24h';
  if (triggerKey === 'booking_canceled') return 'canceled';
  if (triggerKey === 'booking_rescheduled') return 'rescheduled';
  if (triggerKey === 'booking_confirmed') return 'confirmed';
  if (triggerKey === 'deposit_rejected') return 'pending_spei';

  const scheduledMs = Date.parse(notification.scheduledFor);
  const startMs = Date.parse(booking.startAt);
  const endMs = Date.parse(booking.endAt);
  if (Number.isFinite(scheduledMs) && Number.isFinite(endMs) && scheduledMs > endMs) {
    return scheduledMs - endMs >= 24 * 60 * 60 * 1000 ? 'touchup' : 'confirmed';
  }
  if (
    Number.isFinite(scheduledMs) &&
    Number.isFinite(startMs) &&
    startMs - scheduledMs <= 4 * 60 * 60 * 1000
  ) {
    return 'reminder_2h';
  }
  return 'reminder_24h';
}

function buildTemplateMetaForTrigger(
  triggerKey: WhatsAppTemplateTriggerKey | null,
  booking: BookingWithRelations,
  settings: SalonSettings,
  appUrl: string,
): {
  triggerKey?: WhatsAppTemplateTriggerKey;
  templateParameters?: string[];
} {
  if (!triggerKey) return {};
  return {
    triggerKey,
    templateParameters: buildBookingTemplateParameters({
      triggerKey,
      booking,
      settings,
      appUrl,
    }),
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    logError('cron_reminders_missing_secret');
    return NextResponse.json(
      { error: 'CRON_SECRET no configurado' },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logWarn('cron_reminders_unauthorized', { reason: 'missing_bearer' });
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  const provided = authHeader.slice('Bearer '.length);
  if (!provided || !constantTimeEqual(provided, secret)) {
    logWarn('cron_reminders_unauthorized', { reason: 'invalid_token' });
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const nowMs = Date.now();
    const env = getRuntimeIntegrationStatus();
    const holdsCleanup = await cleanupExpiredSlotHolds(nowMs);
    const [staleOutbox, workflows] = await Promise.all([
      drainStaleOutboxEvents(5 * 60_000, nowMs),
      getRepository().getNotificationWorkflows(),
    ]);
    const workflowsById = new Map<string, NotificationWorkflow>(
      workflows.map((w) => [w.id, w]),
    );
    const pendingWhatsAppRecords: RecordWhatsAppMessageInput[] = [];

    const summary = await processDueScheduledNotifications(
      async ({ notification, booking, settings, whatsappServiceWindow }) => {
        const workflow = notification.workflowId
          ? workflowsById.get(notification.workflowId) ?? null
          : null;
        const triggerKey = inferReminderTriggerKey(workflow, notification, booking);
        const emailSituation = resolveEmailSituationFromTrigger(
          triggerKey,
          notification,
          booking,
        );
        const fullBodyText = notification.bodyText || notification.previewText;
        const attemptNumber = (notification.attempts ?? 0) + 1;

        if (notification.channel === 'email') {
          return dispatchEmailNotification({
            to: notification.recipient,
            subject: notification.subject,
            bodyText: fullBodyText,
            booking,
            settings,
            appUrl: env.appUrl,
            situation: emailSituation,
            idempotencyKey: `cron-reminder-${notification.id}-a${attemptNumber}-email`,
          });
        }

        if (notification.channel === 'whatsapp') {
          const templateMeta = buildTemplateMetaForTrigger(
            triggerKey,
            booking,
            settings,
            env.appUrl,
          );
          const interactiveButtons =
            triggerKey === 'reminder_24h'
              ? [
                  { id: `confirm_booking:${booking.id}`, title: 'Confirmo' },
                  { id: `reschedule_booking:${booking.id}`, title: 'Necesito reagendar' },
                ]
              : undefined;
          const serviceWindow =
            whatsappServiceWindow ??
            (await getRepository().getWhatsAppThreadWindow(
              { phoneE164: notification.recipient },
              nowMs,
            ));
          const workflowIncludesEmail = Boolean(workflow?.channels.includes('email'));
          const waRes = await dispatchWhatsAppNotification({
            toPhoneE164: notification.recipient,
            bodyText: fullBodyText,
            triggerKey: templateMeta.triggerKey,
            templateParameters: templateMeta.templateParameters,
            interactiveButtons,
            withinServiceWindow: serviceWindow.isOpen,
            settingsTimezone: settings.timezone,
            threadContext: {
              clientId: booking.clientId,
              bookingId: booking.id,
              notificationId: notification.id,
              contactName: booking.client.fullName,
              senderKind: 'automation',
              senderName: workflow?.name ?? 'Recordatorio automático',
              skipPersist: true,
            },
            fallbackEmail:
              booking.client.email && !workflowIncludesEmail
                ? {
                    to: booking.client.email,
                    subject: notification.subject,
                    booking,
                    settings,
                    appUrl: env.appUrl,
                    situation: emailSituation,
                    idempotencyKey: `cron-reminder-${notification.id}-a${attemptNumber}-wa-fallback`,
                  }
                : undefined,
          });
          pendingWhatsAppRecords.push({
            phoneE164: notification.recipient,
            contactName: booking.client.fullName,
            clientId: booking.clientId,
            bookingId: booking.id,
            notificationId: notification.id,
            direction: 'outbound',
            senderKind: 'automation',
            senderName: workflow?.name ?? 'Recordatorio automático',
            messageType: templateMeta.triggerKey ? 'template' : 'text',
            bodyText: fullBodyText,
            templateTriggerKey: templateMeta.triggerKey ?? null,
            templateParams: templateMeta.templateParameters ?? [],
            deliveryStatus: waRes.status === 'sent' ? 'sent' : 'failed',
            deliveryMode: env.whatsappCloudConfigured
              ? waRes.deliveryMode === 'template'
                ? 'template'
                : waRes.deliveryMode === 'text'
                  ? 'text'
                  : 'fallback_email_wame'
              : 'demo',
            providerMessageId: waRes.providerMessageId,
            errorCode: waRes.errorCode ?? null,
            errorMessage: waRes.errorMessage,
          });
          return waRes;
        }

        return dispatchSmsNotification({
          toPhoneE164: notification.recipient,
          bodyText: fullBodyText,
        });
      },
      nowMs,
    );

    for (const record of pendingWhatsAppRecords) {
      await recordWhatsAppMessage(record).catch((err) => {
        logWarn('cron_reminders_thread_record_failed', { error: err });
      });
    }

    const waitlistRollover = await processExpiredWaitlistOffers(nowMs);
    const touchUps = await processProactiveTouchUpInvites(nowMs);

    const result = {
      ...summary,
      cleanedHoldsCount: holdsCleanup.cleanedCount,
      dbKeepAlive: holdsCleanup.dbAlive,
      drainedOutboxCount: staleOutbox.drainedCount,
      waitlistExpiredCount: waitlistRollover.expiredCount,
      waitlistRolledOverCount: waitlistRollover.rolledOverCount,
      touchUpsEligibleCount: touchUps.eligibleCount,
      touchUpsSentCount: touchUps.sentCount,
    };

    if (summary.failedCount > 0 || !holdsCleanup.dbAlive) {
      logWarn('cron_reminders_partial_failure', result);
    } else {
      logInfo('cron_reminders_completed', result);
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err) {
    logError('cron_reminders_exception', { error: err });
    return NextResponse.json(
      { error: 'Error procesando recordatorios' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
