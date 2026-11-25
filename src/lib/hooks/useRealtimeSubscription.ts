'use client';

import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from '../realtime';

export function useRealtimeSubscription(
  onEvent: (event: RealtimeEvent) => void,
): void {
  const callbackRef = useRef(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const es = new EventSource('/api/realtime');
    es.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data) as RealtimeEvent;
        if (parsed && typeof parsed.type === 'string') {
          callbackRef.current(parsed);
        }
      } catch {
        return;
      }
    };
    return () => {
      es.close();
    };
  }, []);
}
