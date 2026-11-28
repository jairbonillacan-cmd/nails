'use client';

import { useEffect, useRef } from 'react';

export function useFocusScroll(
  targetId: string | null | undefined,
  enabled = true,
): void {
  const lastScrolledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !targetId) {
      lastScrolledKeyRef.current = null;
      return;
    }
    if (lastScrolledKeyRef.current === targetId) return;
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const prefersReducedMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    const scrollToTarget = (): boolean => {
      const element = document.getElementById(targetId);
      if (!element) return false;
      lastScrolledKeyRef.current = targetId;
      element.scrollIntoView({ behavior, block: 'start' });
      return true;
    };

    if (scrollToTarget()) return;

    const rafId = window.requestAnimationFrame(() => {
      scrollToTarget();
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [enabled, targetId]);
}
