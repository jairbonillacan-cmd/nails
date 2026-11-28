import { Buffer } from 'node:buffer';
import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual } from '@/lib/auth/admin-session';
import {
  buildWhatsAppFlowJsonSchema,
  verifyMetaWebhookSignatureAsync,
} from '@/lib/integrations/whatsapp-booking';
import { processWhatsAppWebhookPayload } from '@/lib/integrations/whatsapp-processor';
import { logWarn } from '@/lib/logger';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export async function GET(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:whatsapp-webhook-get',
    key: getRequestIp(request),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiadas solicitudes.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('schema') === '1') {
    return NextResponse.json(await buildWhatsAppFlowJsonSchema(), {
      headers: { 'X-RateLimit-Remaining': String(rate.remaining) },
    });
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
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const declaredBytes = Number(contentLengthHeader);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_WEBHOOK_BODY_BYTES) {
      logWarn('webhook_whatsapp_payload_too_large', { declaredBytes });
      return NextResponse.json({ error: 'Payload demasiado grande' }, { status: 413 });
    }
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
    logWarn('webhook_whatsapp_payload_too_large', {
      actualBytes: Buffer.byteLength(rawBody, 'utf8'),
    });
    return NextResponse.json({ error: 'Payload demasiado grande' }, { status: 413 });
  }

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

  const summary = await processWhatsAppWebhookPayload(rawJson, {
    source: 'webhook',
  });

  if (!summary.parsed) {
    return NextResponse.json({ received: true, parsed: false });
  }

  return NextResponse.json({
    received: true,
    ...(summary.flowResult ? { result: summary.flowResult } : {}),
    processed: {
      messages: summary.processedMessages,
      statuses: summary.processedStatuses,
      echoes: summary.processedEchoes,
      duplicates: summary.duplicatesSkipped,
      usageIncremented: summary.usageIncremented,
      attendanceConfirmed: summary.attendanceConfirmed,
    },
  });
}
