import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import {
  WhatsAppSendMessageSchema,
  type WhatsAppSendResponseDTO,
} from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { buildWhatsAppLink, normalizePhoneE164 } from '@/lib/format';
import { dispatchWhatsAppNotification } from '@/lib/integrations/notifications';
import {
  getOfficialWhatsAppTemplateSpec,
  getWhatsAppMonthKey,
} from '@/lib/integrations/whatsapp-templates';
import {
  canonicalizeWhatsAppPhoneE164,
  renderWhatsAppTemplatePreview,
} from '@/lib/notifications/whatsapp-inbox';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import { getRepository } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';
import type { WhatsAppMessageDeliveryMode } from '@/lib/types';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = ADMIN_PRIVATE_HEADERS;

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para enviar mensajes por WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin-whatsapp-send',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiados mensajes seguidos. Intenta nuevamente en unos segundos.' },
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

  const parsedResult = WhatsAppSendMessageSchema.safeParse(rawBody);
  if (!parsedResult.success) {
    return NextResponse.json(
      { error: parsedResult.error.issues[0]?.message || 'Datos de envío inválidos.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  try {
    const input = parsedResult.data;
    const repo = getRepository();
    const env = getRuntimeIntegrationStatus();
    const now = new Date();
    const nowMs = now.getTime();
    const salonSettings = await repo.getSalonSettings();
    const tz = salonSettings.timezone || 'America/Mexico_City';
    const monthKey = getWhatsAppMonthKey(now, tz);

    const existingDetail = await repo.getWhatsAppThreadDetail({
      threadId: input.threadId,
      phoneE164: input.phoneE164,
      clientId: input.clientId,
      role: session.user.role,
      staffMemberId: session.user.staffMemberId,
      limit: 1,
      nowMs,
    });

    let resolvedPhone =
      existingDetail?.thread.phoneE164 ??
      (input.phoneE164
        ? canonicalizeWhatsAppPhoneE164(input.phoneE164) ||
          normalizePhoneE164(input.phoneE164)
        : '');
    let resolvedClientId =
      existingDetail?.client?.id ??
      existingDetail?.thread.clientId ??
      input.clientId ??
      null;
    let resolvedContactName =
      input.contactName?.trim() ||
      existingDetail?.client?.fullName ||
      existingDetail?.thread.contactName ||
      null;

    if (!resolvedPhone && resolvedClientId) {
      const matchedClient = await repo.getClientById(resolvedClientId);
      if (matchedClient) {
        resolvedPhone =
          canonicalizeWhatsAppPhoneE164(matchedClient.phoneE164) ||
          matchedClient.phoneE164;
        if (!resolvedContactName) {
          resolvedContactName = matchedClient.fullName;
        }
      }
    }

    if (!resolvedPhone) {
      return NextResponse.json(
        { error: 'No se encontró un número de WhatsApp válido para el destinatario.' },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }

    const [serviceWindow, quota, templates] = await Promise.all([
      repo.getWhatsAppThreadWindow(
        {
          threadId: existingDetail?.thread.id,
          phoneE164: resolvedPhone,
        },
        nowMs,
      ),
      repo.getWhatsAppMonthlyUsage(monthKey),
      repo.getWhatsAppTemplates(),
    ]);

    if (input.mode === 'text') {
      const fallbackWaMeUrl = buildWhatsAppLink(resolvedPhone, input.bodyText);
      if (!serviceWindow.isOpen) {
        return NextResponse.json(
          {
            ok: false,
            code: 'WINDOW_CLOSED',
            error:
              'La ventana de atención de 24 horas de Meta está cerrada. Envía una plantilla oficial aprobada o continúa en wa.me.',
            fallbackWaMeUrl,
            quota,
            serviceWindow,
          },
          { status: 422, headers: PRIVATE_NO_STORE },
        );
      }

      const dispatchRes = await dispatchWhatsAppNotification({
        toPhoneE164: resolvedPhone,
        bodyText: input.bodyText,
        withinServiceWindow: true,
        settingsTimezone: tz,
        monthKey,
        threadContext: {
          clientId: resolvedClientId,
          bookingId: input.bookingId ?? existingDetail?.thread.nextBooking?.bookingId ?? null,
          contactName: resolvedContactName,
          senderKind: 'staff',
          senderName: session.user.fullName,
          skipPersist: true,
          enforcePolicyInDemo: true,
        },
      });

      const deliveryMode: WhatsAppMessageDeliveryMode = env.whatsappCloudConfigured
        ? dispatchRes.deliveryMode === 'text'
          ? 'text'
          : 'fallback_email_wame'
        : 'demo';

      const recorded = await repo.recordWhatsAppMessage({
        phoneE164: resolvedPhone,
        contactName: resolvedContactName,
        clientId: resolvedClientId,
        bookingId: input.bookingId ?? existingDetail?.thread.nextBooking?.bookingId ?? null,
        direction: 'outbound',
        senderKind: 'staff',
        senderName: session.user.fullName,
        messageType: 'text',
        bodyText: input.bodyText,
        deliveryStatus: dispatchRes.status === 'sent' ? 'sent' : 'failed',
        deliveryMode,
        providerMessageId: dispatchRes.providerMessageId,
        errorCode: dispatchRes.errorCode ?? null,
        errorMessage: dispatchRes.errorMessage,
      });

      await repo.writeAuditLog({
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: session.user.role,
        action: 'whatsapp_message_sent',
        entityType: 'whatsapp_message',
        entityId: recorded.message.id,
        metadata: {
          mode: 'text',
          deliveryStatus: recorded.message.deliveryStatus,
          deliveryMode,
          threadId: recorded.thread.id,
        },
      });

      const [updatedDetail, updatedQuota] = await Promise.all([
        repo.getWhatsAppThreadDetail({
          threadId: recorded.thread.id,
          role: session.user.role,
          staffMemberId: session.user.staffMemberId,
          limit: 1,
        }),
        repo.getWhatsAppMonthlyUsage(monthKey),
      ]);

      const responseBody: WhatsAppSendResponseDTO = {
        ok: dispatchRes.status === 'sent',
        message: recorded.message,
        thread:
          updatedDetail?.thread ?? {
            ...recorded.thread,
            clientEmail: null,
            clientInstagram: null,
            serviceWindow,
            nextBooking: null,
            lastDeliveryStatus: recorded.message.deliveryStatus,
            lastSenderKind: recorded.message.senderKind,
          },
        deliveryMode,
        fallbackWaMeUrl: dispatchRes.fallbackWaMeUrl ?? fallbackWaMeUrl,
        quota: updatedQuota,
        ...(dispatchRes.status !== 'sent'
          ? {
              error:
                dispatchRes.errorMessage ||
                'No se pudo enviar el mensaje por WhatsApp Cloud API.',
              code: dispatchRes.errorCode ?? 'DELIVERY_FAILED',
            }
          : {}),
      };

      return NextResponse.json(responseBody, {
        status: dispatchRes.status === 'sent' ? 200 : 502,
        headers: PRIVATE_NO_STORE,
      });
    }

    const spec = getOfficialWhatsAppTemplateSpec(input.triggerKey);
    if (input.parameters.length !== spec.parameterLabels.length) {
      return NextResponse.json(
        {
          ok: false,
          code: 'INVALID_TEMPLATE_PARAMS',
          error: `La plantilla "${spec.friendlyTitle}" requiere exactamente ${spec.parameterLabels.length} parámetro(s).`,
        },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }

    const renderedBody = renderWhatsAppTemplatePreview(
      input.triggerKey,
      input.parameters,
    );
    const fallbackWaMeUrl = buildWhatsAppLink(resolvedPhone, renderedBody);

    if (quota.alertLevel === 'limit_100' || quota.sentCount >= quota.quotaLimit) {
      return NextResponse.json(
        {
          ok: false,
          code: 'QUOTA_EXCEEDED',
          error:
            'Se alcanzó el límite mensual de WhatsApp Business (100 %). Usa el enlace directo wa.me para continuar sin cargos.',
          fallbackWaMeUrl,
          quota,
        },
        { status: 429, headers: PRIVATE_NO_STORE },
      );
    }

    const configuredTemplate = templates.find(
      (t) => t.triggerKey === input.triggerKey,
    );
    const resolvedTemplateName =
      input.templateName?.trim() ||
      configuredTemplate?.templateName ||
      spec.defaultTemplateName;

    const dispatchRes = await dispatchWhatsAppNotification({
      toPhoneE164: resolvedPhone,
      bodyText: renderedBody,
      triggerKey: input.triggerKey,
      templateName: resolvedTemplateName,
      templateParameters: input.parameters,
      withinServiceWindow: serviceWindow.isOpen,
      settingsTimezone: tz,
      monthKey,
      threadContext: {
        clientId: resolvedClientId,
        bookingId: input.bookingId ?? existingDetail?.thread.nextBooking?.bookingId ?? null,
        contactName: resolvedContactName,
        senderKind: 'staff',
        senderName: session.user.fullName,
        skipPersist: true,
        enforcePolicyInDemo: true,
      },
    });

    const deliveryMode: WhatsAppMessageDeliveryMode = env.whatsappCloudConfigured
      ? dispatchRes.deliveryMode === 'template'
        ? 'template'
        : 'fallback_email_wame'
      : 'demo';

    const recorded = await repo.recordWhatsAppMessage({
      phoneE164: resolvedPhone,
      contactName: resolvedContactName,
      clientId: resolvedClientId,
      bookingId: input.bookingId ?? existingDetail?.thread.nextBooking?.bookingId ?? null,
      direction: 'outbound',
      senderKind: 'staff',
      senderName: session.user.fullName,
      messageType: 'template',
      bodyText: renderedBody,
      templateName: resolvedTemplateName,
      templateTriggerKey: input.triggerKey,
      templateParams: [...input.parameters],
      deliveryStatus: dispatchRes.status === 'sent' ? 'sent' : 'failed',
      deliveryMode,
      providerMessageId: dispatchRes.providerMessageId,
      errorCode: dispatchRes.errorCode ?? null,
      errorMessage: dispatchRes.errorMessage,
    });

    await repo.writeAuditLog({
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.user.role,
      action: 'whatsapp_message_sent',
      entityType: 'whatsapp_message',
      entityId: recorded.message.id,
      metadata: {
        mode: 'template',
        triggerKey: input.triggerKey,
        templateName: resolvedTemplateName,
        deliveryStatus: recorded.message.deliveryStatus,
        deliveryMode,
        threadId: recorded.thread.id,
      },
    });

    const [updatedDetail, updatedQuota] = await Promise.all([
      repo.getWhatsAppThreadDetail({
        threadId: recorded.thread.id,
        role: session.user.role,
        staffMemberId: session.user.staffMemberId,
        limit: 1,
      }),
      repo.getWhatsAppMonthlyUsage(monthKey),
    ]);

    const responseBody: WhatsAppSendResponseDTO = {
      ok: dispatchRes.status === 'sent',
      message: recorded.message,
      thread:
        updatedDetail?.thread ?? {
          ...recorded.thread,
          clientEmail: null,
          clientInstagram: null,
          serviceWindow,
          nextBooking: null,
          lastDeliveryStatus: recorded.message.deliveryStatus,
          lastSenderKind: recorded.message.senderKind,
        },
      deliveryMode,
      fallbackWaMeUrl: dispatchRes.fallbackWaMeUrl ?? fallbackWaMeUrl,
      quota: updatedQuota,
      ...(dispatchRes.status !== 'sent'
        ? {
            error:
              dispatchRes.errorMessage ||
              'No se pudo enviar la plantilla por WhatsApp Cloud API.',
            code: dispatchRes.errorCode ?? 'DELIVERY_FAILED',
          }
        : {}),
    };

    return NextResponse.json(responseBody, {
      status: dispatchRes.status === 'sent' ? 200 : 502,
      headers: PRIVATE_NO_STORE,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos.' },
        { status: 400, headers: PRIVATE_NO_STORE },
      );
    }
    logError('admin_whatsapp_send_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo enviar el mensaje de WhatsApp.' },
      { status: 500, headers: PRIVATE_NO_STORE },
    );
  }
}
