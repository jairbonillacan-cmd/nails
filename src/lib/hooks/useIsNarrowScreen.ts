'use client';

import { useSyncExternalStore } from 'react';

const NARROW_QUERY = '(max-width: 40rem)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
