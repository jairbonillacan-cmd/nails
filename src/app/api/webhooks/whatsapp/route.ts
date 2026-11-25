import { NextRequest, NextResponse } from 'next/server';
import {
  buildWhatsAppFlowJsonSchema,
  executeWhatsAppBookingFlow,
  verifyMetaWebhookSignature,
} from '@/lib/integrations/whatsapp-booking';
import { getSnapshot } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('schema') === '1') {
    return NextResponse.json(buildWhatsAppFlowJsonSchema());
  }

  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || 'nails-demo-verify';
  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Token de verificación inválido' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');
  const isDemoSimulate = request.headers.get('x-nails-demo-simulate') === '1';

  if (!isDemoSimulate && !verifyMetaWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
  }

  const body = JSON.parse(rawBody || '{}');

  if (body.simulate || body.action === 'book') {
    const db = getSnapshot();
    const serviceId = body.serviceId || db.services[0]?.id;
    const result = await executeWhatsAppBookingFlow({
      phone: body.phone || '+525599887766',
      clientName: body.clientName || 'Clienta WhatsApp',
      serviceId,
      addonIds: body.addonIds || [],
      staffId: body.staffId || null,
      startAt: body.startAt || undefined,
    });
    return NextResponse.json(result, { status: result.ok ? 201 : 409 });
  }

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const message = change?.messages?.[0];
  if (message?.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
    try {
      const flowPayload = JSON.parse(message.interactive.nfm_reply.response_json || '{}');
      const result = await executeWhatsAppBookingFlow({
        phone: `+${message.from}`,
        clientName:
          flowPayload.client_name ||
          change?.contacts?.[0]?.profile?.name ||
          'Clienta WhatsApp',
        serviceId: flowPayload.service_id,
        addonIds: flowPayload.addon_ids || [],
        staffId: flowPayload.staff_id || null,
        startAt: flowPayload.start_at,
      });
      return NextResponse.json({ received: true, result });
    } catch {
      return NextResponse.json({ received: true, parsed: false });
    }
  }

  return NextResponse.json({ received: true });
}
