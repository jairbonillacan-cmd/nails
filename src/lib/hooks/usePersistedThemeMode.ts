'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ThemeModePreference } from '../types';

const THEME_MODE_STORAGE_KEY = 'laikona.themeMode';

const listeners = new Set<() => void>();
let memoryOverride: ThemeModePreference | null = null;

export function parseThemeModePreference(value: unknown): ThemeModePreference | null {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return null;
}

export function readStoredThemeMode(): ThemeModePreference | null {
  if (typeof window === 'undefined') return memoryOverride;
  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return parseThemeModePreference(raw) ?? memoryOverride;
  } catch {
    return memoryOverride;
  }
}

export function writeStoredThemeMode(next: ThemeModePreference): void {
  memoryOverride = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, next);
    } catch {
      memoryOverride = next;
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

export function resetThemeModeMemoryForTest(): void {
  memoryOverride = null;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_MODE_STORAGE_KEY) {
      memoryOverride = parseThemeModePreference(event.newValue);
      callback();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePersistedThemeMode(
  fallbackMode: ThemeModePreference,
): [ThemeModePreference, (next: ThemeModePreference) => void] {
  const getSnapshot = useCallback(
    () => readStoredThemeMode() ?? fallbackMode,
    [fallbackMode],
  );
  const getServerSnapshot = useCallback(() => fallbackMode, [fallbackMode]);

  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback((next: ThemeModePreference) => {
    writeStoredThemeMode(next);
  }, []);

  return [mode, setMode];
}
