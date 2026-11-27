'use client';

import { useCallback, useSyncExternalStore } from 'react';

const DEFAULT_NARROW_QUERY = '(max-width: 40rem)';

function getServerSnapshot(): boolean {
  return false;
}

export function useIsNarrowScreen(query = DEFAULT_NARROW_QUERY): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
