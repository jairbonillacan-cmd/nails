import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import {
  WhatsAppRemindersActionSchema,
  type WhatsAppRemindersResponseDTO,
} from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { normalizePhoneE164 } from '@/lib/format';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import {
  buildBookingTemplateParameters,
  dispatchEmailNotification,
  dispatchSmsNotification,
  dispatchWhatsAppNotification,
} from '@/lib/integrations/notifications';
import type { EmailTemplateSituation } from '@/lib/integrations/resend-templates';
import { logError } from '@/lib/logger';
import {
  canonicalizeWhatsAppPhoneE164,
  getWhatsAppTemplateCatalogItem,
  inferReminderTriggerKey,
  renderWhatsAppTemplatePreview,
} from '@/lib/notifications/whatsapp-inbox';
import {
  drainStaleOutboxEvents,
  getRepository,
  PolicyError,
  processDueScheduledNotifications,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';
import type {
  BookingWithRelations,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
  WhatsAppTemplateTriggerKey,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = ADMIN_PRIVATE_HEADERS;

function resolveSituationForReminder(
  triggerKey: WhatsAppTemplateTriggerKey | null,
): EmailTemplateSituation {
  if (triggerKey === 'touchup_invite') return 'touchup';
  if (triggerKey === 'reminder_2h') return 'reminder_2h';
  if (triggerKey === 'reminder_24h') return 'reminder_24h';
  if (triggerKey === 'booking_canceled') return 'canceled';
  if (triggerKey === 'booking_rescheduled') return 'rescheduled';
  if (triggerKey === 'deposit_rejected') return 'pending_spei';
  return 'confirmed';
}

async function dispatchSingleReminder(params: {
  notification: ScheduledNotification;
  booking: BookingWithRelations;
  settings: SalonSettings;
  workflow: NotificationWorkflow | null;
  appUrl: string;
  skipThreadPersist?: boolean;
}) {
  const triggerKey = inferReminderTriggerKey(
    params.workflow,
    params.notification,
    params.booking,
  );
  const fullBodyText =
    params.notification.bodyText || params.notification.previewText;
  const emailSituation = resolveSituationForReminder(triggerKey);
  const attempt = (params.notification.attempts ?? 0) + 1;

  if (params.notification.channel === 'email') {
    return dispatchEmailNotification({
      to: params.notification.recipient,
      subject: params.notification.subject,
      bodyText: fullBodyText,
      booking: params.booking,
      settings: params.settings,
      appUrl: params.appUrl,
      situation: emailSituation,
      idempotencyKey: `admin-reminder-${params.notification.id}-a${attempt}-email`,
    });
  }

  if (params.notification.channel === 'whatsapp') {
    const templateParameters = triggerKey
      ? buildBookingTemplateParameters({
          triggerKey,
          booking: params.booking,
          settings: params.settings,
          appUrl: params.appUrl,
        })
      : undefined;
    const interactiveButtons =
      triggerKey === 'reminder_24h'
        ? [
            { id: `confirm_booking:${params.booking.id}`, title: 'Confirmo' },
            {
              id: `reschedule_booking:${params.booking.id}`,
              title: 'Necesito reagendar',
            },
          ]
        : undefined;
    const serviceWindow = await getRepository().getWhatsAppThreadWindow({
      phoneE164: params.notification.recipient,
    });
    const workflowIncludesEmail = Boolean(params.workflow?.channels.includes('email'));
    return dispatchWhatsAppNotification({
      toPhoneE164: params.notification.recipient,
      bodyText: fullBodyText,
      triggerKey: triggerKey ?? undefined,
      templateParameters,
      interactiveButtons,
      withinServiceWindow: serviceWindow.isOpen,
      settingsTimezone: params.settings.timezone,
      threadContext: {
        clientId: params.booking.clientId,
        bookingId: params.booking.id,
        notificationId: params.notification.id,
        contactName: params.booking.client.fullName,
        senderKind: 'automation',
        senderName: params.workflow?.name ?? 'Recordatorio manual',
        skipPersist: Boolean(params.skipThreadPersist),
      },
      fallbackEmail:
        params.booking.client.email && !workflowIncludesEmail
          ? {
              to: params.booking.client.email,
              subject: params.notification.subject,
              booking: params.booking,
              settings: params.settings,
              appUrl: params.appUrl,
              situation: emailSituation,
              idempotencyKey: `admin-reminder-${params.notification.id}-a${attempt}-wa-fallback`,
            }
          : undefined,
    });
  }

  return dispatchSmsNotification({
    toPhoneE164: params.notification.recipient,
    bodyText: fullBodyText,
  });
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para consultar recordatorios.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const repo = getRepository();
  const snapshot = await repo.getWhatsAppRemindersSnapshot({
    role: session.user.role,
    staffMemberId: session.user.staffMemberId,
    nowMs,
  });

  const payload: WhatsAppRemindersResponseDTO = {
    workflows: snapshot.workflows,
    queue: snapshot.queue,
    history: snapshot.history,
    metrics: snapshot.metrics,
    outboxSummary: snapshot.outboxSummary,
    serverNowIso: now.toISOString(),
  };

  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para administrar recordatorios.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin-whatsapp-reminders',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 20,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas operaciones de recordatorios. Espera unos segundos.' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE,
          'Retry-After': String(rate.retryAfterSeconds),
        },
      },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const parsedResult = WhatsAppRemindersActionSchema.safeParse(rawBody);
  if (!parsedResult.success) {
    return NextResponse.json(
      { error: parsedResult.error.issues[0]?.message || 'Acción inválida.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const input = parsedResult.data;
  const repo = getRepository();
  const env = getRuntimeIntegrationStatus();

  try {
    if (input.action === 'toggle_workflow') {
      const workflow = await repo.updateNotificationWorkflow(input.workflowId, {
        isEnabled: input.isEnabled,
      });
      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'workflow_updated',
        entityType: 'notification_workflow',
        entityId: workflow.id,
        metadata: {
          action: 'toggle_workflow',
          isEnabled: workflow.isEnabled,
        },
      });
      return NextResponse.json(
        { ok: true, workflow },
        { headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'update_workflow') {
      if (session.user.role !== 'owner') {
        return NextResponse.json(
          { error: 'Solo la dueña puede editar plantillas y horarios de recordatorios.' },
          { status: 403, headers: PRIVATE_NO_STORE },
        );
      }
      const workflow = await repo.updateNotificationWorkflow(
        input.workflowId,
        input.patch,
      );
      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'workflow_updated',
        entityType: 'notification_workflow',
        entityId: workflow.id,
        metadata: {
          action: 'update_workflow',
          isEnabled: workflow.isEnabled,
          offsetMinutes: workflow.offsetMinutes,
        },
      });
      return NextResponse.json(
        { ok: true, workflow },
        { headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'retry_notification') {
      const updated = await repo.retryScheduledNotification(input.notificationId);
      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'reminder_retried',
        entityType: 'scheduled_notification',
        entityId: updated.id,
        metadata: { action: 'retry_notification' },
      });
      return NextResponse.json(
        { ok: true, notification: updated },
        { headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'cancel_notification') {
      const updated = await repo.cancelScheduledNotification(
        input.notificationId,
        'canceled_by_admin',
      );
      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'workflow_updated',
        entityType: 'scheduled_notification',
        entityId: updated.id,
        metadata: { action: 'cancel_notification' },
      });
      return NextResponse.json(
        { ok: true, notification: updated },
        { headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'trigger_now') {
      const notification = await repo.getScheduledNotificationById(
        input.notificationId,
      );
      if (!notification) {
        return NextResponse.json(
          { error: 'Recordatorio no encontrado.' },
          { status: 404, headers: PRIVATE_NO_STORE },
        );
      }
      const [settings, workflows, booking] = await Promise.all([
        repo.getSalonSettings(),
        notification.workflowId
          ? repo.getNotificationWorkflows()
          : Promise.resolve([]),
        notification.bookingId
          ? repo.getBookingById(notification.bookingId)
          : Promise.resolve(null),
      ]);
      if (!booking) {
        return NextResponse.json(
          { error: 'No se encontró la cita vinculada a este recordatorio.' },
          { status: 400, headers: PRIVATE_NO_STORE },
        );
      }
      const workflow = notification.workflowId
        ? workflows.find((w) => w.id === notification.workflowId) ?? null
        : null;

      const res = await dispatchSingleReminder({
        notification,
        booking,
        settings,
        workflow,
        appUrl: env.appUrl,
      });
      const nowIso = new Date().toISOString();
      const updated = await repo.updateScheduledNotificationStatus(notification.id, {
        status: res.status,
        deliveryStatus: res.status === 'sent' ? 'sent' : 'failed',
        providerMessageId: res.providerMessageId,
        errorMessage: res.errorMessage,
        sentAt: res.status === 'sent' ? nowIso : null,
        attempts: (notification.attempts ?? 0) + 1,
        lastAttemptAt: nowIso,
        nextRetryAt: null,
      });

      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'reminder_retried',
        entityType: 'scheduled_notification',
        entityId: notification.id,
        metadata: {
          action: 'trigger_now',
          status: res.status,
        },
      });

      return NextResponse.json(
        {
          ok: res.status === 'sent',
          notification: updated,
          deliveryMode: res.deliveryMode,
          fallbackWaMeUrl: res.fallbackWaMeUrl,
          ...(res.errorMessage ? { error: res.errorMessage } : {}),
        },
        { status: res.status === 'sent' ? 200 : 502, headers: PRIVATE_NO_STORE },
      );
    }

    if (input.action === 'run_due_now') {
      if (session.user.role !== 'owner') {
        return NextResponse.json(
          { error: 'Solo la dueña puede ejecutar el lote de recordatorios pendientes.' },
          { status: 403, headers: PRIVATE_NO_STORE },
        );
      }
      const nowMs = Date.now();
      const workflows = await repo.getNotificationWorkflows();
      const workflowById = new Map(workflows.map((w) => [w.id, w]));
      const pendingWhatsAppRecords: Array<{
        phoneE164: string;
        contactName: string;
        clientId: string;
        bookingId: string;
        notificationId: string;
        bodyText: string;
        senderName: string;
        triggerKey: WhatsAppTemplateTriggerKey | null;
        status: 'sent' | 'failed';
        deliveryMode: 'template' | 'text' | 'fallback_email_wame' | 'demo';
        providerMessageId: string | null;
        errorMessage: string | null;
      }> = [];

      const [staleOutbox, summary] = await Promise.all([
        drainStaleOutboxEvents(5 * 60_000, nowMs),
        processDueScheduledNotifications(
          async ({ notification, booking, settings }) => {
            const workflow = notification.workflowId
              ? workflowById.get(notification.workflowId) ?? null
              : null;
            const res = await dispatchSingleReminder({
              notification,
              booking,
              settings,
              workflow,
              appUrl: env.appUrl,
              skipThreadPersist: true,
            });
            if (notification.channel === 'whatsapp') {
              const triggerKey = inferReminderTriggerKey(workflow, notification, booking);
              pendingWhatsAppRecords.push({
                phoneE164: notification.recipient,
                contactName: booking.client.fullName,
                clientId: booking.clientId,
                bookingId: booking.id,
                notificationId: notification.id,
                bodyText: notification.bodyText || notification.previewText,
                senderName: workflow?.name ?? 'Recordatorio automático',
                triggerKey,
                status: res.status,
                deliveryMode:
                  res.deliveryMode ??
                  (env.whatsappCloudConfigured
                    ? triggerKey
                      ? 'template'
                      : 'text'
                    : 'demo'),
                providerMessageId: res.providerMessageId,
                errorMessage: res.errorMessage,
              });
            }
            return res;
          },
          nowMs,
        ),
      ]);

      for (const item of pendingWhatsAppRecords) {
        await repo.recordWhatsAppMessage({
          phoneE164: item.phoneE164,
          contactName: item.contactName,
          clientId: item.clientId,
          bookingId: item.bookingId,
          notificationId: item.notificationId,
          direction: 'outbound',
          senderKind: 'automation',
          senderName: item.senderName,
          messageType: item.triggerKey ? 'template' : 'text',
          bodyText: item.bodyText,
          templateTriggerKey: item.triggerKey,
          deliveryStatus: item.status === 'sent' ? 'sent' : 'failed',
          deliveryMode: item.deliveryMode,
          providerMessageId: item.providerMessageId,
          errorMessage: item.errorMessage,
        });
      }

      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'reminder_retried',
        entityType: 'scheduled_notification',
        entityId: 'batch-run-due-now',
        metadata: {
          processed: summary.processed,
          sentCount: summary.sentCount,
          failedCount: summary.failedCount,
          retriedCount: summary.retriedCount,
          drainedOutboxCount: staleOutbox.drainedCount,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          summary: {
            ...summary,
            drainedOutboxCount: staleOutbox.drainedCount,
          },
        },
        { headers: PRIVATE_NO_STORE },
      );
    }

    const normalizedPhone =
      canonicalizeWhatsAppPhoneE164(input.toPhone) || normalizePhoneE164(input.toPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: 'Número de WhatsApp inválido para envío de prueba.' },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }

    const [settings, workflows, bookingForContext] = await Promise.all([
      repo.getSalonSettings(),
      input.workflowId ? repo.getNotificationWorkflows() : Promise.resolve([]),
      input.bookingId ? repo.getBookingById(input.bookingId) : Promise.resolve(null),
    ]);
    const workflow = input.workflowId
      ? workflows.find((w) => w.id === input.workflowId) ?? null
      : null;
    const triggerKey: WhatsAppTemplateTriggerKey =
      input.triggerKey ??
      (workflow
        ? inferReminderTriggerKey(workflow, {
            triggerKey: null,
            subject: workflow.subjectTemplate,
            scheduledFor: new Date().toISOString(),
          }) ?? 'reminder_24h'
        : 'reminder_24h');
    const catalogSpec = getWhatsAppTemplateCatalogItem(triggerKey);

    let paramsForTemplate = [...catalogSpec.exampleParameters];
    if (bookingForContext) {
      paramsForTemplate = buildBookingTemplateParameters({
        triggerKey,
        booking: bookingForContext,
        settings,
        appUrl: env.appUrl,
      });
    }

    const previewText =
      input.messagePreview?.trim() ||
      renderWhatsAppTemplatePreview(triggerKey, paramsForTemplate);

    const dispatchRes = await dispatchWhatsAppNotification({
      toPhoneE164: normalizedPhone,
      bodyText: previewText,
      triggerKey,
      templateParameters: paramsForTemplate,
      withinServiceWindow: false,
      settingsTimezone: settings.timezone,
      threadContext: {
        clientId: bookingForContext?.clientId ?? null,
        bookingId: bookingForContext?.id ?? null,
        senderKind: 'staff',
        senderName: `${session.user.fullName} (Prueba)`,
      },
    });

    return NextResponse.json(
      {
        ok: dispatchRes.status === 'sent',
        triggerKey,
        previewText,
        deliveryMode: dispatchRes.deliveryMode,
        providerMessageId: dispatchRes.providerMessageId,
        fallbackWaMeUrl: dispatchRes.fallbackWaMeUrl,
        ...(dispatchRes.errorMessage ? { error: dispatchRes.errorMessage } : {}),
      },
      { status: dispatchRes.status === 'sent' ? 200 : 502, headers: PRIVATE_NO_STORE },
    );
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'NOTIFICATION_NOT_FOUND' || err.code === 'WORKFLOW_NOT_FOUND'
          ? 404
          : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: PRIVATE_NO_STORE },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos.' },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }
    logError('admin_whatsapp_reminders_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        error: 'No se pudo ejecutar la acción de recordatorios.',
      },
      { status: 500, headers: PRIVATE_NO_STORE },
    );
  }
}
