import { z } from 'zod';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { normalizePhoneE164, phonesMatchE164 } from '@/lib/format';
import { dispatchWhatsAppNotification } from '@/lib/integrations/notifications';
import { executeWhatsAppBookingFlow } from '@/lib/integrations/whatsapp-booking';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { logError, logInfo, logWarn } from '@/lib/logger';
import {
  canonicalizeWhatsAppPhoneE164,
  parseInboundWhatsAppIntent,
} from '@/lib/notifications/whatsapp-inbox';
import {
  claimWebhookEventIdempotent,
  confirmBookingAttendanceFromWebhook,
  getRepository,
  incrementWhatsAppMonthlyUsage,
  recordWhatsAppMessage,
  updateNotificationDeliveryByProviderId,
  updateWhatsAppMessageStatusByProviderId,
} from '@/lib/repositories/db';
import type {
  Booking,
  WhatsAppMessage,
  WhatsAppMessageType,
} from '@/lib/types';

const metaInboundMessageSchema = z.object({
  id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.string().optional(),
  text: z.object({ body: z.string().optional() }).optional(),
  image: z.object({ caption: z.string().optional() }).optional(),
  document: z.object({ caption: z.string().optional(), filename: z.string().optional() }).optional(),
  audio: z.object({ id: z.string().optional() }).optional(),
  video: z.object({ caption: z.string().optional() }).optional(),
  button: z
    .object({
      payload: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  interactive: z
    .object({
      type: z.string().optional(),
      button_reply: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
        })
        .optional(),
      list_reply: z
        .object({
          id: z.string().optional(),
          title: z.string().optional(),
        })
        .optional(),
      nfm_reply: z
        .object({
          response_json: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

const metaStatusSchema = z.object({
  id: z.string().optional(),
  status: z.string().optional(),
  recipient_id: z.string().optional(),
  timestamp: z.string().optional(),
  pricing: z
    .object({
      billable: z.boolean().optional(),
      category: z.string().optional(),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        code: z.union([z.number(), z.string()]).optional(),
        title: z.string().optional(),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

const metaSmbEchoSchema = z.object({
  id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.string().optional(),
  text: z.object({ body: z.string().optional() }).optional(),
  image: z.object({ caption: z.string().optional() }).optional(),
});

const metaWebhookPayloadSchema = z.object({
  entry: z
    .array(
      z.object({
        id: z.string().optional(),
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: z
                .object({
                  contacts: z
                    .array(
                      z.object({
                        wa_id: z.string().optional(),
                        profile: z.object({ name: z.string().optional() }).optional(),
                      }),
                    )
                    .optional(),
                  messages: z.array(metaInboundMessageSchema).optional(),
                  statuses: z.array(metaStatusSchema).optional(),
                  message_echoes: z.array(metaSmbEchoSchema).optional(),
                  smb_message_echoes: z.array(metaSmbEchoSchema).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});

const flowPayloadSchema = z.object({
  client_name: z.string().trim().min(1).max(120).optional(),
  service_id: z.string().min(1),
  addon_ids: z.array(z.string()).optional(),
  staff_id: z.string().nullable().optional(),
  start_at: z.string().optional(),
});

export interface ProcessedWhatsAppWebhookSummary {
  parsed: boolean;
  processedMessages: number;
  processedEchoes: number;
  processedStatuses: number;
  duplicatesSkipped: number;
  usageIncremented: number;
  attendanceConfirmed: number;
  createdMessages: WhatsAppMessage[];
  botReplies: Array<{ phoneE164: string; bodyText: string; threadId: string | null }>;
  bookingAction: {
    type:
      | 'confirmed'
      | 'reschedule_link_sent'
      | 'cancel_link_sent'
      | 'booking_created'
      | 'booking_conflict';
    bookingId?: string;
    bookingCode?: string;
    summary: string;
  } | null;
  flowResult:
    | { ok: true; bookingCode: string; replyText: string }
    | { ok: false; replyText: string; conflict?: boolean }
    | null;
  lastThreadId: string | null;
  lastPhoneE164: string;
}

function toIsoFromMetaTimestamp(rawTs?: string): string {
  if (rawTs?.trim()) {
    const asNumber = Number(rawTs.trim());
    if (Number.isFinite(asNumber) && asNumber > 1_000_000_000) {
      const ms = asNumber > 1e12 ? asNumber : asNumber * 1000;
      const dt = new Date(ms);
      if (Number.isFinite(dt.getTime())) {
        return dt.toISOString();
      }
    }
    const parsedMs = Date.parse(rawTs.trim());
    if (Number.isFinite(parsedMs)) {
      return new Date(parsedMs).toISOString();
    }
  }
  return new Date().toISOString();
}

function canonicalizeMetaPhone(raw?: string): string {
  if (!raw?.trim()) return '';
  const canonical = canonicalizeWhatsAppPhoneE164(raw);
  if (canonical) return canonical;
  const fallback = normalizePhoneE164(raw);
  return fallback || `+${raw.replace(/\D/g, '')}`;
}

function resolveInboundMessageType(rawType?: string): WhatsAppMessageType {
  if (rawType === 'text') return 'text';
  if (rawType === 'button') return 'button';
  if (rawType === 'interactive') return 'interactive';
  if (
    rawType === 'image' ||
    rawType === 'document' ||
    rawType === 'audio' ||
    rawType === 'video' ||
    rawType === 'sticker'
  ) {
    return 'media';
  }
  if (rawType === 'system') return 'system';
  return 'text';
}

function extractInboundBodyText(
  message: z.infer<typeof metaInboundMessageSchema>,
): string {
  if (message.text?.body?.trim()) {
    return message.text.body.trim();
  }
  if (message.interactive?.button_reply?.title?.trim()) {
    return message.interactive.button_reply.title.trim();
  }
  if (message.interactive?.list_reply?.title?.trim()) {
    return message.interactive.list_reply.title.trim();
  }
  if (message.button?.text?.trim()) {
    return message.button.text.trim();
  }
  if (message.interactive?.type === 'nfm_reply') {
    return 'Solicitud de reserva enviada desde WhatsApp Flow.';
  }
  if (message.image?.caption?.trim()) {
    return `[Imagen] ${message.image.caption.trim()}`;
  }
  if (message.video?.caption?.trim()) {
    return `[Video] ${message.video.caption.trim()}`;
  }
  if (message.document?.filename?.trim() || message.document?.caption?.trim()) {
    return `[Documento] ${message.document.caption?.trim() || message.document.filename?.trim()}`;
  }
  if (message.type === 'image') return '[Imagen recibida]';
  if (message.type === 'audio') return '[Nota de voz recibida]';
  if (message.type === 'video') return '[Video recibido]';
  if (message.type === 'document') return '[Documento recibido]';
  return '[Mensaje recibido]';
}

function extractEchoBodyText(echo: z.infer<typeof metaSmbEchoSchema>): string {
  if (echo.text?.body?.trim()) {
    return echo.text.body.trim();
  }
  if (echo.image?.caption?.trim()) {
    return `[Imagen] ${echo.image.caption.trim()}`;
  }
  if (echo.type === 'image') return '[Imagen enviada desde celular]';
  return '[Mensaje enviado desde WhatsApp Business]';
}

function normalizeWebhookDeliveryStatus(
  rawStatus?: string,
): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const lower = (rawStatus ?? '').trim().toLowerCase();
  if (
    lower === 'sent' ||
    lower === 'delivered' ||
    lower === 'read' ||
    lower === 'failed'
  ) {
    return lower;
  }
  return null;
}

async function safeRecordMessage(
  input: Parameters<typeof recordWhatsAppMessage>[0],
): Promise<{ threadId: string; message: WhatsAppMessage } | null> {
  if (typeof recordWhatsAppMessage !== 'function') {
    return null;
  }
  try {
    const res = await recordWhatsAppMessage(input);
    return { threadId: res.thread.id, message: res.message };
  } catch (err) {
    logWarn('whatsapp_processor_record_message_failed', { error: err });
    return null;
  }
}

export async function processWhatsAppWebhookPayload(
  rawPayload: unknown,
  options: { source: 'webhook' | 'simulator' },
): Promise<ProcessedWhatsAppWebhookSummary> {
  const parsedBody = metaWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsedBody.success) {
    logWarn('webhook_whatsapp_schema_mismatch', { source: options.source });
    return {
      parsed: false,
      processedMessages: 0,
      processedEchoes: 0,
      processedStatuses: 0,
      duplicatesSkipped: 0,
      usageIncremented: 0,
      attendanceConfirmed: 0,
      createdMessages: [],
      botReplies: [],
      bookingAction: null,
      flowResult: null,
      lastThreadId: null,
      lastPhoneE164: '',
    };
  }

  const payloadPhones: string[] = [];
  for (const entry of parsedBody.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const echoes = [
        ...(value.message_echoes ?? []),
        ...(value.smb_message_echoes ?? []),
        ...(change.field === 'smb_message_echoes' ? (value.messages ?? []) : []),
      ];
      for (const echo of echoes) {
        const recipientPhone = canonicalizeMetaPhone(echo.to);
        if (recipientPhone) payloadPhones.push(recipientPhone);
      }
      if (change.field !== 'smb_message_echoes') {
        for (const msg of value.messages ?? []) {
          const senderPhone = canonicalizeMetaPhone(msg.from);
          if (senderPhone) payloadPhones.push(senderPhone);
        }
      }
    }
  }

  const repo = getRepository();
  const [settings, contactContext] = await Promise.all([
    repo.getSalonSettings(),
    repo.getWhatsAppContactContextByPhones(payloadPhones),
  ]);
  const tz = settings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(new Date(), tz);
  const env = getRuntimeIntegrationStatus();
  const clients = contactContext.clients;
  const bookings = contactContext.bookings;

  const findMatchingClient = (phoneE164: string) =>
    clients.find((c) => phonesMatchE164(c.phoneE164, phoneE164)) ?? null;

  const isOwnedActiveBooking = (booking: Booking, phoneE164: string): boolean => {
    if (
      booking.status === 'canceled' ||
      booking.status === 'completed' ||
      booking.status === 'no_show'
    ) {
      return false;
    }
    const matchedClient = clients.find((c) => c.id === booking.clientId);
    return Boolean(matchedClient && phonesMatchE164(matchedClient.phoneE164, phoneE164));
  };

  const findTargetBookingForIntent = (params: {
    phoneE164: string;
    explicitBookingId?: string | null;
    skipAlreadyConfirmed?: boolean;
    maxLookaheadHours?: number;
  }): Booking | null => {
    if (params.explicitBookingId) {
      const explicit = bookings.find(
        (b) =>
          b.id === params.explicitBookingId &&
          isOwnedActiveBooking(b, params.phoneE164),
      );
      if (explicit) return explicit;
    }
    const nowMs = Date.now();
    const lookaheadMs = (params.maxLookaheadHours ?? 168) * 60 * 60 * 1000;
    const candidates = bookings
      .filter((b) => {
        if (!isOwnedActiveBooking(b, params.phoneE164)) return false;
        const startMs = Date.parse(b.startAt);
        if (
          !Number.isFinite(startMs) ||
          startMs < nowMs - 60 * 60 * 1000 ||
          startMs > nowMs + lookaheadMs
        ) {
          return false;
        }
        if (params.skipAlreadyConfirmed && b.attendanceStatus === 'confirmed') {
          return false;
        }
        return true;
      })
      .toSorted((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
    return candidates[0] ?? null;
  };

  let processedMessages = 0;
  let processedStatuses = 0;
  let processedEchoes = 0;
  let duplicatesSkipped = 0;
  let usageIncremented = 0;
  let attendanceConfirmed = 0;
  const createdMessages: WhatsAppMessage[] = [];
  const botReplies: ProcessedWhatsAppWebhookSummary['botReplies'] = [];
  let bookingAction: ProcessedWhatsAppWebhookSummary['bookingAction'] = null;
  let flowResult: ProcessedWhatsAppWebhookSummary['flowResult'] = null;
  let lastThreadId: string | null = null;
  let lastPhoneE164 = '';

  const dispatchAndRecordBotReply = async (params: {
    phoneE164: string;
    contactName: string | null;
    clientId: string | null;
    bookingId: string | null;
    bodyText: string;
    senderName: string;
  }): Promise<void> => {
    const dispatchRes = await dispatchWhatsAppNotification({
      toPhoneE164: params.phoneE164,
      bodyText: params.bodyText,
      withinServiceWindow: true,
      settingsTimezone: tz,
      threadContext: {
        clientId: params.clientId,
        bookingId: params.bookingId,
        contactName: params.contactName,
        senderKind: 'automation',
        senderName: params.senderName,
        skipPersist: true,
      },
    });
    const persisted = await safeRecordMessage({
      phoneE164: params.phoneE164,
      contactName: params.contactName,
      clientId: params.clientId,
      bookingId: params.bookingId,
      direction: 'outbound',
      senderKind: 'automation',
      senderName: params.senderName,
      messageType: 'text',
      bodyText: params.bodyText,
      deliveryStatus: dispatchRes.status === 'sent' ? 'sent' : 'failed',
      deliveryMode: env.whatsappCloudConfigured ? 'text' : 'demo',
      providerMessageId: dispatchRes.providerMessageId,
      errorCode: dispatchRes.errorCode ?? null,
      errorMessage: dispatchRes.errorMessage,
    });
    if (persisted) {
      createdMessages.push(persisted.message);
      lastThreadId = persisted.threadId;
    }
    botReplies.push({
      phoneE164: params.phoneE164,
      bodyText: params.bodyText,
      threadId: persisted?.threadId ?? lastThreadId,
    });
  };

  const handleIntentAction = async (params: {
    intent: 'confirm' | 'reschedule' | 'cancel';
    phoneE164: string;
    contactName: string | null;
    clientId: string | null;
    explicitBookingId?: string | null;
    fromButton?: boolean;
  }): Promise<void> => {
    const targetBooking = findTargetBookingForIntent({
      phoneE164: params.phoneE164,
      explicitBookingId: params.explicitBookingId,
      skipAlreadyConfirmed: !params.fromButton && params.intent === 'confirm',
      maxLookaheadHours: params.fromButton ? 24 * 60 : 168,
    });

    if (!targetBooking) return;

    const baseUrl = env.appUrl.replace(/\/+$/, '');
    const manageUrl = `${baseUrl}/cita/${targetBooking.manageToken}`;

    if (params.intent === 'confirm') {
      const confirmed = await confirmBookingAttendanceFromWebhook({
        bookingId: targetBooking.id,
        phoneE164: params.phoneE164,
        via: 'whatsapp',
      });
      if (confirmed) {
        attendanceConfirmed += 1;
        const replyText = `¡Perfecto ${confirmed.client.fullName}! Confirmamos tu asistencia para ${confirmed.service.name} (${confirmed.bookingCode}). Te esperamos en ${settings.name}.`;
        await dispatchAndRecordBotReply({
          phoneE164: params.phoneE164,
          contactName: confirmed.client.fullName,
          clientId: confirmed.clientId,
          bookingId: confirmed.id,
          bodyText: replyText,
          senderName: 'Asistente WhatsApp',
        });
        bookingAction = {
          type: 'confirmed',
          bookingId: confirmed.id,
          bookingCode: confirmed.bookingCode,
          summary: `Asistencia confirmada para ${confirmed.bookingCode}.`,
        };
      }
      return;
    }

    if (params.intent === 'reschedule') {
      const replyText = `Sin problema, elige tu nuevo horario para tu cita ${targetBooking.bookingCode} en segundos aquí: ${manageUrl}?action=reschedule`;
      await dispatchAndRecordBotReply({
        phoneE164: params.phoneE164,
        contactName: params.contactName,
        clientId: params.clientId ?? targetBooking.clientId,
        bookingId: targetBooking.id,
        bodyText: replyText,
        senderName: 'Asistente WhatsApp',
      });
      bookingAction = {
        type: 'reschedule_link_sent',
        bookingId: targetBooking.id,
        bookingCode: targetBooking.bookingCode,
        summary: `Enlace de reagenda enviado para ${targetBooking.bookingCode}.`,
      };
      return;
    }

    const minCancelHours = settings.minCancelHours ?? 12;
    const replyText = `Para cuidar tu anticipo y aplicar nuestra política de cancelación (${minCancelHours} h de anticipación), realiza la cancelación de tu cita ${targetBooking.bookingCode} directamente desde tu enlace personal: ${manageUrl}?action=cancel`;
    await dispatchAndRecordBotReply({
      phoneE164: params.phoneE164,
      contactName: params.contactName,
      clientId: params.clientId ?? targetBooking.clientId,
      bookingId: targetBooking.id,
      bodyText: replyText,
      senderName: 'Asistente WhatsApp',
    });
    bookingAction = {
      type: 'cancel_link_sent',
      bookingId: targetBooking.id,
      bookingCode: targetBooking.bookingCode,
      summary: `Enlace seguro de cancelación enviado para ${targetBooking.bookingCode} (sin saltar política de ${minCancelHours} h).`,
    };
  };

  for (const entry of parsedBody.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      const echoes = [
        ...(value.message_echoes ?? []),
        ...(value.smb_message_echoes ?? []),
        ...(change.field === 'smb_message_echoes' ? (value.messages ?? []) : []),
      ];

      for (const echo of echoes) {
        const echoKey =
          echo.id?.trim() ||
          `echo:${echo.from ?? ''}:${echo.to ?? ''}:${echo.timestamp ?? ''}`;
        const claimed = await claimWebhookEventIdempotent('whatsapp_smb_echo', echoKey);
        if (!claimed) {
          duplicatesSkipped += 1;
          continue;
        }
        processedEchoes += 1;

        const recipientPhone = canonicalizeMetaPhone(echo.to);
        if (recipientPhone) {
          lastPhoneE164 = recipientPhone;
          const matchedClient = findMatchingClient(recipientPhone);
          const persisted = await safeRecordMessage({
            phoneE164: recipientPhone,
            contactName: matchedClient?.fullName ?? null,
            clientId: matchedClient?.id ?? null,
            direction: 'echo',
            senderKind: 'coexistence_phone',
            senderName: 'WhatsApp Business (Celular)',
            messageType: resolveInboundMessageType(echo.type),
            bodyText: extractEchoBodyText(echo),
            deliveryStatus: 'sent',
            deliveryMode: 'coexistence',
            providerMessageId: echo.id?.trim() || null,
            createdAt: toIsoFromMetaTimestamp(echo.timestamp),
          });
          if (persisted) {
            createdMessages.push(persisted.message);
            lastThreadId = persisted.threadId;
          }
        }

        logInfo('webhook_whatsapp_smb_echo_synced', {
          source: options.source,
          echoId: echo.id ?? null,
          type: echo.type ?? 'unknown',
        });
      }

      for (const statusItem of value.statuses ?? []) {
        const statusName = statusItem.status?.trim() || 'unknown';
        const statusId = statusItem.id?.trim();
        const statusEventKey = statusId
          ? `${statusId}:${statusName}`
          : `status:${statusItem.recipient_id ?? ''}:${statusItem.timestamp ?? ''}:${statusName}`;

        const claimedStatus = await claimWebhookEventIdempotent(
          'whatsapp_status',
          statusEventKey,
        );
        if (!claimedStatus) {
          duplicatesSkipped += 1;
          continue;
        }
        processedStatuses += 1;

        const normalizedStatus = normalizeWebhookDeliveryStatus(statusName);
        const firstError = statusItem.errors?.[0];
        const errorCode =
          firstError?.code !== undefined ? String(firstError.code) : null;
        const errorSummary =
          statusName === 'failed'
            ? (statusItem.errors ?? [])
                .map((errItem) =>
                  [
                    errItem.code !== undefined ? `#${errItem.code}` : '',
                    errItem.title ?? errItem.message ?? '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                )
                .filter(Boolean)
                .join('; ') || 'No se pudo entregar el mensaje por WhatsApp.'
            : null;

        if (statusId && normalizedStatus) {
          if (typeof updateWhatsAppMessageStatusByProviderId === 'function') {
            const statusUpdate = await updateWhatsAppMessageStatusByProviderId({
              providerMessageId: statusId,
              status: normalizedStatus,
              errorCode,
              errorMessage: errorSummary,
              atIso: toIsoFromMetaTimestamp(statusItem.timestamp),
            });
            if (statusUpdate.threadId) {
              lastThreadId = statusUpdate.threadId;
            }
          } else if (normalizedStatus === 'failed') {
            await updateNotificationDeliveryByProviderId(statusId, 'failed', errorSummary);
          } else if (normalizedStatus === 'delivered' || normalizedStatus === 'read') {
            await updateNotificationDeliveryByProviderId(statusId, 'sent', null);
          }
        }

        if (statusName === 'failed') {
          logWarn('webhook_whatsapp_message_failed', {
            source: options.source,
            messageId: statusId ?? null,
            errorCode,
          });
        } else {
          logInfo('webhook_whatsapp_status_updated', {
            source: options.source,
            messageId: statusId ?? null,
            status: statusName,
          });
        }

        const isBillableSent =
          statusName === 'sent' &&
          Boolean(statusId) &&
          statusItem.pricing?.billable !== false;
        if (isBillableSent && statusId) {
          const claimedUsage = await claimWebhookEventIdempotent(
            'whatsapp_usage',
            statusId,
          );
          if (claimedUsage) {
            await incrementWhatsAppMonthlyUsage(monthKey, 1);
            usageIncremented += 1;
          }
        }
      }

      if (change.field === 'smb_message_echoes') {
        continue;
      }

      for (const message of value.messages ?? []) {
        if (message.id?.trim()) {
          const claimedMsg = await claimWebhookEventIdempotent(
            'whatsapp_message',
            message.id.trim(),
          );
          if (!claimedMsg) {
            duplicatesSkipped += 1;
            continue;
          }
        }

        processedMessages += 1;
        const phoneE164 = canonicalizeMetaPhone(message.from);
        const matchedClient = phoneE164 ? findMatchingClient(phoneE164) : null;
        const contactName =
          value.contacts?.[0]?.profile?.name?.trim() ||
          matchedClient?.fullName ||
          null;
        const linkedBooking = phoneE164
          ? findTargetBookingForIntent({ phoneE164, maxLookaheadHours: 24 * 60 })
          : null;

        if (phoneE164) {
          lastPhoneE164 = phoneE164;
          const persistedInbound = await safeRecordMessage({
            phoneE164,
            contactName,
            clientId: matchedClient?.id ?? null,
            bookingId: linkedBooking?.id ?? null,
            direction: 'inbound',
            senderKind: 'client',
            senderName: contactName,
            messageType: resolveInboundMessageType(message.type),
            bodyText: extractInboundBodyText(message),
            deliveryStatus: 'received',
            deliveryMode: 'inbound',
            providerMessageId: message.id?.trim() || null,
            createdAt: toIsoFromMetaTimestamp(message.timestamp),
          });
          if (persistedInbound) {
            createdMessages.push(persistedInbound.message);
            lastThreadId = persistedInbound.threadId;
          }
        }

        if (
          message.type === 'interactive' &&
          message.interactive?.type === 'nfm_reply' &&
          phoneE164
        ) {
          try {
            const parsedFlowRaw = JSON.parse(
              message.interactive.nfm_reply?.response_json || '{}',
            ) as unknown;
            const flowPayload = flowPayloadSchema.safeParse(parsedFlowRaw);
            if (!flowPayload.success) {
              logWarn('webhook_whatsapp_flow_schema_invalid', { source: options.source });
              continue;
            }
            const executed = await executeWhatsAppBookingFlow({
              phone: phoneE164,
              clientName:
                flowPayload.data.client_name ||
                contactName ||
                'Clienta WhatsApp',
              serviceId: flowPayload.data.service_id,
              addonIds: flowPayload.data.addon_ids ?? [],
              staffId: flowPayload.data.staff_id ?? null,
              startAt: flowPayload.data.start_at,
            });
            if (executed.ok) {
              flowResult = {
                ok: true,
                bookingCode: executed.booking.bookingCode,
                replyText: executed.replyText,
              };
              bookingAction = {
                type: 'booking_created',
                bookingId: executed.booking.id,
                bookingCode: executed.booking.bookingCode,
                summary: `Cita ${executed.booking.bookingCode} agendada por WhatsApp.`,
              };
              await dispatchAndRecordBotReply({
                phoneE164,
                contactName: executed.booking.client.fullName,
                clientId: executed.booking.clientId,
                bookingId: executed.booking.id,
                bodyText: executed.replyText,
                senderName: 'Asistente de citas',
              });
            } else {
              flowResult = {
                ok: false,
                replyText: executed.replyText,
                ...('conflict' in executed && executed.conflict
                  ? { conflict: true }
                  : {}),
              };
              bookingAction = {
                type: 'booking_conflict',
                summary: executed.replyText,
              };
              await dispatchAndRecordBotReply({
                phoneE164,
                contactName,
                clientId: matchedClient?.id ?? null,
                bookingId: null,
                bodyText: executed.replyText,
                senderName: 'Asistente de citas',
              });
            }
          } catch (err) {
            logError('webhook_whatsapp_flow_execution_failed', {
              source: options.source,
              error: err,
            });
          }
        } else if (
          phoneE164 &&
          ((message.type === 'interactive' &&
            message.interactive?.type === 'button_reply') ||
            message.type === 'button')
        ) {
          const buttonId = (
            message.interactive?.button_reply?.id ??
            message.button?.payload ??
            ''
          ).trim();
          const buttonTitle = (
            message.interactive?.button_reply?.title ??
            message.button?.text ??
            ''
          ).trim();

          let intent: 'confirm' | 'reschedule' | 'cancel' | null = null;
          let explicitBookingId: string | null = null;

          if (buttonId.startsWith('confirm_booking:')) {
            intent = 'confirm';
            explicitBookingId = buttonId.slice('confirm_booking:'.length).trim() || null;
          } else if (buttonId.startsWith('reschedule_booking:')) {
            intent = 'reschedule';
            explicitBookingId = buttonId.slice('reschedule_booking:'.length).trim() || null;
          } else if (buttonId.startsWith('cancel_booking:')) {
            intent = 'cancel';
            explicitBookingId = buttonId.slice('cancel_booking:'.length).trim() || null;
          } else {
            intent = parseInboundWhatsAppIntent(buttonTitle);
          }

          if (intent) {
            await handleIntentAction({
              intent,
              phoneE164,
              contactName,
              clientId: matchedClient?.id ?? null,
              explicitBookingId,
              fromButton: true,
            });
          }
        } else if (phoneE164 && message.type === 'text' && message.text?.body) {
          const textIntent = parseInboundWhatsAppIntent(message.text.body);
          if (textIntent) {
            await handleIntentAction({
              intent: textIntent,
              phoneE164,
              contactName,
              clientId: matchedClient?.id ?? null,
              fromButton: false,
            });
          } else {
            logInfo('webhook_whatsapp_inbound_message', {
              source: options.source,
              messageId: message.id ?? null,
              type: message.type ?? 'unknown',
            });
          }
        } else {
          logInfo('webhook_whatsapp_inbound_message', {
            source: options.source,
            messageId: message.id ?? null,
            type: message.type ?? 'unknown',
          });
        }
      }
    }
  }

  return {
    parsed: true,
    processedMessages,
    processedEchoes,
    processedStatuses,
    duplicatesSkipped,
    usageIncremented,
    attendanceConfirmed,
    createdMessages,
    botReplies,
    bookingAction,
    flowResult,
    lastThreadId,
    lastPhoneE164,
  };
}
