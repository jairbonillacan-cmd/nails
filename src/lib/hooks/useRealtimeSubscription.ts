'use client';

import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import type { PublicRealtimeEventType, RealtimeEvent } from '../realtime';

const DEFAULT_DEBOUNCE_MS = 300;
const SUPABASE_PUBLIC_SLOTS_CHANNEL = 'salon:public-slots';

export type RealtimeTransportMode = 'supabase' | 'sse';

export function resolveRealtimeTransportMode(
  supabaseUrl?: string | null,
  supabaseAnonKey?: string | null,
): RealtimeTransportMode {
  if (supabaseUrl?.trim() && supabaseAnonKey?.trim()) {
    return 'supabase';
  }
  return 'sse';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeBroadcastType(
  rawType: unknown,
  fallback: Exclude<PublicRealtimeEventType, 'connected'>,
): PublicRealtimeEventType {
  if (
    rawType === 'connected' ||
    rawType === 'slot_changed' ||
    rawType === 'hold_changed' ||
    rawType === 'schedule_changed'
  ) {
    return rawType;
  }
  return fallback;
}

export function mapBroadcastPayloadToRealtimeEvent(
  eventName: Exclude<PublicRealtimeEventType, 'connected'>,
  rawPayload: unknown,
  nowIso = new Date().toISOString(),
): RealtimeEvent {
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const type = normalizeBroadcastType(payload.type, eventName);
  const staffId =
    payload.staffId === null
      ? null
      : typeof payload.staffId === 'string' && payload.staffId.trim().length > 0
        ? payload.staffId.trim()
        : undefined;
  const date =
    typeof payload.date === 'string' && payload.date.trim().length > 0
      ? payload.date.trim()
      : undefined;
  const timestamp =
    typeof payload.timestamp === 'string' && payload.timestamp.trim().length > 0
      ? payload.timestamp
      : nowIso;

  return {
    type,
    ...(staffId !== undefined ? { staffId } : {}),
    ...(date !== undefined ? { date } : {}),
    timestamp,
  };
}

export function mapPostgresChangeToRealtimeEvent(
  change: {
    new?: Record<string, unknown> | null;
    old?: Record<string, unknown> | null;
  },
  nowIso = new Date().toISOString(),
): RealtimeEvent {
  const nextRow =
    isRecord(change.new) && Object.keys(change.new).length > 0 ? change.new : null;
  const prevRow =
    isRecord(change.old) && Object.keys(change.old).length > 0 ? change.old : null;
  const row = nextRow ?? prevRow;

  const sourceKind = row && typeof row.source_kind === 'string' ? row.source_kind : null;
  const type: PublicRealtimeEventType =
    sourceKind === 'slot_hold' ? 'hold_changed' : 'slot_changed';
  const staffId =
    row && typeof row.staff_id === 'string' && row.staff_id.trim().length > 0
      ? row.staff_id.trim()
      : undefined;
  const date =
    row && typeof row.slot_date === 'string' && row.slot_date.trim().length > 0
      ? row.slot_date.trim()
      : undefined;

  return {
    type,
    ...(staffId !== undefined ? { staffId } : {}),
    ...(date !== undefined ? { date } : {}),
    timestamp: nowIso,
  };
}

function isHighPriorityEvent(type: RealtimeEvent['type']): boolean {
  return type === 'slot_changed' || type === 'booking_created';
}

function coalesceRealtimeEvent(
  pending: RealtimeEvent | null,
  incoming: RealtimeEvent,
): RealtimeEvent {
  if (!pending) return incoming;
  if (isHighPriorityEvent(pending.type) && !isHighPriorityEvent(incoming.type)) {
    return {
      ...incoming,
      type: pending.type,
    };
  }
  return incoming;
}

export interface RealtimeDebouncer {
  push: (event: RealtimeEvent) => void;
  cancel: () => void;
}

export function createRealtimeDebouncer(
  onEmit: (event: RealtimeEvent) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): RealtimeDebouncer {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let pendingEvent: RealtimeEvent | null = null;

  const flush = () => {
    timerId = null;
    const eventToEmit = pendingEvent;
    pendingEvent = null;
    if (eventToEmit) {
      onEmit(eventToEmit);
    }
  };

  return {
    push(event: RealtimeEvent) {
      if (event.type === 'connected' || debounceMs <= 0) {
        onEmit(event);
        return;
      }
      pendingEvent = coalesceRealtimeEvent(pendingEvent, event);
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(flush, debounceMs);
    },
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      pendingEvent = null;
    },
  };
}

interface SharedSupabaseRealtimeHub {
  client: SupabaseClient;
  channel: RealtimeChannel;
  listeners: Set<(event: RealtimeEvent) => void>;
  isConnected: boolean;
}

const sharedSupabaseHubs = new Map<string, SharedSupabaseRealtimeHub>();

export function subscribeSupabasePublicSlots(
  supabaseUrl: string,
  supabaseAnonKey: string,
  onEvent: (event: RealtimeEvent) => void,
): () => void {
  const hubKey = `${supabaseUrl}::${supabaseAnonKey}`;
  let hub = sharedSupabaseHubs.get(hubKey);

  if (!hub) {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const listeners = new Set<(event: RealtimeEvent) => void>();
    const emitToAll = (event: RealtimeEvent) => {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          continue;
        }
      }
    };

    const channel = client
      .channel(SUPABASE_PUBLIC_SLOTS_CHANNEL)
      .on('broadcast', { event: 'slot_changed' }, (msg) => {
        emitToAll(mapBroadcastPayloadToRealtimeEvent('slot_changed', msg.payload));
      })
      .on('broadcast', { event: 'hold_changed' }, (msg) => {
        emitToAll(mapBroadcastPayloadToRealtimeEvent('hold_changed', msg.payload));
      })
      .on('broadcast', { event: 'schedule_changed' }, (msg) => {
        emitToAll(mapBroadcastPayloadToRealtimeEvent('schedule_changed', msg.payload));
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'public_busy_intervals',
        },
        (payload) => {
          emitToAll(
            mapPostgresChangeToRealtimeEvent({
              new: isRecord(payload.new) ? payload.new : null,
              old: isRecord(payload.old) ? payload.old : null,
            }),
          );
        },
      );

    hub = {
      client,
      channel,
      listeners,
      isConnected: false,
    };
    sharedSupabaseHubs.set(hubKey, hub);

    const activeHub = hub;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        activeHub.isConnected = true;
        emitToAll({
          type: 'connected',
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  hub.listeners.add(onEvent);
  if (hub.isConnected) {
    onEvent({
      type: 'connected',
      timestamp: new Date().toISOString(),
    });
  }

  const currentHub = hub;
  return () => {
    currentHub.listeners.delete(onEvent);
    if (currentHub.listeners.size === 0) {
      sharedSupabaseHubs.delete(hubKey);
      void currentHub.client.removeChannel(currentHub.channel);
    }
  };
}

export function useRealtimeSubscription(
  onEvent: (event: RealtimeEvent) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): void {
  const callbackRef = useRef(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const debouncer = createRealtimeDebouncer(
      (event) => callbackRef.current(event),
      debounceMs,
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (
      resolveRealtimeTransportMode(supabaseUrl, supabaseAnonKey) === 'supabase' &&
      supabaseUrl &&
      supabaseAnonKey
    ) {
      const unsubscribe = subscribeSupabasePublicSlots(
        supabaseUrl,
        supabaseAnonKey,
        (event) => debouncer.push(event),
      );
      return () => {
        debouncer.cancel();
        unsubscribe();
      };
    }

    const es = new EventSource('/api/realtime');
    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as RealtimeEvent;
        if (parsed && typeof parsed.type === 'string') {
          debouncer.push(parsed);
        }
      } catch {
        return;
      }
    };

    return () => {
      debouncer.cancel();
      es.close();
    };
  }, [debounceMs]);
}
