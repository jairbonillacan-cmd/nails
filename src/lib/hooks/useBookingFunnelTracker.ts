'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { FunnelEventType } from '../types';
import type { BookingStep } from '@/components/booking/bookingMachine';

const SESSION_KEY = 'laikona_funnel_sid';

function getOrCreateFunnelSessionId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing && existing.length >= 8) return existing;
    const generated =
      typeof window.crypto?.randomUUID === 'function'
        ? `fnl-${window.crypto.randomUUID()}`
        : `fnl-${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
    window.sessionStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `fnl-${Date.now().toString(36)}`;
  }
}

interface UseBookingFunnelTrackerInput {
  step: BookingStep;
  hasHeldSlot: boolean;
  serviceSlug?: string | null;
  staffSlug?: string | null;
}

export function useBookingFunnelTracker({
  step,
  hasHeldSlot,
  serviceSlug = null,
  staffSlug = null,
}: UseBookingFunnelTrackerInput) {
  const sentEventsRef = useRef<Set<FunnelEventType>>(new Set());

  const track = useCallback(
    (
      eventType: FunnelEventType,
      overrides?: { serviceSlug?: string | null; staffSlug?: string | null },
    ) => {
      if (typeof window === 'undefined') return;
      if (sentEventsRef.current.has(eventType)) return;
      const sessionId = getOrCreateFunnelSessionId();
      if (!sessionId) return;
      sentEventsRef.current.add(eventType);

      const payload = JSON.stringify({
        sessionId,
        eventType,
        serviceSlug: overrides?.serviceSlug ?? serviceSlug ?? null,
        staffSlug: overrides?.staffSlug ?? staffSlug ?? null,
      });

      void fetch('/api/analytics/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => undefined);
    },
    [serviceSlug, staffSlug],
  );

  useEffect(() => {
    track('page_view');
  }, [track]);

  useEffect(() => {
    if (step !== 'service') {
      track('booking_started');
    }
  }, [step, track]);

  useEffect(() => {
    if (hasHeldSlot) {
      track('slot_held');
    }
  }, [hasHeldSlot, track]);

  return { track };
}
