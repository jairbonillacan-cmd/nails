export interface RealtimeEvent {
  type:
    | 'connected'
    | 'booking_created'
    | 'booking_updated'
    | 'slot_hold_updated'
    | 'availability_updated'
    | 'settings_updated'
    | 'waitlist_updated';
  payload?: Record<string, unknown>;
  timestamp: string;
}

type Listener = (event: RealtimeEvent) => void;

declare global {
  var nailsRealtimeListeners: Set<Listener> | undefined;
}

const listeners: Set<Listener> =
  globalThis.nailsRealtimeListeners ??
  (globalThis.nailsRealtimeListeners = new Set<Listener>());

export function subscribeRealtime(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishRealtimeEvent(
  type: Exclude<RealtimeEvent['type'], 'connected'>,
  payload?: Record<string, unknown>,
): void {
  const evt: RealtimeEvent = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  for (const listener of listeners) {
    try {
      listener(evt);
    } catch {
      continue;
    }
  }
}
