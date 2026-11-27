import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  WhatsAppRemindersActionSchema,
  WhatsAppSendMessageSchema,
  WhatsAppSettingsActionSchema,
  WhatsAppSimulateEventSchema,
} from '../contracts';
import { createInitialDemoDatabase } from '../demo-seed';
import { parseDemoDatabase } from './schema';
import {
  cancelScheduledNotification,
  drainStaleOutboxEvents,
  getOutboxSummary,
  getRepository,
  getScheduledNotificationById,
  getSnapshot,
  getWhatsAppMessageById,
  getWhatsAppThreadDetail,
  getWhatsAppThreadWindow,
  getWhatsAppUnreadSummary,
  listScheduledNotifications,
  listWhatsAppThreads,
  markWhatsAppThreadRead,
  processDueScheduledNotifications,
  recordWhatsAppMessage,
  retryScheduledNotification,
  updateNotificationWorkflow,
  updateScheduledNotificationStatus,
  updateWhatsAppMessageStatusByProviderId,
} from './db';

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-wa-repo-test-${process.pid}-${crypto.randomUUID()}.json`,
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
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  resetIsolatedDb();
});

beforeEach(() => {
  resetIsolatedDb();
});

afterAll(() => {
  resetIsolatedDb();
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
});

describe('whatsapp & reminders demo repository', () => {
  it('seeds realistic Spanish threads, messages, workflows, and parses cleanly', async () => {
    const seeded = createInitialDemoDatabase();
    const parsed = parseDemoDatabase(seeded);
    expect(parsed.workflows).toHaveLength(8);
    expect(parsed.whatsappThreads).toHaveLength(5);
    expect(parsed.whatsappMessages).toHaveLength(11);

    const { threads, summary } = await listWhatsAppThreads();
    expect(threads).toHaveLength(5);
    expect(summary.totalThreads).toBe(5);
    expect(summary.unreadCount).toBe(1);
    expect(summary.failedCount).toBeGreaterThanOrEqual(1);
    expect(summary.failedRemindersCount).toBeGreaterThanOrEqual(1);
    expect(summary.pendingRemindersCount).toBeGreaterThanOrEqual(1);
    expect(summary.windowOpenCount).toBeGreaterThanOrEqual(2);
  });

  it('maintains backward compatibility with legacy demo JSON lacking whatsappThreads/Messages', () => {
    const seeded = createInitialDemoDatabase();
    const legacyPayload = {
      ...seeded,
      notifications: seeded.notifications.map((n) => ({
        id: n.id,
        bookingId: n.bookingId,
        workflowId: n.workflowId,
        channel: n.channel,
        recipient: n.recipient,
        scheduledFor: n.scheduledFor,
        status: n.status,
        subject: n.subject,
        previewText: n.previewText,
        providerMessageId: n.providerMessageId,
        errorMessage: n.errorMessage,
        sentAt: n.sentAt,
        createdAt: n.createdAt,
      })),
    };
    delete legacyPayload.whatsappThreads;
    delete legacyPayload.whatsappMessages;

    const parsed = parseDemoDatabase(legacyPayload);
    expect(parsed.whatsappThreads).toEqual([]);
    expect(parsed.whatsappMessages).toEqual([]);
    expect(parsed.notifications.length).toBeGreaterThan(0);
  });

  it('deduplicates MX 521/52 phone variants into one thread and deduplicates providerMessageId', async () => {
    const first = await recordWhatsAppMessage({
      phoneE164: '5215599887766',
      contactName: 'Camila Vega',
      direction: 'inbound',
      senderKind: 'client',
      bodyText: 'Hola, quiero información de rubber',
      deliveryStatus: 'received',
      deliveryMode: 'inbound',
      providerMessageId: 'wamid.test.dup.1',
    });

    expect(first.thread.phoneE164).toBe('+525599887766');
    expect(first.thread.unreadCount).toBe(1);

    const duplicate = await recordWhatsAppMessage({
      phoneE164: '+52 55 9988 7766',
      direction: 'inbound',
      senderKind: 'client',
      bodyText: 'Hola, quiero información de rubber',
      deliveryStatus: 'received',
      deliveryMode: 'inbound',
      providerMessageId: 'wamid.test.dup.1',
    });

    expect(duplicate.message.id).toBe(first.message.id);
    expect(duplicate.thread.unreadCount).toBe(1);

    const second = await recordWhatsAppMessage({
      phoneE164: '5599887766',
      direction: 'outbound',
      senderKind: 'staff',
      senderName: 'Karla',
      bodyText: '¡Claro Camila! Te paso horarios.',
      deliveryStatus: 'sent',
      deliveryMode: 'text',
      providerMessageId: 'wamid.test.out.2',
    });

    expect(second.thread.id).toBe(first.thread.id);
    expect(second.thread.phoneE164).toBe('+525599887766');
    expect(second.thread.unreadCount).toBe(1);

    const detail = await getWhatsAppThreadDetail({ phoneE164: '5215599887766' });
    expect(detail?.thread.id).toBe(first.thread.id);
    expect(detail?.messages).toHaveLength(2);
    expect(detail?.thread.serviceWindow.isOpen).toBe(true);
  });

  it('keeps Coexistence echoes out of unreadCount and does not open the 24h service window', async () => {
    const echo = await recordWhatsAppMessage({
      phoneE164: '+525577665544',
      contactName: 'Daniela Cruz',
      direction: 'echo',
      senderKind: 'coexistence_phone',
      senderName: 'WhatsApp Business',
      bodyText: 'Hola Dani, te mandé las opciones por aquí.',
      deliveryStatus: 'sent',
      deliveryMode: 'coexistence',
      providerMessageId: 'wamid.test.echo.1',
    });

    expect(echo.thread.unreadCount).toBe(0);
    expect(echo.thread.lastInboundAt).toBeNull();

    const window = await getWhatsAppThreadWindow({ threadId: echo.thread.id });
    expect(window.isOpen).toBe(false);
    expect(window.remainingMinutes).toBe(0);
  });

  it('marks thread read and updates unread summary cleanly', async () => {
    const before = await getWhatsAppUnreadSummary();
    expect(before.unreadCount).toBe(1);

    const marked = await markWhatsAppThreadRead('wth-sofia');
    expect(marked?.unreadCount).toBe(0);
    expect(marked?.lastReadAt).toBeTruthy();

    const after = await getWhatsAppUnreadSummary();
    expect(after.unreadCount).toBe(0);
  });

  it('enforces monotonic delivery statuses and heals thread hasFailedMessages', async () => {
    const created = await recordWhatsAppMessage({
      phoneE164: '+525511002233',
      contactName: 'Fernanda Ruiz',
      direction: 'outbound',
      senderKind: 'automation',
      bodyText: 'Recordatorio de prueba',
      deliveryStatus: 'queued',
      deliveryMode: 'template',
      providerMessageId: 'wamid.mono.1',
    });

    const sent = await updateWhatsAppMessageStatusByProviderId({
      providerMessageId: 'wamid.mono.1',
      status: 'sent',
    });
    expect(sent.updated).toBe(true);
    expect(sent.message?.deliveryStatus).toBe('sent');

    const failed = await updateWhatsAppMessageStatusByProviderId({
      providerMessageId: 'wamid.mono.1',
      status: 'failed',
      errorCode: '131026',
      errorMessage: 'Undeliverable',
    });
    expect(failed.updated).toBe(true);
    expect(failed.message?.deliveryStatus).toBe('failed');

    const failedDetail = await getWhatsAppThreadDetail({ threadId: created.thread.id });
    expect(failedDetail?.thread.hasFailedMessages).toBe(true);

    const healed = await updateWhatsAppMessageStatusByProviderId({
      providerMessageId: 'wamid.mono.1',
      status: 'delivered',
    });
    expect(healed.updated).toBe(true);
    expect(healed.message?.deliveryStatus).toBe('delivered');
    expect(healed.message?.errorCode).toBeNull();

    const healedDetail = await getWhatsAppThreadDetail({ threadId: created.thread.id });
    expect(healedDetail?.thread.hasFailedMessages).toBe(false);

    const read = await updateWhatsAppMessageStatusByProviderId({
      providerMessageId: 'wamid.mono.1',
      status: 'read',
    });
    expect(read.updated).toBe(true);
    expect(read.message?.deliveryStatus).toBe('read');

    const staleSent = await updateWhatsAppMessageStatusByProviderId({
      providerMessageId: 'wamid.mono.1',
      status: 'sent',
    });
    expect(staleSent.updated).toBe(false);
    expect(staleSent.message?.deliveryStatus).toBe('read');

    const staleFail = await updateWhatsAppMessageStatusByProviderId({
      providerMessageId: 'wamid.mono.1',
      status: 'failed',
    });
    expect(staleFail.updated).toBe(false);
    expect(staleFail.message?.deliveryStatus).toBe('read');

    const fetched = await getWhatsAppMessageById(created.message.id);
    expect(fetched?.deliveryStatus).toBe('read');
  });

  it('scopes threads and scheduled notifications for specialist RBAC', async () => {
    const ownerList = await listWhatsAppThreads({ role: 'owner' });
    expect(ownerList.threads).toHaveLength(5);

    const specialistList = await listWhatsAppThreads({
      role: 'specialist',
      staffMemberId: 'staff-tere',
    });
    expect(specialistList.threads.length).toBeGreaterThan(0);
    expect(specialistList.threads.length).toBeLessThan(ownerList.threads.length);
    expect(specialistList.threads.some((t) => t.id === 'wth-sofia')).toBe(false);

    const deniedDetail = await getWhatsAppThreadDetail({
      threadId: 'wth-sofia',
      role: 'specialist',
      staffMemberId: 'staff-tere',
    });
    expect(deniedDetail).toBeNull();

    const allowedReminders = await listScheduledNotifications({
      role: 'specialist',
      staffMemberId: 'staff-karla',
    });
    expect(allowedReminders.length).toBeGreaterThan(0);
    expect(allowedReminders.every((r) => r.staffName === 'Karla')).toBe(true);
  });

  it('supports retry, cancel, status patch, workflow update, and automatic retry backoff in cron', async () => {
    const failedNotif = await getScheduledNotificationById('ntf-5');
    expect(failedNotif?.status).toBe('failed');

    const retried = await retryScheduledNotification('ntf-5', '2026-11-27T10:00:00.000Z');
    expect(retried.status).toBe('pending');
    expect(retried.deliveryStatus).toBe('queued');
    expect(retried.errorMessage).toBeNull();
    expect(retried.nextRetryAt).toBeNull();

    const canceled = await cancelScheduledNotification('ntf-4', 'manual_admin_cancel');
    expect(canceled.status).toBe('canceled');
    expect(canceled.errorMessage).toBe('manual_admin_cancel');

    const patched = await updateScheduledNotificationStatus('ntf-6', {
      status: 'sent',
      deliveryStatus: 'read',
      errorMessage: null,
    });
    expect(patched?.deliveryStatus).toBe('read');

    const updatedWf = await updateNotificationWorkflow('wf-post-visit', {
      isEnabled: true,
    });
    expect(updatedWf.isEnabled).toBe(true);

    const nowMs = Date.parse('2026-11-27T12:00:00.000Z');
    await updateScheduledNotificationStatus('ntf-5', {
      status: 'pending',
      deliveryStatus: 'queued',
      attempts: 0,
      nextRetryAt: null,
      errorMessage: null,
    });

    const firstPass = await processDueScheduledNotifications(async () => ({
      status: 'failed',
      providerMessageId: null,
      errorMessage: 'Meta timeout',
    }), nowMs);
    expect(firstPass.failedCount).toBe(1);

    const afterFail = await getScheduledNotificationById('ntf-5');
    expect(afterFail?.attempts).toBe(1);
    expect(afterFail?.nextRetryAt).toBe('2026-11-27T12:05:00.000Z');

    const beforeBackoff = await processDueScheduledNotifications(async () => ({
      status: 'sent',
      providerMessageId: 'wamid.should-not-run',
      errorMessage: null,
    }), nowMs + 60_000);
    expect(beforeBackoff.processed).toBe(0);

    const atBackoff = await processDueScheduledNotifications(async () => ({
      status: 'sent',
      providerMessageId: 'wamid.retry.ok',
      errorMessage: null,
    }), nowMs + 5 * 60_000);
    expect(atBackoff.sentCount).toBe(1);
    expect(atBackoff.retriedCount).toBe(1);

    const recovered = await getScheduledNotificationById('ntf-5');
    expect(recovered?.status).toBe('sent');
    expect(recovered?.deliveryStatus).toBe('sent');
    expect(recovered?.attempts).toBe(2);
    expect(recovered?.nextRetryAt).toBeNull();
  });

  it('tracks outbox summary and drains stale processing events', async () => {
    const repo = getRepository();
    const baseMs = Date.parse('2026-11-27T12:00:00.000Z');
    await repo.enqueueOutboxEvent(
      'Notify',
      { id: 1 },
      new Date(baseMs - 10 * 60_000).toISOString(),
    );
    await repo.enqueueOutboxEvent(
      'Notify',
      { id: 2 },
      new Date(baseMs - 60_000).toISOString(),
    );
    const claimed = await repo.dequeueOutboxEvents(10, baseMs);
    expect(claimed).toHaveLength(2);

    const beforeSummary = await getOutboxSummary();
    expect(beforeSummary.processingCount).toBe(2);

    const drained = await drainStaleOutboxEvents(5 * 60_000, baseMs);
    expect(drained.drainedCount).toBe(1);

    const afterSummary = await getOutboxSummary();
    expect(afterSummary.processingCount).toBe(1);
    expect(afterSummary.pendingCount).toBe(1);
  });

  it('validates shared WhatsApp Zod request contracts', () => {
    expect(
      WhatsAppSendMessageSchema.safeParse({
        mode: 'text',
        phoneE164: '+525511223344',
        bodyText: 'Hola Sofía',
      }).success,
    ).toBe(true);

    expect(
      WhatsAppSendMessageSchema.safeParse({
        mode: 'text',
        bodyText: 'Sin destinatario',
      }).success,
    ).toBe(false);

    expect(
      WhatsAppRemindersActionSchema.safeParse({
        action: 'retry_notification',
        notificationId: 'ntf-5',
      }).success,
    ).toBe(true);

    expect(
      WhatsAppSimulateEventSchema.safeParse({
        event: 'delivery_status',
        providerMessageId: 'wamid.1',
        status: 'delivered',
      }).success,
    ).toBe(true);

    expect(
      WhatsAppSettingsActionSchema.safeParse({
        action: 'update_settings',
        patch: { whatsappMonthlyQuota: 1000 },
      }).success,
    ).toBe(true);

    const snap = getSnapshot();
    expect(snap.whatsappThreads?.length).toBeGreaterThan(0);
  });

  it('runs processDueScheduledNotifications dispatcher outside withWriteLock without deadlocking on usage/message writes', async () => {
    const repo = getRepository();
    const nowMs = Date.now() + 2 * 3600_000;
    const dispatchedIds: string[] = [];

    const summary = await processDueScheduledNotifications(async ({ notification, booking }) => {
      dispatchedIds.push(notification.id);
      const claimed = await repo.claimWebhookEventIdempotent(
        'whatsapp_usage',
        `wamid.locktest.${notification.id}`,
      );
      if (claimed) {
        await repo.incrementWhatsAppMonthlyUsage('2026-11', 1);
      }
      await recordWhatsAppMessage({
        phoneE164: booking.client.phoneE164,
        clientId: booking.clientId,
        bookingId: booking.id,
        notificationId: notification.id,
        direction: 'outbound',
        senderKind: 'automation',
        messageType: 'template',
        bodyText: notification.bodyText || notification.previewText,
        deliveryStatus: 'sent',
        deliveryMode: 'template',
        providerMessageId: `wamid.locktest.${notification.id}`,
      });
      return {
        status: 'sent',
        providerMessageId: `wamid.locktest.${notification.id}`,
        errorMessage: null,
      };
    }, nowMs);

    expect(summary.sentCount).toBeGreaterThanOrEqual(1);
    expect(dispatchedIds.length).toBeGreaterThanOrEqual(1);
    const updated = await getScheduledNotificationById(dispatchedIds[0]!);
    expect(updated?.status).toBe('sent');
    expect(updated?.providerMessageId).toBe(`wamid.locktest.${dispatchedIds[0]}`);
  });
});
