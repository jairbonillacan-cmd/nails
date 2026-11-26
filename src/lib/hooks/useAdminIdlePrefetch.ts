'use client';

import { useEffect, useRef } from 'react';

interface UseAdminIdlePrefetchOptions {
  enabled: boolean;
  routes: readonly string[];
  prefetch: (href: string) => void;
}

export function useAdminIdlePrefetch({
  enabled,
  routes,
  prefetch,
}: UseAdminIdlePrefetchOptions): void {
  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchRef = useRef(prefetch);

  useEffect(() => {
    prefetchRef.current = prefetch;
  }, [prefetch]);

  const routeKey = routes.join('|');

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !routeKey) return;
    const pending = routeKey
      .split('|')
      .filter((href) => href && !prefetchedRef.current.has(href));
    if (pending.length === 0) return;

    const run = () => {
      for (const href of pending) {
        prefetchedRef.current.add(href);
        prefetchRef.current(href);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        win.cancelIdleCallback?.(idleId);
      };
    }

    const rafId = window.requestAnimationFrame(run);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [enabled, routeKey]);
}
