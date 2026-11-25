import { syncBookingToGoogleCalendar } from '../integrations/google-calendar';
import { buildAndSendImmediateNotifications } from '../integrations/notifications';
import {
  publishRealtimeEvent,
  type PublishableRealtimeEventType,
} from '../realtime';
import type {
  BookingWithRelations,
  CalendarConnection,
  NotificationWorkflow,
  SalonSettings,
  ScheduledNotification,
} from '../types';

export type OutboxEventInput =
  | {
      type: 'SyncCalendar';
      booking: BookingWithRelations;
      connection: CalendarConnection | undefined;
      settings: SalonSettings;
      action: 'create' | 'update' | 'delete';
      onSynced?: (googleEventId: string | null) => Promise<void> | void;
    }
  | {
      type: 'Notify';
      booking: BookingWithRelations;
      workflows: NotificationWorkflow[];
      settings: SalonSettings;
      trigger:
        | 'booking_created'
        | 'booking_confirmed'
        | 'booking_canceled'
        | 'booking_rescheduled';
      onLogs?: (logs: ScheduledNotification[]) => Promise<void> | void;
    }
  | {
      type: 'Realtime';
      eventType: PublishableRealtimeEventType;
      payload?: Record<string, unknown>;
    };

export async function dispatchOutboxEvent(
  event: OutboxEventInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (event.type === 'SyncCalendar') {
      const result = await syncBookingToGoogleCalendar({
        booking: event.booking,
        connection: event.connection,
        settings: event.settings,
        action: event.action,
      });
      if (event.onSynced) {
        await event.onSynced(result.googleEventId);
      }
      return { ok: true };
    }

    if (event.type === 'Notify') {
      const logs = await buildAndSendImmediateNotifications({
        booking: event.booking,
        workflows: event.workflows,
        settings: event.settings,
        trigger: event.trigger,
      });
      if (event.onLogs && logs.length > 0) {
        await event.onLogs(logs);
      }
      return { ok: true };
    }

    publishRealtimeEvent(event.eventType, event.payload);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Outbox dispatch failed',
    };
  }
}
