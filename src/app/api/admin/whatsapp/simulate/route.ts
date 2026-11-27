import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import {
  WhatsAppSimulateEventSchema,
  type WhatsAppSimulateResponseDTO,
} from '@/lib/contracts';
import { normalizePhoneE164 } from '@/lib/format';
import { executeWhatsAppBookingFlow } from '@/lib/integrations/whatsapp-booking';
import { processWhatsAppWebhookPayload } from '@/lib/integrations/whatsapp-processor';
import { canonicalizeWhatsAppPhoneE164 } from '@/lib/notifications/whatsapp-inbox';
import { getRepository } from '@/lib/repositories/db';
import { isSupabaseEnabled } from '@/lib/repositories/supabase-client';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

function isWhatsAppSimulatorAllowed(): boolean {
  if (process.env.WHATSAPP_SIMULATOR_ENABLED === 'false') {
    return false;
  }
  return (
    !isSupabaseEnabled() ||
    process.env.NODE_ENV !== 'production' ||
    process.env.WHATSAPP_SIMULATOR_ENABLED === 'true'
  );
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para usar el simulador de WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  if (!isWhatsAppSimulatorAllowed()) {
    return NextResponse.json(
      {
        error: 'El simulador de WhatsApp está deshabilitado en producción.',
        code: 'SIMULATOR_DISABLED',
      },
      { status: 403, headers: PRIVATE_NO_STORE },
    );
  }

  if (isSupabaseEnabled() && session.user.role !== 'owner') {
    return NextResponse.json(
      {
        error: 'Solo la dueña puede ejecutar el simulador cuando Supabase está activo.',
      },
      { status: 403, headers: PRIVATE_NO_STORE },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin-whatsapp-simulate',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Demasiadas simulaciones seguidas. Intenta en unos segundos.' },
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

  const parsedResult = WhatsAppSimulateEventSchema.safeParse(rawBody);
  if (!parsedResult.success) {
    return NextResponse.json(
      { error: parsedResult.error.issues[0]?.message || 'Evento de simulación inválido.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const input = parsedResult.data;
  const repo = getRepository();
  const simId = `wamid.sim.${crypto.randomUUID().slice(0, 12)}`;
  const nowSec = String(Math.floor(Date.now() / 1000));

  if (input.event === 'inbound_text') {
    const phoneE164 =
      canonicalizeWhatsAppPhoneE164(input.phone) || normalizePhoneE164(input.phone);
    const digits = phoneE164.replace(/\D/g, '');
    const metaPayload = {
      entry: [
        {
          id: 'sim-waba',
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [
                  {
                    wa_id: digits,
                    profile: { name: input.clientName ?? 'Clienta Simulada' },
                  },
                ],
                messages: [
                  {
                    id: simId,
                    from: digits,
                    timestamp: nowSec,
                    type: 'text',
                    text: { body: input.bodyText },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const summary = await processWhatsAppWebhookPayload(metaPayload, {
      source: 'simulator',
    });

    const response: WhatsAppSimulateResponseDTO = {
      ok: true,
      event: input.event,
      threadId: summary.lastThreadId,
      phoneE164: summary.lastPhoneE164 || phoneE164,
      createdMessages: summary.createdMessages,
      sideEffectSummary:
        summary.bookingAction?.summary ??
        'Mensaje entrante guardado y ventana de 24 h abierta.',
      processed: {
        messages: summary.processedMessages,
        statuses: summary.processedStatuses,
        echoes: summary.processedEchoes,
        duplicates: summary.duplicatesSkipped,
        usageIncremented: summary.usageIncremented,
        attendanceConfirmed: summary.attendanceConfirmed,
      },
      ...(summary.bookingAction?.bookingCode
        ? { bookingCode: summary.bookingAction.bookingCode }
        : {}),
      ...(summary.botReplies[0]?.bodyText
        ? { replyText: summary.botReplies[0].bodyText }
        : {}),
    };

    return NextResponse.json(response, { headers: PRIVATE_NO_STORE });
  }

  if (input.event === 'inbound_button') {
    const phoneE164 =
      canonicalizeWhatsAppPhoneE164(input.phone) || normalizePhoneE164(input.phone);
    const digits = phoneE164.replace(/\D/g, '');
    const buttonMap = {
      confirm: {
        id: `confirm_booking:${input.bookingId ?? ''}`,
        title: 'Confirmo',
      },
      reschedule: {
        id: `reschedule_booking:${input.bookingId ?? ''}`,
        title: 'Necesito reagendar',
      },
      cancel: {
        id: `cancel_booking:${input.bookingId ?? ''}`,
        title: 'Cancelar cita',
      },
    } as const;
    const btn = buttonMap[input.buttonAction];

    const metaPayload = {
      entry: [
        {
          id: 'sim-waba',
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [
                  {
                    wa_id: digits,
                    profile: { name: input.clientName ?? 'Clienta Simulada' },
                  },
                ],
                messages: [
                  {
                    id: simId,
                    from: digits,
                    timestamp: nowSec,
                    type: 'interactive',
                    interactive: {
                      type: 'button_reply',
                      button_reply: { id: btn.id, title: btn.title },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const summary = await processWhatsAppWebhookPayload(metaPayload, {
      source: 'simulator',
    });

    const response: WhatsAppSimulateResponseDTO = {
      ok: true,
      event: input.event,
      threadId: summary.lastThreadId,
      phoneE164: summary.lastPhoneE164 || phoneE164,
      createdMessages: summary.createdMessages,
      sideEffectSummary:
        summary.bookingAction?.summary ??
        `Botón "${btn.title}" procesado en la conversación.`,
      processed: {
        messages: summary.processedMessages,
        statuses: summary.processedStatuses,
        echoes: summary.processedEchoes,
        duplicates: summary.duplicatesSkipped,
        usageIncremented: summary.usageIncremented,
        attendanceConfirmed: summary.attendanceConfirmed,
      },
      ...(summary.bookingAction?.bookingCode
        ? { bookingCode: summary.bookingAction.bookingCode }
        : {}),
      ...(summary.botReplies[0]?.bodyText
        ? { replyText: summary.botReplies[0].bodyText }
        : {}),
    };

    return NextResponse.json(response, { headers: PRIVATE_NO_STORE });
  }

  if (input.event === 'coexistence_echo') {
    const phoneE164 =
      canonicalizeWhatsAppPhoneE164(input.phone) || normalizePhoneE164(input.phone);
    const digits = phoneE164.replace(/\D/g, '');
    const salonSettings = await repo.getSalonSettings();
    const salonDigits = salonSettings.whatsappNumber.replace(/\D/g, '') || '522221234567';

    const metaPayload = {
      entry: [
        {
          id: 'sim-waba',
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                message_echoes: [
                  {
                    id: simId,
                    from: salonDigits,
                    to: digits,
                    timestamp: nowSec,
                    type: 'text',
                    text: { body: input.bodyText },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const summary = await processWhatsAppWebhookPayload(metaPayload, {
      source: 'simulator',
    });

    const response: WhatsAppSimulateResponseDTO = {
      ok: true,
      event: input.event,
      threadId: summary.lastThreadId,
      phoneE164: summary.lastPhoneE164 || phoneE164,
      createdMessages: summary.createdMessages,
      sideEffectSummary:
        'Eco de Coexistence (celular) sincronizado sin disparar respuestas automáticas ni cuota.',
      processed: {
        messages: summary.processedMessages,
        statuses: summary.processedStatuses,
        echoes: summary.processedEchoes,
        duplicates: summary.duplicatesSkipped,
        usageIncremented: summary.usageIncremented,
        attendanceConfirmed: summary.attendanceConfirmed,
      },
    };

    return NextResponse.json(response, { headers: PRIVATE_NO_STORE });
  }

  if (input.event === 'delivery_status') {
    let targetProviderId = input.providerMessageId?.trim() || null;
    let targetMessage = input.messageId
      ? await repo.getWhatsAppMessageById(input.messageId)
      : null;

    if (!targetProviderId && targetMessage?.providerMessageId) {
      targetProviderId = targetMessage.providerMessageId;
    }

    if (targetProviderId) {
      const metaPayload = {
        entry: [
          {
            id: 'sim-waba',
            changes: [
              {
                field: 'messages',
                value: {
                  statuses: [
                    {
                      id: targetProviderId,
                      status: input.status,
                      timestamp: nowSec,
                      pricing: { billable: false, category: 'service' },
                      ...(input.status === 'failed'
                        ? {
                            errors: [
                              {
                                code: Number(input.errorCode ?? '131026') || 131026,
                                title:
                                  input.errorMessage ??
                                  'Error simulado de entrega por Meta',
                              },
                            ],
                          }
                        : {}),
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const summary = await processWhatsAppWebhookPayload(metaPayload, {
        source: 'simulator',
      });
      if (!targetMessage && input.messageId) {
        targetMessage = await repo.getWhatsAppMessageById(input.messageId);
      }

      const response: WhatsAppSimulateResponseDTO = {
        ok: true,
        event: input.event,
        threadId: summary.lastThreadId ?? targetMessage?.threadId ?? null,
        phoneE164: targetMessage?.phoneE164 ?? '',
        createdMessages: [],
        sideEffectSummary: `Estado "${input.status}" aplicado al mensaje ${targetProviderId}.`,
        processed: {
          messages: summary.processedMessages,
          statuses: summary.processedStatuses,
          echoes: summary.processedEchoes,
          duplicates: summary.duplicatesSkipped,
          usageIncremented: summary.usageIncremented,
          attendanceConfirmed: summary.attendanceConfirmed,
        },
      };
      return NextResponse.json(response, { headers: PRIVATE_NO_STORE });
    }

    const directUpdate = await repo.updateWhatsAppMessageStatusByProviderId({
      messageId: input.messageId,
      status: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    });

    const response: WhatsAppSimulateResponseDTO = {
      ok: directUpdate.updated,
      event: input.event,
      threadId: directUpdate.threadId,
      phoneE164: directUpdate.message?.phoneE164 ?? '',
      createdMessages: [],
      sideEffectSummary: directUpdate.updated
        ? `Estado "${input.status}" aplicado.`
        : 'Sin cambios (el estado ya estaba en una etapa igual o superior).',
      processed: {
        messages: 0,
        statuses: directUpdate.updated ? 1 : 0,
        echoes: 0,
        duplicates: 0,
        usageIncremented: 0,
        attendanceConfirmed: 0,
      },
    };
    return NextResponse.json(response, { headers: PRIVATE_NO_STORE });
  }

  const phoneE164 =
    canonicalizeWhatsAppPhoneE164(input.phone) || normalizePhoneE164(input.phone);
  const snapshot = await repo.getSnapshot();
  const targetService =
    (input.serviceId
      ? snapshot.services.find((s) => s.id === input.serviceId)
      : undefined) ??
    snapshot.services.find((s) => s.isActive && !s.isPrivate) ??
    snapshot.services[0];

  if (!targetService) {
    return NextResponse.json(
      { error: 'No hay servicios activos para simular el flujo de reserva.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const executed = await executeWhatsAppBookingFlow({
    phone: phoneE164,
    clientName: input.clientName ?? 'Clienta WhatsApp',
    serviceId: targetService.id,
    addonIds: input.addonIds ?? [],
    staffId: input.staffId ?? null,
    startAt: input.startAt,
  });

  const inbound = await repo.recordWhatsAppMessage({
    phoneE164,
    contactName: input.clientName ?? 'Clienta WhatsApp',
    clientId: executed.ok ? executed.booking.clientId : null,
    bookingId: executed.ok ? executed.booking.id : null,
    direction: 'inbound',
    senderKind: 'client',
    senderName: input.clientName ?? 'Clienta WhatsApp',
    messageType: 'interactive',
    bodyText: `Solicitud de reserva por WhatsApp Flow: ${targetService.name}.`,
    deliveryStatus: 'received',
    deliveryMode: 'inbound',
    providerMessageId: `${simId}.in`,
  });

  const reply = await repo.recordWhatsAppMessage({
    phoneE164,
    contactName: executed.ok
      ? executed.booking.client.fullName
      : (input.clientName ?? 'Clienta WhatsApp'),
    clientId: executed.ok ? executed.booking.clientId : inbound.thread.clientId,
    bookingId: executed.ok ? executed.booking.id : null,
    direction: 'outbound',
    senderKind: 'automation',
    senderName: 'Asistente de citas',
    messageType: 'text',
    bodyText: executed.replyText,
    deliveryStatus: 'sent',
    deliveryMode: 'demo',
    providerMessageId: `${simId}.out`,
  });

  const response: WhatsAppSimulateResponseDTO = {
    ok: executed.ok,
    event: input.event,
    threadId: reply.thread.id,
    phoneE164: reply.thread.phoneE164,
    createdMessages: [inbound.message, reply.message],
    sideEffectSummary: executed.ok
      ? `Cita ${executed.booking.bookingCode} agendada automáticamente por WhatsApp.`
      : executed.replyText,
    processed: {
      messages: 1,
      statuses: 0,
      echoes: 0,
      duplicates: 0,
      usageIncremented: 0,
      attendanceConfirmed: 0,
    },
    ...(executed.ok ? { bookingCode: executed.booking.bookingCode } : {}),
    replyText: executed.replyText,
  };

  return NextResponse.json(response, { headers: PRIVATE_NO_STORE });
}
