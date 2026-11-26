import {
  createSupabaseAdminClient,
  isSupabaseEnabled,
} from './repositories/supabase-client';

export type PublicRealtimeEventType =
  | 'connected'
  | 'slot_changed'
  | 'hold_changed'
  | 'schedule_changed';

type LegacyRealtimeEventType =
  | 'booking_created'
  | 'booking_updated'
  | 'slot_hold_updated'
  | 'availability_updated'
  | 'settings_updated'
  | 'waitlist_updated';

export type PublishableRealtimeEventType =
  | Exclude<PublicRealtimeEventType, 'connected'>
  | LegacyRealtimeEventType;

export interface PublicRealtimeEvent {
  type: PublicRealtimeEventType;
  staffId?: string | null;
  date?: string;
  timestamp: string;
}

export interface RealtimeEvent {
  type: PublicRealtimeEventType | LegacyRealtimeEventType;
  staffId?: string | null;
  date?: string;
  timestamp: string;
}

interface RealtimeBroadcastErrorRecord {
  channel: string;
  eventType: PublicRealtimeEventType;
  message: string;
  timestamp: string;
}

type Listener = (event: PublicRealtimeEvent) => void;

export const PUBLIC_SLOTS_CHANNEL = 'salon:public-slots';
const ISO_DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

declare global {
  var nailsRealtimeListeners: Set<Listener> | undefined;
  var nailsLastRealtimeBroadcastError: RealtimeBroadcastErrorRecord | null | undefined;
}

const listeners: Set<Listener> =
  globalThis.nailsRealtimeListeners ??
  (globalThis.nailsRealtimeListeners = new Set<Listener>());

function mapToPublicEventType(
  type: PublicRealtimeEventType | LegacyRealtimeEventType,
): PublicRealtimeEventType {
  if (type === 'connected') return 'connected';
  if (type === 'booking_created' || type === 'booking_updated' || type === 'slot_changed') {
    return 'slot_changed';
  }
  if (type === 'slot_hold_updated' || type === 'hold_changed') {
    return 'hold_changed';
  }
  return 'schedule_changed';
}

function extractSafeDate(payload?: Record<string, unknown>): string | undefined {
  if (!payload) return undefined;
  const candidate =
    typeof payload.date === 'string'
      ? payload.date
      : typeof payload.startAt === 'string'
        ? payload.startAt
        : undefined;
  if (!candidate) return undefined;
  const match = ISO_DATE_PREFIX_RE.exec(candidate.trim());
  return match?.[1];
}

function extractSafeStaffId(
  payload?: Record<string, unknown>,
): string | null | undefined {
  if (!payload || !('staffId' in payload)) return undefined;
  if (payload.staffId === null) return null;
  if (typeof payload.staffId === 'string') {
    const trimmed = payload.staffId.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export function toPublicRealtimeEvent(
  type: PublicRealtimeEventType | LegacyRealtimeEventType,
  payload?: Record<string, unknown>,
  timestamp = new Date().toISOString(),
): PublicRealtimeEvent {
  const publicType = mapToPublicEventType(type);
  const staffId = extractSafeStaffId(payload);
  const date = extractSafeDate(payload);
  const sanitized: PublicRealtimeEvent = {
    type: publicType,
    timestamp,
  };
  if (staffId !== undefined) {
    sanitized.staffId = staffId;
  }
  if (date !== undefined) {
    sanitized.date = date;
  }
  return sanitized;
}

async function broadcastToSupabasePublicSlots(
  evt: PublicRealtimeEvent,
): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();
    const channel = supabase.channel(PUBLIC_SLOTS_CHANNEL);
    try {
      const result = await channel.httpSend(evt.type, evt);
      if (!result.success) {
        globalThis.nailsLastRealtimeBroadcastError = {
          channel: PUBLIC_SLOTS_CHANNEL,
          eventType: evt.type,
          message: result.error,
          timestamp: new Date().toISOString(),
        };
      }
    } finally {
      await supabase.removeChannel(channel);
    }
  } catch (err) {
    globalThis.nailsLastRealtimeBroadcastError = {
      channel: PUBLIC_SLOTS_CHANNEL,
      eventType: evt.type,
      message: err instanceof Error ? err.message : 'Supabase broadcast failed',
      timestamp: new Date().toISOString(),
    };
  }
}

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishRealtimeEvent(
  type: PublishableRealtimeEventType,
  payload?: Record<string, unknown>,
): PublicRealtimeEvent {
  const evt = toPublicRealtimeEvent(type, payload);
  for (const listener of listeners) {
    try {
      listener(evt);
    } catch {
      continue;
    }
  }

  if (isSupabaseEnabled()) {
    void broadcastToSupabasePublicSlots(evt);
  }

  return evt;
}
