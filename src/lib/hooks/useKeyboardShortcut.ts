'use client';

import { useEffect, useRef } from 'react';

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
