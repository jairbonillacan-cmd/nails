'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface UseWhatsAppAutoScrollOptions {
  enabled?: boolean;
  threadKey?: string | null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useWhatsAppAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  scrollKey: string | number | null | undefined,
  options?: UseWhatsAppAutoScrollOptions,
): void {
  const enabled = options?.enabled ?? true;
  const threadKey = options?.threadKey ?? null;
  const prevThreadKeyRef = useRef<string | null>(threadKey);
  const prevScrollKeyRef = useRef<string | number | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled || scrollKey === null || scrollKey === undefined || scrollKey === '') {
      prevThreadKeyRef.current = threadKey;
      return;
    }

    const threadChanged = prevThreadKeyRef.current !== threadKey;
    const keyChanged = prevScrollKeyRef.current !== scrollKey;
    prevThreadKeyRef.current = threadKey;
    prevScrollKeyRef.current = scrollKey;

    if (!keyChanged && !threadChanged) return;
    if (typeof window === 'undefined') return;

    const behavior: ScrollBehavior =
      threadChanged || prefersReducedMotion() ? 'auto' : 'smooth';

    const scrollNow = () => {
      const node = containerRef.current;
      if (!node) return;
      if (typeof node.scrollTo === 'function') {
        node.scrollTo({ top: node.scrollHeight, behavior });
      } else {
        node.scrollTop = node.scrollHeight;
      }
    };

    const rafId = window.requestAnimationFrame(scrollNow);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [containerRef, enabled, scrollKey, threadKey]);
}
