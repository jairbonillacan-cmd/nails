import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import {
  buildWhatsAppFlowJsonSchema,
  executeWhatsAppBookingFlow,
  verifyMetaWebhookSignature,
} from '@/lib/integrations/whatsapp-booking';

export const dynamic = 'force-dynamic';

const metaWebhookSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  contacts: z
                    .array(
                      z.object({
                        profile: z.object({ name: z.string().optional() }).optional(),
                      }),
                    )
                    .optional(),
                  messages: z
                    .array(
                      z.object({
                        from: z.string().optional(),
                        type: z.string().optional(),
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
                      }),
                    )
                    .optional(),
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
    return NextResponse.json(buildWhatsAppFlowJsonSchema());
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

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  let rawJson: unknown;
  try {
    rawJson = rawBody ? (JSON.parse(rawBody) as unknown) : {};
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsedBody = metaWebhookSchema.safeParse(rawJson);
  if (!parsedBody.success) {
    return NextResponse.json({ received: true, parsed: false });
  }

  const change = parsedBody.data.entry?.[0]?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  if (
    message?.type === 'interactive' &&
    message.interactive?.type === 'nfm_reply' &&
    message.from
  ) {
    try {
      const parsedFlowRaw = JSON.parse(
        message.interactive.nfm_reply?.response_json || '{}',
      ) as unknown;
      const flowPayload = flowPayloadSchema.safeParse(parsedFlowRaw);
      if (!flowPayload.success) {
        return NextResponse.json({ received: true, parsed: false });
      }
      const result = await executeWhatsAppBookingFlow({
        phone: `+${message.from}`,
        clientName:
          flowPayload.data.client_name ||
          change?.contacts?.[0]?.profile?.name ||
          'Clienta WhatsApp',
        serviceId: flowPayload.data.service_id,
        addonIds: flowPayload.data.addon_ids ?? [],
        staffId: flowPayload.data.staff_id ?? null,
        startAt: flowPayload.data.start_at,
      });
      return NextResponse.json({ received: true, result });
    } catch {
      return NextResponse.json({ received: true, parsed: false });
    }
  }

  return NextResponse.json({ received: true });
}
