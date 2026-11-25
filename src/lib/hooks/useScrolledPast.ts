'use client';

import { useCallback, useSyncExternalStore } from 'react';

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange, { passive: true });
  return () => {
    window.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
  };
}

function getServerSnapshot(): boolean {
  return false;
}

export function useScrolledPast(threshold: number): boolean {
  const getSnapshot = useCallback(() => window.scrollY > threshold, [threshold]);
  return useSyncExternalStore(subscribeToScroll, getSnapshot, getServerSnapshot);
}
