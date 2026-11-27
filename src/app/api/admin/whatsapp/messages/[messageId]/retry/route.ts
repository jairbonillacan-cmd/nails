import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import type { WhatsAppSendResponseDTO } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { buildWhatsAppLink } from '@/lib/format';
import { dispatchWhatsAppNotification } from '@/lib/integrations/notifications';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { getRepository } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';
import type { WhatsAppMessageDeliveryMode } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ messageId: string }> },
) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para reintentar mensajes de WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin-whatsapp-retry',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 15,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Espera unos segundos antes de volver a reintentar.' },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE,
          'Retry-After': String(rate.retryAfterSeconds),
        },
      },
    );
  }

  const { messageId } = await context.params;
  const cleanMessageId = messageId?.trim();
  if (!cleanMessageId) {
    return NextResponse.json(
      { error: 'Mensaje inválido.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const repo = getRepository();
  const original = await repo.getWhatsAppMessageById(cleanMessageId);
  if (!original) {
    return NextResponse.json(
      { error: 'Mensaje no encontrado.' },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  if (original.direction !== 'outbound' || original.deliveryStatus !== 'failed') {
    return NextResponse.json(
      { error: 'Solo se pueden reintentar mensajes salientes con estado fallido.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const env = getRuntimeIntegrationStatus();
  const salonSettings = await repo.getSalonSettings();
  const tz = salonSettings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(now, tz);

  const [serviceWindow, quota] = await Promise.all([
    repo.getWhatsAppThreadWindow(
      { threadId: original.threadId, phoneE164: original.phoneE164 },
      nowMs,
    ),
    repo.getWhatsAppMonthlyUsage(monthKey),
  ]);

  const fallbackWaMeUrl = buildWhatsAppLink(original.phoneE164, original.bodyText);
  const isTemplate = Boolean(
    original.messageType === 'template' || original.templateTriggerKey,
  );

  if (isTemplate) {
    if (quota.alertLevel === 'limit_100' || quota.sentCount >= quota.quotaLimit) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          error:
            'Se alcanzó la cuota mensual de WhatsApp Business (100 %). Usa wa.me para continuar.',
          fallbackWaMeUrl,
          quota,
        },
        { status: 429, headers: PRIVATE_NO_STORE },
      );
    }
  } else if (!serviceWindow.isOpen) {
    return NextResponse.json(
      {
        ok: false,
        code: 'WINDOW_CLOSED',
        error:
          'La ventana de 24 h está cerrada para reenviar texto libre. Envía una plantilla oficial o usa wa.me.',
        fallbackWaMeUrl,
        quota,
        serviceWindow,
      },
      { status: 422, headers: PRIVATE_NO_STORE },
    );
  }

  const dispatchRes = await dispatchWhatsAppNotification({
    toPhoneE164: original.phoneE164,
    bodyText: original.bodyText,
    triggerKey: isTemplate ? (original.templateTriggerKey ?? undefined) : undefined,
    templateName: isTemplate ? (original.templateName ?? undefined) : undefined,
    templateParameters: isTemplate ? original.templateParams : undefined,
    withinServiceWindow: serviceWindow.isOpen,
    settingsTimezone: tz,
    monthKey,
    threadContext: {
      clientId: original.clientId,
      bookingId: original.bookingId,
      notificationId: original.notificationId,
      senderKind: 'staff',
      senderName: session.user.fullName,
      skipPersist: true,
      enforcePolicyInDemo: true,
    },
  });

  const deliveryMode: WhatsAppMessageDeliveryMode =
    dispatchRes.deliveryMode ??
    (env.whatsappCloudConfigured ? (isTemplate ? 'template' : 'text') : 'demo');

  const resolved = await repo.resolveRetriedWhatsAppMessage({
    messageId: original.id,
    deliveryStatus: dispatchRes.status === 'sent' ? 'sent' : 'failed',
    deliveryMode,
    providerMessageId: dispatchRes.providerMessageId,
    errorCode: dispatchRes.errorCode ?? null,
    errorMessage: dispatchRes.errorMessage,
    senderName: session.user.fullName,
    atIso: now.toISOString(),
  });

  if (!resolved) {
    return NextResponse.json(
      { error: 'Mensaje no encontrado.' },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  if (original.notificationId) {
    await repo.updateScheduledNotificationStatus(original.notificationId, {
      status: dispatchRes.status,
      deliveryStatus: dispatchRes.status === 'sent' ? 'sent' : 'failed',
      providerMessageId: dispatchRes.providerMessageId,
      errorMessage: dispatchRes.errorMessage,
      sentAt: dispatchRes.status === 'sent' ? now.toISOString() : null,
      lastAttemptAt: now.toISOString(),
      nextRetryAt: null,
    });
  }

  await repo.writeAuditLog({
    actorId: session.user.id,
    actorEmail: session.user.email,
    actorRole: session.user.role,
    action: 'whatsapp_message_sent',
    entityType: 'whatsapp_message',
    entityId: resolved.message.id,
    metadata: {
      retriedFromMessageId: original.id,
      deliveryStatus: resolved.message.deliveryStatus,
      deliveryMode,
      threadId: resolved.thread.id,
    },
  });

  const [updatedDetail, updatedQuota] = await Promise.all([
    repo.getWhatsAppThreadDetail({
      threadId: resolved.thread.id,
      role: session.user.role,
      staffMemberId: session.user.staffMemberId,
      limit: 1,
    }),
    repo.getWhatsAppMonthlyUsage(monthKey),
  ]);

  const responseBody: WhatsAppSendResponseDTO = {
    ok: dispatchRes.status === 'sent',
    message: resolved.message,
    thread:
      updatedDetail?.thread ?? {
        ...resolved.thread,
        clientEmail: null,
        clientInstagram: null,
        serviceWindow,
        nextBooking: null,
        lastDeliveryStatus: resolved.message.deliveryStatus,
        lastSenderKind: resolved.message.senderKind,
      },
    deliveryMode,
    fallbackWaMeUrl: dispatchRes.fallbackWaMeUrl ?? fallbackWaMeUrl,
    quota: updatedQuota,
    ...(dispatchRes.status !== 'sent'
      ? {
          error:
            dispatchRes.errorMessage ||
            'No se pudo reenviar el mensaje por WhatsApp.',
          code: dispatchRes.errorCode ?? 'DELIVERY_FAILED',
        }
      : {}),
  };

  return NextResponse.json(responseBody, {
    status: dispatchRes.status === 'sent' ? 200 : 502,
    headers: PRIVATE_NO_STORE,
  });
}
