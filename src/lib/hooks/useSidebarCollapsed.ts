'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'laikona.admin.sidebarCollapsed';
const listeners = new Set<() => void>();
let memoryFallback = false;

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return memoryFallback;
  }
}

function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !getSnapshot();
    memoryFallback = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      memoryFallback = next;
    }
    for (const listener of listeners) {
      listener();
    }
  }, []);

  return [collapsed, toggle];
}
