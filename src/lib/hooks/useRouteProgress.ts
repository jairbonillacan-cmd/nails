'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type RouteProgressStatus = 'idle' | 'loading' | 'finishing';

export interface RouteProgressState {
  status: RouteProgressStatus;
  progress: number;
}

export interface AnchorClickInfo {
  href: string | null;
  target: string | null;
  hasDownload: boolean;
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export interface RouteProgressScheduler {
  setInterval: (callback: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

export interface RouteProgressController {
  start: () => void;
  complete: () => void;
  dispose: () => void;
  getState: () => RouteProgressState;
}

const INITIAL_PROGRESS = 0.14;
const MAX_TRICKLE_PROGRESS = 0.92;
const TRICKLE_INTERVAL_MS = 220;
const FINISH_RESET_DELAY_MS = 380;
const SAFETY_TIMEOUT_MS = 8000;

export function shouldStartRouteProgress(
  click: AnchorClickInfo,
  currentUrl: string,
): boolean {
  if (
    click.defaultPrevented ||
    click.button !== 0 ||
    click.metaKey ||
    click.ctrlKey ||
    click.shiftKey ||
    click.altKey ||
    click.hasDownload
  ) {
    return false;
  }

  const normalizedTarget = click.target?.trim().toLowerCase() ?? '';
  if (normalizedTarget && normalizedTarget !== '_self') {
    return false;
  }

  const rawHref = click.href?.trim() ?? '';
  if (
    !rawHref ||
    rawHref.startsWith('#') ||
    rawHref.startsWith('mailto:') ||
    rawHref.startsWith('tel:') ||
    rawHref.startsWith('javascript:')
  ) {
    return false;
  }

  try {
    const current = new URL(currentUrl);
    const destination = new URL(rawHref, current);
    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
      return false;
    }
    if (destination.origin !== current.origin) {
      return false;
    }
    if (
      destination.pathname === current.pathname &&
      destination.search === current.search
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function nextTrickleProgress(current: number): number {
  if (current < 0.25) {
    return Number(Math.min(MAX_TRICKLE_PROGRESS, current + 0.16).toFixed(4));
  }
  if (current < 0.55) {
    return Number(Math.min(MAX_TRICKLE_PROGRESS, current + 0.09).toFixed(4));
  }
  if (current < 0.78) {
    return Number(Math.min(MAX_TRICKLE_PROGRESS, current + 0.04).toFixed(4));
  }
  if (current < 0.9) {
    return Number(Math.min(MAX_TRICKLE_PROGRESS, current + 0.015).toFixed(4));
  }
  return Math.min(MAX_TRICKLE_PROGRESS, current);
}

function getBrowserScheduler(): RouteProgressScheduler {
  return {
    setInterval: (cb, ms) => window.setInterval(cb, ms),
    clearInterval: (id) => window.clearInterval(id),
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
  };
}

export function createRouteProgressController(
  onChange: (state: RouteProgressState) => void,
  scheduler?: RouteProgressScheduler,
): RouteProgressController {
  const timers = scheduler ?? getBrowserScheduler();
  let state: RouteProgressState = { status: 'idle', progress: 0 };
  let trickleId: number | null = null;
  let finishId: number | null = null;
  let safetyId: number | null = null;
  let disposed = false;

  const clearTimers = () => {
    if (trickleId !== null) {
      timers.clearInterval(trickleId);
      trickleId = null;
    }
    if (finishId !== null) {
      timers.clearTimeout(finishId);
      finishId = null;
    }
    if (safetyId !== null) {
      timers.clearTimeout(safetyId);
      safetyId = null;
    }
  };

  const emit = (next: RouteProgressState) => {
    state = next;
    if (!disposed) {
      onChange(next);
    }
  };

  const complete = () => {
    if (disposed || state.status === 'idle') {
      return;
    }
    clearTimers();
    emit({ status: 'finishing', progress: 1 });
    finishId = timers.setTimeout(() => {
      finishId = null;
      emit({ status: 'idle', progress: 0 });
    }, FINISH_RESET_DELAY_MS);
  };

  const start = () => {
    if (disposed) {
      return;
    }
    clearTimers();
    emit({ status: 'loading', progress: INITIAL_PROGRESS });
    trickleId = timers.setInterval(() => {
      if (state.status !== 'loading') {
        return;
      }
      const next = nextTrickleProgress(state.progress);
      if (next !== state.progress) {
        emit({ status: 'loading', progress: next });
      }
    }, TRICKLE_INTERVAL_MS);
    safetyId = timers.setTimeout(() => {
      safetyId = null;
      complete();
    }, SAFETY_TIMEOUT_MS);
  };

  const dispose = () => {
    disposed = true;
    clearTimers();
    state = { status: 'idle', progress: 0 };
  };

  return {
    start,
    complete,
    dispose,
    getState: () => ({ ...state }),
  };
}

export function useRouteProgress(): RouteProgressState {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [state, setState] = useState<RouteProgressState>({
    status: 'idle',
    progress: 0,
  });
  const controllerRef = useRef<RouteProgressController | null>(null);
  const lastRouteKeyRef = useRef(routeKey);

  useEffect(() => {
    const controller = createRouteProgressController(setState);
    controllerRef.current = controller;

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const info: AnchorClickInfo = {
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        hasDownload: anchor.hasAttribute('download'),
        defaultPrevented: event.defaultPrevented,
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      };

      if (shouldStartRouteProgress(info, window.location.href)) {
        controller.start();
      }
    };

    document.addEventListener('click', handleDocumentClick, true);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (lastRouteKeyRef.current !== routeKey) {
      lastRouteKeyRef.current = routeKey;
      controllerRef.current?.complete();
    }
  }, [routeKey]);

  return state;
}

const DEFAULT_PENDING_NAV_FALLBACK_MS = 4000;

export function schedulePendingNavigationFallback(
  targetUrl: string,
  navigate: (url: string) => void,
  delayMs = DEFAULT_PENDING_NAV_FALLBACK_MS,
  scheduler?: Pick<RouteProgressScheduler, 'setTimeout' | 'clearTimeout'>,
): () => void {
  const trimmed = targetUrl.trim();
  if (!trimmed.startsWith('/')) {
    return () => undefined;
  }
  const timers = scheduler ?? getBrowserScheduler();
  let cancelled = false;
  const timeoutId = timers.setTimeout(() => {
    if (!cancelled) {
      navigate(trimmed);
    }
  }, delayMs);
  return () => {
    cancelled = true;
    timers.clearTimeout(timeoutId);
  };
}

export function usePendingNavigationFallback(
  targetUrl: string | null,
  delayMs = DEFAULT_PENDING_NAV_FALLBACK_MS,
): void {
  useEffect(() => {
    if (!targetUrl || typeof window === 'undefined') {
      return;
    }
    return schedulePendingNavigationFallback(
      targetUrl,
      (url) => {
        if (window.location.pathname !== url) {
          window.location.assign(url);
        }
      },
      delayMs,
    );
  }, [targetUrl, delayMs]);
}
