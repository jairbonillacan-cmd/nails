import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as postWhatsAppWebhook } from '@/app/api/webhooks/whatsapp/route';
import {
  verifyMetaWebhookSignature,
  verifyMetaWebhookSignatureAsync,
} from './whatsapp-booking';

const claimedKeys = new Set<string>();
const mockClaimWebhookEventIdempotent = vi.fn(
  async (provider: string, eventId: string): Promise<boolean> => {
    const composite = `${provider}:${eventId}`;
    if (claimedKeys.has(composite)) {
      return false;
    }
    claimedKeys.add(composite);
    return true;
  },
);
const mockIncrementWhatsAppMonthlyUsage = vi.fn(
  async (monthKey?: string, count = 1) => ({
    monthKey: monthKey ?? '2026-11',
    sentCount: count,
    quotaLimit: 500,
    percentUsed: 0,
    alertLevel: 'ok' as const,
    warned80At: null,
    warned100At: null,
  }),
);
const mockCreateBookingAtomic = vi.fn();
const mockQueryAvailability = vi.fn();
const mockUpdateNotificationDeliveryByProviderId = vi.fn(
  async (..._args: unknown[]) => true,
);
const mockConfirmBookingAttendanceFromWebhook = vi.fn(
  async (..._args: unknown[]) => null,
);
const mockRecordWhatsAppMessage = vi.fn(async (input: { phoneE164: string; direction: string; bodyText: string }) => ({
  thread: {
    id: 'wth-mock-1',
    phoneE164: input.phoneE164,
    clientId: null,
    contactName: 'Mock',
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: input.bodyText,
    lastMessageDirection: input.direction,
    lastInboundAt: input.direction === 'inbound' ? new Date().toISOString() : null,
    unreadCount: input.direction === 'inbound' ? 1 : 0,
    lastReadAt: null,
    hasFailedMessages: false,
    isArchived: false,
    assignedStaffId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  message: {
    id: 'wmsg-mock-1',
    threadId: 'wth-mock-1',
    phoneE164: input.phoneE164,
    clientId: null,
    bookingId: null,
    notificationId: null,
    direction: input.direction,
    senderKind: input.direction === 'echo' ? 'coexistence_phone' : 'client',
    senderName: null,
    messageType: 'text',
    bodyText: input.bodyText,
    templateName: null,
    templateTriggerKey: null,
    templateParams: [],
    deliveryStatus: input.direction === 'inbound' ? 'received' : 'sent',
    deliveryMode: input.direction === 'echo' ? 'coexistence' : 'inbound',
    providerMessageId: null,
    errorCode: null,
    errorMessage: null,
    sentAt: null,
    deliveredAt: null,
    readAt: null,
    failedAt: null,
    createdAt: new Date().toISOString(),
  },
}));
const mockUpdateWhatsAppMessageStatusByProviderId = vi.fn(async () => ({
  updated: true,
  message: null,
  threadId: 'wth-mock-1',
}));

vi.mock('../repositories/db', () => ({
  claimWebhookEventIdempotent: (provider: string, eventId: string) =>
    mockClaimWebhookEventIdempotent(provider, eventId),
  incrementWhatsAppMonthlyUsage: (monthKey?: string, count?: number) =>
    mockIncrementWhatsAppMonthlyUsage(monthKey, count),
  updateNotificationDeliveryByProviderId: (...args: unknown[]) =>
    mockUpdateNotificationDeliveryByProviderId(...args),
  recordWhatsAppMessage: (input: { phoneE164: string; direction: string; bodyText: string }) =>
    mockRecordWhatsAppMessage(input),
  updateWhatsAppMessageStatusByProviderId: () =>
    mockUpdateWhatsAppMessageStatusByProviderId(),
  confirmBookingAttendanceFromWebhook: (...args: unknown[]) =>
    mockConfirmBookingAttendanceFromWebhook(...args),
  createBookingAtomic: (...args: unknown[]) => mockCreateBookingAtomic(...args),
  queryAvailability: (...args: unknown[]) => mockQueryAvailability(...args),
  SlotConflictError: class SlotConflictError extends Error {
    suggestedSlots: Array<{ startAt: string; localTime12: string }> = [];
  },
  getRepository: () => ({
    getSnapshot: async () => ({
      settings: {
        name: 'Laikona Nails by Karla',
        timezone: 'America/Mexico_City',
        minCancelHours: 12,
      },
      services: [],
      bookings: [],
      clients: [],
    }),
    queryAvailability: async (...args: unknown[]) => mockQueryAvailability(...args),
  }),
  getSnapshot: () => ({
    settings: {
      name: 'Laikona Nails by Karla',
      timezone: 'America/Mexico_City',
      minCancelHours: 12,
    },
    services: [],
    bookings: [],
    clients: [],
  }),
}));

function signMetaBody(body: string, secret: string): string {
  const hex = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return `sha256=${hex}`;
}

function makeSignedRequest(body: string, secret: string, overrideSignature?: string | null) {
  const headers = new Headers({ 'content-type': 'application/json' });
  const sig =
    overrideSignature === undefined ? signMetaBody(body, secret) : overrideSignature;
  if (sig !== null) {
    headers.set('x-hub-signature-256', sig);
  }
  return new NextRequest('https://laikona.mx/api/webhooks/whatsapp', {
    method: 'POST',
    headers,
    body,
  });
}

afterEach(() => {
  claimedKeys.clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('WhatsApp Coexistence Webhook & Web Crypto HMAC Verification', () => {
  it('verifies Meta HMAC-SHA256 asynchronously via Web Crypto API and fails closed without secret', async () => {
    const body = JSON.stringify({ entry: [{ id: 'waba-1' }] });
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    expect(await verifyMetaWebhookSignatureAsync(body, null)).toBe(false);
    expect(await verifyMetaWebhookSignatureAsync(body, signMetaBody(body, 'any'))).toBe(
      false,
    );

    const secret = 'meta-coexistence-secret-2026';
    vi.stubEnv('WHATSAPP_APP_SECRET', secret);
    const validSig = signMetaBody(body, secret);
    expect(await verifyMetaWebhookSignatureAsync(body, validSig)).toBe(true);
    expect(verifyMetaWebhookSignature(body, validSig)).toBe(true);

    expect(await verifyMetaWebhookSignatureAsync(`${body} `, validSig)).toBe(false);
    expect(
      await verifyMetaWebhookSignatureAsync(
        body,
        'sha256=0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).toBe(false);
    expect(await verifyMetaWebhookSignatureAsync(body, 'sha1=deadbeef')).toBe(false);
  });

  it('rejects unsigned or invalid-signature POST requests with 401', async () => {
    const body = JSON.stringify({ entry: [] });
    vi.stubEnv('WHATSAPP_APP_SECRET', '');
    const noSecretRes = await postWhatsAppWebhook(makeSignedRequest(body, 'ignored'));
    expect(noSecretRes.status).toBe(401);

    vi.stubEnv('WHATSAPP_APP_SECRET', 'real-secret');
    const missingSigRes = await postWhatsAppWebhook(
      makeSignedRequest(body, 'real-secret', null),
    );
    expect(missingSigRes.status).toBe(401);

    const wrongSigRes = await postWhatsAppWebhook(
      makeSignedRequest(body, 'wrong-secret'),
    );
    expect(wrongSigRes.status).toBe(401);
  });

  it('handles statuses idempotently and increments monthly quota once per billable sent message ID', async () => {
    const secret = 'meta-status-secret';
    vi.stubEnv('WHATSAPP_APP_SECRET', secret);

    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  {
                    id: 'wamid.billable-1',
                    status: 'sent',
                    recipient_id: '522221112233',
                    pricing: { billable: true, category: 'utility' },
                  },
                  {
                    id: 'wamid.billable-1',
                    status: 'delivered',
                    recipient_id: '522221112233',
                  },
                  {
                    id: 'wamid.free-window-2',
                    status: 'sent',
                    recipient_id: '522221112233',
                    pricing: { billable: false, category: 'service' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const firstRes = await postWhatsAppWebhook(makeSignedRequest(payload, secret));
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as {
      received: boolean;
      processed: { statuses: number; usageIncremented: number; duplicates: number };
    };
    expect(firstJson.received).toBe(true);
    expect(firstJson.processed.statuses).toBe(3);
    expect(firstJson.processed.usageIncremented).toBe(1);
    expect(mockIncrementWhatsAppMonthlyUsage).toHaveBeenCalledTimes(1);

    const replayRes = await postWhatsAppWebhook(makeSignedRequest(payload, secret));
    expect(replayRes.status).toBe(200);
    const replayJson = (await replayRes.json()) as {
      processed: { statuses: number; usageIncremented: number; duplicates: number };
    };
    expect(replayJson.processed.statuses).toBe(0);
    expect(replayJson.processed.duplicates).toBe(3);
    expect(replayJson.processed.usageIncremented).toBe(0);
    expect(mockIncrementWhatsAppMonthlyUsage).toHaveBeenCalledTimes(1);
  });

  it('handles smb_message_echoes from Karla mobile app idempotently without triggering booking or reply loops', async () => {
    const secret = 'meta-echo-secret';
    vi.stubEnv('WHATSAPP_APP_SECRET', secret);

    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                message_echoes: [
                  {
                    id: 'wamid.echo-karla-1',
                    from: '522213493545',
                    to: '522229998877',
                    timestamp: '1764100000',
                    type: 'text',
                    text: { body: '¡Hola hermosa! Ya quedó confirmada tu cita.' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const firstRes = await postWhatsAppWebhook(makeSignedRequest(payload, secret));
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as {
      received: boolean;
      processed: { echoes: number; messages: number; usageIncremented: number };
    };
    expect(firstJson.received).toBe(true);
    expect(firstJson.processed.echoes).toBe(1);
    expect(firstJson.processed.messages).toBe(0);
    expect(firstJson.processed.usageIncremented).toBe(0);
    expect(mockCreateBookingAtomic).not.toHaveBeenCalled();
    expect(mockIncrementWhatsAppMonthlyUsage).not.toHaveBeenCalled();
    expect(mockRecordWhatsAppMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'echo',
        senderKind: 'coexistence_phone',
        phoneE164: '+522229998877',
      }),
    );

    const dupRes = await postWhatsAppWebhook(makeSignedRequest(payload, secret));
    const dupJson = (await dupRes.json()) as {
      processed: { echoes: number; duplicates: number };
    };
    expect(dupJson.processed.echoes).toBe(0);
    expect(dupJson.processed.duplicates).toBe(1);
  });

  it('deduplicates inbound messages by message.id to prevent duplicate booking flow execution', async () => {
    const secret = 'meta-msg-secret';
    vi.stubEnv('WHATSAPP_APP_SECRET', secret);

    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Valeria' } }],
                messages: [
                  {
                    id: 'wamid.inbound-msg-1',
                    from: '522221234567',
                    type: 'text',
                    text: { body: 'Hola, quiero agendar gelish' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const firstRes = await postWhatsAppWebhook(makeSignedRequest(payload, secret));
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as {
      processed: { messages: number; duplicates: number };
    };
    expect(firstJson.processed.messages).toBe(1);
    expect(firstJson.processed.duplicates).toBe(0);

    const secondRes = await postWhatsAppWebhook(makeSignedRequest(payload, secret));
    const secondJson = (await secondRes.json()) as {
      processed: { messages: number; duplicates: number };
    };
    expect(secondJson.processed.messages).toBe(0);
    expect(secondJson.processed.duplicates).toBe(1);
  });
});
