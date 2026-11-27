import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAdminOverviewPayload } from '@/lib/admin/overview-loader';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
} from '@/lib/auth/admin-session';
import type {
  WhatsAppRemindersResponseDTO,
  WhatsAppSendResponseDTO,
  WhatsAppSettingsResponseDTO,
  WhatsAppSimulateResponseDTO,
  WhatsAppThreadDetailResponseDTO,
  WhatsAppThreadsListResponseDTO,
} from '@/lib/contracts';
import {
  getRepository,
  getSnapshot,
  incrementWhatsAppMonthlyUsage,
  recordWhatsAppMessage,
} from '@/lib/repositories/db';
import { resetRateLimiterForTests } from '@/lib/security/rate-limit';
import { GET as getThreads } from './threads/route';
import { GET as getThreadDetail } from './threads/[threadId]/route';
import { POST as postMarkThreadRead } from './threads/[threadId]/read/route';
import { POST as postSend } from './send/route';
import { POST as postRetryMessage } from './messages/[messageId]/retry/route';
import { GET as getReminders, POST as postReminders } from './reminders/route';
import { GET as getSettings, POST as postSettings } from './settings/route';
import { POST as postSimulate } from './simulate/route';
import { POST as postWhatsAppWebhook } from '@/app/api/webhooks/whatsapp/route';
import { POST as postCronReminders } from '@/app/api/cron/reminders/route';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-wa-api-test-${process.pid}-${crypto.randomUUID()}.json`,
);

let originalDbPathEnv: string | undefined;

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  globalThis.nailsDbPersistedToDisk = undefined;
  globalThis.nailsDemoOutbox = [];
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
  resetRateLimiterForTests();
}

function makeCookieForRole(role: 'owner' | 'admin' | 'specialist'): string {
  const users = {
    owner: { id: 'adm-owner', email: 'duena@nails.studio', role: 'owner' as const },
    admin: { id: 'adm-recepcion', email: 'recepcion@nails.studio', role: 'admin' as const },
    specialist: {
      id: 'adm-camila',
      email: 'camila@nails.studio',
      role: 'specialist' as const,
    },
  };
  const token = createAdminSessionToken(users[role]);
  if (!token) throw new Error('Expected admin session token');
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

function makeAuthedRequest(
  url: string,
  options: {
    method?: 'GET' | 'POST';
    role?: 'owner' | 'admin' | 'specialist' | null;
    body?: unknown;
  } = {},
): NextRequest {
  const headers = new Headers();
  if (options.role) {
    headers.set('cookie', makeCookieForRole(options.role));
  }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  return new NextRequest(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

function signMetaWebhook(body: string, secret: string): NextRequest {
  const hex = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return new NextRequest('https://laikona.mx/api/webhooks/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${hex}`,
    },
    body,
  });
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  resetIsolatedDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  resetIsolatedDb();
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
});

describe('/api/admin/whatsapp/* endpoints, RBAC, 24h window, quota, webhook & simulator', () => {
  it('enforces RBAC (401 unauth, 403 specialist, 200 owner/admin) and Cache-Control: private, no-store', async () => {
    const unauth = await getThreads(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/threads', { role: null }),
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('cache-control')).toBe('private, no-store');

    const specialistChecks = await Promise.all([
      getThreads(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/threads', {
          role: 'specialist',
        }),
      ),
      getThreadDetail(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/threads/wth-sofia', {
          role: 'specialist',
        }),
        { params: Promise.resolve({ threadId: 'wth-sofia' }) },
      ),
      postMarkThreadRead(
        makeAuthedRequest(
          'https://laikona.mx/api/admin/whatsapp/threads/wth-sofia/read',
          { method: 'POST', role: 'specialist' },
        ),
        { params: Promise.resolve({ threadId: 'wth-sofia' }) },
      ),
      postSend(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/send', {
          method: 'POST',
          role: 'specialist',
          body: { mode: 'text', threadId: 'wth-sofia', bodyText: 'Hola' },
        }),
      ),
      postRetryMessage(
        makeAuthedRequest(
          'https://laikona.mx/api/admin/whatsapp/messages/wmsg-andrea-3/retry',
          { method: 'POST', role: 'specialist' },
        ),
        { params: Promise.resolve({ messageId: 'wmsg-andrea-3' }) },
      ),
      getReminders(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/reminders', {
          role: 'specialist',
        }),
      ),
      getSettings(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/settings', {
          role: 'specialist',
        }),
      ),
      postSimulate(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/simulate', {
          method: 'POST',
          role: 'specialist',
          body: { event: 'inbound_text', phone: '+522224123987', bodyText: 'Hola' },
        }),
      ),
    ]);

    for (const res of specialistChecks) {
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    }

    const adminThreadsRes = await getThreads(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/threads', {
        role: 'admin',
      }),
    );
    expect(adminThreadsRes.status).toBe(200);
    expect(adminThreadsRes.headers.get('cache-control')).toBe('private, no-store');

    const adminForbiddenOwnerActions = await Promise.all([
      postReminders(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/reminders', {
          method: 'POST',
          role: 'admin',
          body: {
            action: 'update_workflow',
            workflowId: 'wf-24h',
            patch: { offsetMinutes: 1440 },
          },
        }),
      ),
      postReminders(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/reminders', {
          method: 'POST',
          role: 'admin',
          body: { action: 'run_due_now' },
        }),
      ),
      postSettings(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/settings', {
          method: 'POST',
          role: 'admin',
          body: {
            action: 'update_settings',
            patch: { whatsappMonthlyQuota: 750 },
          },
        }),
      ),
      postSettings(
        makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/settings', {
          method: 'POST',
          role: 'admin',
          body: { action: 'sync_meta_templates' },
        }),
      ),
    ]);

    for (const res of adminForbiddenOwnerActions) {
      expect(res.status).toBe(403);
    }
  });

  it('hydrates whatsappInboxSummary in AdminOverviewPayload for owner/admin and omits it for specialist', async () => {
    const db = getSnapshot();
    const ownerUser = db.adminUsers.find((u) => u.role === 'owner');
    const specialistUser = db.adminUsers.find((u) => u.role === 'specialist');
    if (!ownerUser || !specialistUser) throw new Error('Expected seeded admin users');

    const ownerOverview = await buildAdminOverviewPayload({
      user: ownerUser,
      isDemo: true,
    });
    expect(ownerOverview.whatsappInboxSummary).toBeDefined();
    expect(ownerOverview.whatsappInboxSummary?.totalThreads).toBe(5);
    expect(ownerOverview.whatsappInboxSummary?.unreadCount).toBe(1);

    const specialistOverview = await buildAdminOverviewPayload({
      user: specialistUser,
      isDemo: true,
    });
    expect(specialistOverview.whatsappInboxSummary).toBeUndefined();
  });

  it('lists threads with filters, returns full thread detail, and marks threads read', async () => {
    const listRes = await getThreads(
      makeAuthedRequest(
        'https://laikona.mx/api/admin/whatsapp/threads?filter=unread&q=Sof%C3%ADa',
        { role: 'owner' },
      ),
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as WhatsAppThreadsListResponseDTO;
    expect(listData.threads).toHaveLength(1);
    expect(listData.threads[0]?.id).toBe('wth-sofia');
    expect(listData.summary.unreadCount).toBe(1);

    const detailRes = await getThreadDetail(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/threads/wth-sofia', {
        role: 'owner',
      }),
      { params: Promise.resolve({ threadId: 'wth-sofia' }) },
    );
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as WhatsAppThreadDetailResponseDTO;
    expect(detail.thread.serviceWindow.isOpen).toBe(true);
    expect(detail.messages.length).toBeGreaterThanOrEqual(3);
    expect(detail.templateCatalog).toHaveLength(9);
    expect(detail.quickReplies.length).toBeGreaterThanOrEqual(3);
    expect(detail.waMeUrl).toContain('https://wa.me/522224123987');

    const readRes = await postMarkThreadRead(
      makeAuthedRequest(
        'https://laikona.mx/api/admin/whatsapp/threads/wth-sofia/read',
        { method: 'POST', role: 'admin' },
      ),
      { params: Promise.resolve({ threadId: 'wth-sofia' }) },
    );
    expect(readRes.status).toBe(200);
    const readJson = (await readRes.json()) as {
      ok: boolean;
      summary: { unreadCount: number };
    };
    expect(readJson.ok).toBe(true);
    expect(readJson.summary.unreadCount).toBe(0);
  });

  it('enforces 24h Meta window (422 WINDOW_CLOSED), template param counts (400), and 500/mo quota (429 QUOTA_EXCEEDED)', async () => {
    const initialQuota = await getRepository().getWhatsAppMonthlyUsage();

    const closedTextRes = await postSend(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/send', {
        method: 'POST',
        role: 'owner',
        body: {
          mode: 'text',
          threadId: 'wth-andrea',
          bodyText: 'Hola Andrea, texto libre fuera de ventana',
        },
      }),
    );
    expect(closedTextRes.status).toBe(422);
    const closedJson = (await closedTextRes.json()) as {
      code: string;
      fallbackWaMeUrl: string;
    };
    expect(closedJson.code).toBe('WINDOW_CLOSED');
    expect(closedJson.fallbackWaMeUrl).toContain('https://wa.me/522228765112');

    const openTextRes = await postSend(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/send', {
        method: 'POST',
        role: 'admin',
        body: {
          mode: 'text',
          threadId: 'wth-sofia',
          bodyText: '¡Claro Sofía! Trae tu foto de referencia sin problema.',
        },
      }),
    );
    expect(openTextRes.status).toBe(200);
    const openJson = (await openTextRes.json()) as WhatsAppSendResponseDTO;
    expect(openJson.ok).toBe(true);
    expect(openJson.message.direction).toBe('outbound');
    expect(openJson.message.senderKind).toBe('staff');
    expect(openJson.quota.sentCount).toBe(initialQuota.sentCount);

    const badParamsRes = await postSend(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/send', {
        method: 'POST',
        role: 'owner',
        body: {
          mode: 'template',
          threadId: 'wth-andrea',
          triggerKey: 'reminder_2h',
          parameters: ['SoloUno'],
        },
      }),
    );
    expect(badParamsRes.status).toBe(400);

    const validTplRes = await postSend(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/send', {
        method: 'POST',
        role: 'owner',
        body: {
          mode: 'template',
          threadId: 'wth-andrea',
          triggerKey: 'reminder_2h',
          parameters: ['Andrea', '11:00 a.m.', 'Calle 25 Sur 1904, Puebla'],
        },
      }),
    );
    expect(validTplRes.status).toBe(200);
    const tplJson = (await validTplRes.json()) as WhatsAppSendResponseDTO;
    expect(tplJson.ok).toBe(true);
    expect(tplJson.message.messageType).toBe('template');
    expect(tplJson.quota.sentCount).toBe(initialQuota.sentCount + 1);

    await incrementWhatsAppMonthlyUsage(
      undefined,
      initialQuota.quotaLimit - tplJson.quota.sentCount,
    );
    const quotaBlockedRes = await postSend(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/send', {
        method: 'POST',
        role: 'owner',
        body: {
          mode: 'template',
          threadId: 'wth-andrea',
          triggerKey: 'reminder_2h',
          parameters: ['Andrea', '11:00 a.m.', 'Calle 25 Sur 1904, Puebla'],
        },
      }),
    );
    expect(quotaBlockedRes.status).toBe(429);
    const quotaJson = (await quotaBlockedRes.json()) as {
      code: string;
      fallbackWaMeUrl: string;
    };
    expect(quotaJson.code).toBe('QUOTA_EXCEEDED');
    expect(quotaJson.fallbackWaMeUrl).toContain('https://wa.me/522228765112');
  });

  it('retries failed outbound messages while re-validating 24h window & quota and clears thread failure state', async () => {
    const failedTemplate = await recordWhatsAppMessage({
      phoneE164: '+522229991122',
      contactName: 'Clienta Reintento',
      direction: 'outbound',
      senderKind: 'automation',
      messageType: 'template',
      bodyText: 'Recordatorio reintentable',
      templateName: 'laikona_recordatorio_24h',
      templateTriggerKey: 'reminder_24h',
      templateParams: ['Andrea', 'Acrílicas', '11:00 a.m.', 'Paty', 'https://laikona.mx/cita/x'],
      deliveryStatus: 'failed',
      deliveryMode: 'template',
      errorCode: '131026',
      errorMessage: 'Undeliverable',
    });
    expect(failedTemplate.thread.hasFailedMessages).toBe(true);

    const retryRes = await postRetryMessage(
      makeAuthedRequest(
        `https://laikona.mx/api/admin/whatsapp/messages/${failedTemplate.message.id}/retry`,
        { method: 'POST', role: 'admin' },
      ),
      { params: Promise.resolve({ messageId: failedTemplate.message.id }) },
    );
    expect(retryRes.status).toBe(200);
    const retryJson = (await retryRes.json()) as WhatsAppSendResponseDTO;
    expect(retryJson.ok).toBe(true);
    expect(retryJson.message.id).toBe(failedTemplate.message.id);
    expect(retryJson.message.deliveryStatus).toBe('sent');
    expect(retryJson.message.errorCode).toBeNull();
    expect(retryJson.message.errorMessage).toBeNull();
    expect(retryJson.thread.hasFailedMessages).toBe(false);

    const failedListRes = await getThreads(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/threads?filter=failed', {
        role: 'admin',
      }),
    );
    expect(failedListRes.status).toBe(200);
    const failedList = (await failedListRes.json()) as WhatsAppThreadsListResponseDTO;
    expect(failedList.threads.some((t) => t.id === failedTemplate.thread.id)).toBe(false);

    const failedFreeTextClosed = await recordWhatsAppMessage({
      phoneE164: '+522228765112',
      direction: 'outbound',
      senderKind: 'staff',
      messageType: 'text',
      bodyText: 'Mensaje de texto que falló',
      deliveryStatus: 'failed',
      deliveryMode: 'text',
      errorMessage: 'Timeout',
    });

    const closedRetry = await postRetryMessage(
      makeAuthedRequest(
        `https://laikona.mx/api/admin/whatsapp/messages/${failedFreeTextClosed.message.id}/retry`,
        { method: 'POST', role: 'owner' },
      ),
      { params: Promise.resolve({ messageId: failedFreeTextClosed.message.id }) },
    );
    expect(closedRetry.status).toBe(422);
  });

  it('serves reminders hub, runs workflow/queue actions, and drains stale outbox events in cron', async () => {
    const getRes = await getReminders(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/reminders', {
        role: 'owner',
      }),
    );
    expect(getRes.status).toBe(200);
    const data = (await getRes.json()) as WhatsAppRemindersResponseDTO;
    expect(data.workflows).toHaveLength(8);
    expect(data.queue.length).toBeGreaterThanOrEqual(1);
    expect(data.history.length).toBeGreaterThanOrEqual(1);
    expect(data.metrics.failedCount).toBeGreaterThanOrEqual(1);

    const toggleRes = await postReminders(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/reminders', {
        method: 'POST',
        role: 'admin',
        body: {
          action: 'toggle_workflow',
          workflowId: 'wf-post-visit',
          isEnabled: true,
        },
      }),
    );
    expect(toggleRes.status).toBe(200);

    const retryNotifRes = await postReminders(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/reminders', {
        method: 'POST',
        role: 'admin',
        body: { action: 'retry_notification', notificationId: 'ntf-5' },
      }),
    );
    expect(retryNotifRes.status).toBe(200);

    const repo = getRepository();
    await repo.enqueueOutboxEvent(
      'Notify',
      { test: true },
      new Date(Date.now() - 10 * 60_000).toISOString(),
    );
    await repo.dequeueOutboxEvents(5, Date.now());

    vi.stubEnv('CRON_SECRET', 'cron-test-secret-123');
    const cronRes = await postCronReminders(
      new NextRequest('https://laikona.mx/api/cron/reminders', {
        method: 'POST',
        headers: { authorization: 'Bearer cron-test-secret-123' },
      }),
    );
    expect(cronRes.status).toBe(200);
    const cronJson = (await cronRes.json()) as {
      sentCount: number;
      drainedOutboxCount: number;
    };
    expect(cronJson.sentCount).toBeGreaterThanOrEqual(1);
    expect(cronJson.drainedOutboxCount).toBe(1);
  });

  it('serves sanitized settings with zero secret leaks and persists owner updates', async () => {
    vi.stubEnv('WHATSAPP_ACCESS_TOKEN', 'super-secret-meta-token-xyz');
    vi.stubEnv('WHATSAPP_APP_SECRET', 'super-secret-app-secret-abc');
    vi.stubEnv('WHATSAPP_VERIFY_TOKEN', 'super-secret-verify-token-999');

    const settingsRes = await getSettings(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/settings', {
        role: 'admin',
      }),
    );
    expect(settingsRes.status).toBe(200);
    const rawText = await settingsRes.text();
    expect(rawText).not.toContain('super-secret-meta-token-xyz');
    expect(rawText).not.toContain('super-secret-app-secret-abc');
    expect(rawText).not.toContain('super-secret-verify-token-999');
    expect(rawText).not.toContain('ownerPinHash');

    const settingsJson = JSON.parse(rawText) as WhatsAppSettingsResponseDTO;
    expect(settingsJson.templates).toHaveLength(9);
    expect(settingsJson.templateCatalog).toHaveLength(9);
    expect(settingsJson.simulatorAllowed).toBe(true);

    const updateRes = await postSettings(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/settings', {
        method: 'POST',
        role: 'owner',
        body: {
          action: 'update_settings',
          patch: { whatsappMonthlyQuota: 800, whatsappBookingEnabled: false },
        },
      }),
    );
    expect(updateRes.status).toBe(200);
    const updated = getSnapshot().settings;
    expect(updated.whatsappMonthlyQuota).toBe(800);
    expect(updated.whatsappBookingEnabled).toBe(false);
  });

  it('processes HMAC webhook cancel intent safely without auto-canceling booking and records Coexistence echo without unread bump', async () => {
    const secret = 'webhook-cancel-safety-secret';
    vi.stubEnv('WHATSAPP_APP_SECRET', secret);

    const cancelPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Sofía Ramírez' } }],
                messages: [
                  {
                    id: 'wamid.cancel.sofia.1',
                    from: '5212224123987',
                    type: 'text',
                    text: { body: 'CANCELAR' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const cancelRes = await postWhatsAppWebhook(signMetaWebhook(cancelPayload, secret));
    expect(cancelRes.status).toBe(200);

    const sofiaBooking = getSnapshot().bookings.find((b) => b.id === 'bk-1001');
    expect(sofiaBooking?.status).toBe('confirmed');

    const sofiaDetail = await getRepository().getWhatsAppThreadDetail({
      threadId: 'wth-sofia',
    });
    const lastReply = sofiaDetail?.messages.at(-1);
    expect(lastReply?.direction).toBe('outbound');
    expect(lastReply?.bodyText).toContain('?action=cancel');

    const echoPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'smb_message_echoes',
              value: {
                message_echoes: [
                  {
                    id: 'wamid.echo.valeria.1',
                    from: '522221234567',
                    to: '522227774321',
                    type: 'text',
                    text: { body: 'Hola Vale, te mando los diseños por acá.' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const echoRes = await postWhatsAppWebhook(signMetaWebhook(echoPayload, secret));
    expect(echoRes.status).toBe(200);
    const valeriaDetail = await getRepository().getWhatsAppThreadDetail({
      phoneE164: '+522227774321',
    });
    expect(valeriaDetail?.thread.unreadCount).toBe(0);
    expect(valeriaDetail?.thread.serviceWindow.isOpen).toBe(false);
    expect(valeriaDetail?.messages.some((m) => m.direction === 'echo')).toBe(true);
  });

  it('runs simulator scenarios end-to-end and enforces production disabled gate', async () => {
    const confirmSim = await postSimulate(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/simulate', {
        method: 'POST',
        role: 'admin',
        body: {
          event: 'inbound_text',
          phone: '+522224123987',
          clientName: 'Sofía Ramírez',
          bodyText: 'CONFIRMO',
        },
      }),
    );
    expect(confirmSim.status).toBe(200);
    const confirmData = (await confirmSim.json()) as WhatsAppSimulateResponseDTO;
    expect(confirmData.ok).toBe(true);
    expect(confirmData.processed.attendanceConfirmed).toBe(1);
    expect(confirmData.bookingCode).toBe('NL-1042');
    expect(confirmData.replyText).toContain('Confirmamos tu asistencia');

    const echoSim = await postSimulate(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/simulate', {
        method: 'POST',
        role: 'owner',
        body: {
          event: 'coexistence_echo',
          phone: '+522223987441',
          bodyText: 'Te esperamos puntualmente mañana',
        },
      }),
    );
    expect(echoSim.status).toBe(200);
    const echoData = (await echoSim.json()) as WhatsAppSimulateResponseDTO;
    expect(echoData.processed.echoes).toBe(1);

    const statusSim = await postSimulate(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/simulate', {
        method: 'POST',
        role: 'owner',
        body: {
          event: 'delivery_status',
          providerMessageId: 'demo-wamid-sofia-24h',
          status: 'read',
        },
      }),
    );
    expect(statusSim.status).toBe(200);
    const statusData = (await statusSim.json()) as WhatsAppSimulateResponseDTO;
    expect(statusData.processed.statuses).toBe(1);

    vi.stubEnv('WHATSAPP_SIMULATOR_ENABLED', 'false');

    const prodBlocked = await postSimulate(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/simulate', {
        method: 'POST',
        role: 'owner',
        body: {
          event: 'inbound_text',
          phone: '+522224123987',
          bodyText: 'Hola',
        },
      }),
    );
    expect(prodBlocked.status).toBe(403);
    const prodJson = (await prodBlocked.json()) as { code: string };
    expect(prodJson.code).toBe('SIMULATOR_DISABLED');

    const disabledSettingsRes = await getSettings(
      makeAuthedRequest('https://laikona.mx/api/admin/whatsapp/settings', {
        role: 'owner',
      }),
    );
    const disabledSettings =
      (await disabledSettingsRes.json()) as WhatsAppSettingsResponseDTO;
    expect(disabledSettings.simulatorAllowed).toBe(false);
  });
});
