import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import {
  buildWhatsAppFlowJsonSchema,
  executeWhatsAppBookingFlow,
  verifyMetaWebhookSignatureAsync,
} from '@/lib/integrations/whatsapp-booking';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { logError, logInfo, logWarn } from '@/lib/logger';
import {
  claimWebhookEventIdempotent,
  getRepository,
  incrementWhatsAppMonthlyUsage,
} from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

const metaInboundMessageSchema = z.object({
  id: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  timestamp: z.string().optional(),
  type: z.string().optional(),
  text: z.object({ body: z.string().optional() }).optional(),
  interactive: z
    .object({
      type: z.string().optional(),
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
        code: z.number().optional(),
        title: z.string().optional(),
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
});

const metaWebhookSchema = z.object({
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('schema') === '1') {
    return NextResponse.json(await buildWhatsAppFlowJsonSchema());
  }

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { error: 'Token de verificación no configurado' },
      { status: 403 },
    );
  }

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (
    mode === 'subscribe' &&
    token &&
    challenge &&
    constantTimeEqual(token, expectedToken)
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!(await verifyMetaWebhookSignatureAsync(rawBody, signature))) {
    logWarn('webhook_whatsapp_invalid_signature');
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  let rawJson: unknown;
  try {
    rawJson = rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch (err) {
    logWarn('webhook_whatsapp_invalid_json', { error: err });
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsedBody = metaWebhookSchema.safeParse(rawJson);
  if (!parsedBody.success) {
    logWarn('webhook_whatsapp_schema_mismatch');
    return NextResponse.json({ received: true, parsed: false });
  }

  const snapshot = await getRepository().getSnapshot();
  const tz = snapshot.settings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(new Date(), tz);

  let messagesProcessed = 0;
  let statusesProcessed = 0;
  let echoesProcessed = 0;
  let duplicatesSkipped = 0;
  let usageIncremented = 0;
  let flowResult: Awaited<ReturnType<typeof executeWhatsAppBookingFlow>> | undefined;

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
        echoesProcessed += 1;
        logInfo('webhook_whatsapp_smb_echo_synced', {
          echoId: echo.id ?? null,
          to: echo.to ?? null,
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
        statusesProcessed += 1;

        if (statusName === 'failed') {
          logWarn('webhook_whatsapp_message_failed', {
            messageId: statusId ?? null,
            recipient: statusItem.recipient_id ?? null,
            errors: statusItem.errors ?? [],
          });
        } else {
          logInfo('webhook_whatsapp_status_updated', {
            messageId: statusId ?? null,
            status: statusName,
            recipient: statusItem.recipient_id ?? null,
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

        messagesProcessed += 1;

        if (
          message.type === 'interactive' &&
          message.interactive?.type === 'nfm_reply' &&
          message.from
        ) {
          try {
            const parsedFlowRaw = JSON.parse(
              message.interactive.nfm_reply?.response_json || '{}',
            ) as unknown;
            const flowPayload = flowPayloadSchema.safeParse(parsedFlowRaw);
            if (!flowPayload.success) {
              logWarn('webhook_whatsapp_flow_schema_invalid', {
                phone: `+${message.from}`,
              });
              continue;
            }
            flowResult = await executeWhatsAppBookingFlow({
              phone: `+${message.from}`,
              clientName:
                flowPayload.data.client_name ||
                value.contacts?.[0]?.profile?.name ||
                'Clienta WhatsApp',
              serviceId: flowPayload.data.service_id,
              addonIds: flowPayload.data.addon_ids ?? [],
              staffId: flowPayload.data.staff_id ?? null,
              startAt: flowPayload.data.start_at,
            });
          } catch (err) {
            logError('webhook_whatsapp_flow_execution_failed', {
              phone: `+${message.from}`,
              error: err,
            });
          }
        } else {
          logInfo('webhook_whatsapp_inbound_message', {
            messageId: message.id ?? null,
            from: message.from ?? null,
            type: message.type ?? 'unknown',
          });
        }
      }
    }
  }

  return NextResponse.json({
    received: true,
    ...(flowResult ? { result: flowResult } : {}),
    processed: {
      messages: messagesProcessed,
      statuses: statusesProcessed,
      echoes: echoesProcessed,
      duplicates: duplicatesSkipped,
      usageIncremented,
    },
  });
}
