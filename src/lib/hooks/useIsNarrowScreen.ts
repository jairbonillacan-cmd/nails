'use client';

import { useCallback, useSyncExternalStore } from 'react';

const DEFAULT_NARROW_QUERY = '(max-width: 40rem)';
export const ADMIN_MOBILE_MEDIA_QUERY = '(max-width: 47.5rem)';

function getServerSnapshotFalse(): boolean {
  return false;
}

function getServerSnapshotNull(): boolean | null {
  return null;
}

export function useMediaQueryHydrated(
  query = ADMIN_MOBILE_MEDIA_QUERY,
): boolean | null {
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

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshotNull);
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

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshotFalse);
}
