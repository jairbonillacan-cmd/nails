'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerReducedMotion(): boolean {
  return false;
}

export function nextSlideIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}

export interface AutoAdvanceState {
  index: number;
  isPaused: boolean;
  togglePause: () => void;
}

export function useAutoAdvance(count: number, intervalMs: number): AutoAdvanceState {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );
  const isPaused = userPaused ?? prefersReducedMotion;

  useEffect(() => {
    if (isPaused || count < 2) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setIndex((current) => nextSlideIndex(current, count));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isPaused, count, intervalMs]);

  return {
    index: index < count ? index : 0,
    isPaused,
    togglePause: () => setUserPaused(!isPaused),
  };
}
