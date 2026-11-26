'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from '../realtime';

const DEFAULT_DEBOUNCE_MS = 300;

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

export function useRealtimeSubscription(
  onEvent: (event: RealtimeEvent) => void,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): void {
  const callbackRef = useRef(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const es = new EventSource('/api/realtime');
    const debouncer = createRealtimeDebouncer(
      (event) => callbackRef.current(event),
      debounceMs,
    );

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
