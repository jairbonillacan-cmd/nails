'use client';

import { useEffect, useRef } from 'react';

function isEditableOrModalTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  ) {
    return true;
  }
  return Boolean(target.closest('dialog,[role="dialog"],[contenteditable="true"]'));
}

export function useKeyboardShortcut(
  key: string,
  handler: () => void,
  options?: { enabled?: boolean; requireModifier?: boolean },
): void {
  const handlerRef = useRef(handler);
  const enabled = options?.enabled ?? true;
  const requireModifier = options?.requireModifier ?? true;

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;
    const normalizedTarget = key.toLowerCase();
    const onKeyDown = (event: KeyboardEvent) => {
      if (requireModifier && !event.ctrlKey && !event.metaKey) return;
      if (!requireModifier && (event.ctrlKey || event.metaKey || event.altKey)) return;
      if (!requireModifier && isEditableOrModalTarget(event.target)) return;
      if (event.key.toLowerCase() !== normalizedTarget) return;
      event.preventDefault();
      handlerRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, key, requireModifier]);
}

interface AdminGlobalShortcutsOptions {
  enabled: boolean;
  onQuickSearch: () => void;
  onNewBooking: () => void;
  onNavigate: (href: string) => void;
  allowedRoutes: ReadonlySet<string>;
}

const G_CHORD_ROUTES: Record<string, string> = {
  r: '/admin',
  a: '/admin/citas',
  w: '/admin/whatsapp',
  c: '/admin/clientas',
  j: '/admin/caja',
  e: '/admin/reportes',
};

export function useAdminGlobalShortcuts({
  enabled,
  onQuickSearch,
  onNewBooking,
  onNavigate,
  allowedRoutes,
}: AdminGlobalShortcutsOptions): void {
  const callbacksRef = useRef({
    onQuickSearch,
    onNewBooking,
    onNavigate,
    allowedRoutes,
  });

  useEffect(() => {
    callbacksRef.current = {
      onQuickSearch,
      onNewBooking,
      onNavigate,
      allowedRoutes,
    };
  }, [onQuickSearch, onNewBooking, onNavigate, allowedRoutes]);

  useEffect(() => {
    if (!enabled) return;
    let pendingGAt = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableOrModalTarget(event.target)) return;
      if (typeof document !== 'undefined' && document.querySelector('dialog[open]')) {
        return;
      }

      const key = event.key.toLowerCase();
      const now = Date.now();

      if (pendingGAt > 0 && now - pendingGAt <= 850) {
        pendingGAt = 0;
        const targetHref = G_CHORD_ROUTES[key];
        if (targetHref && callbacksRef.current.allowedRoutes.has(targetHref)) {
          event.preventDefault();
          callbacksRef.current.onNavigate(targetHref);
          return;
        }
      }

      if (key === 'g') {
        pendingGAt = now;
        return;
      }

      pendingGAt = 0;

      if (key === '/') {
        event.preventDefault();
        callbacksRef.current.onQuickSearch();
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        callbacksRef.current.onNewBooking();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled]);
}
