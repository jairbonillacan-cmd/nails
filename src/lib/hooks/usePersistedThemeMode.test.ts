import { afterEach, describe, expect, it } from 'vitest';
import {
  parseThemeModePreference,
  readStoredThemeMode,
  resetThemeModeMemoryForTest,
  writeStoredThemeMode,
} from './usePersistedThemeMode';

describe('usePersistedThemeMode helpers', () => {
  afterEach(() => {
    resetThemeModeMemoryForTest();
  });

  it('validates allowed theme modes and rejects unknown strings', () => {
    expect(parseThemeModePreference('light')).toBe('light');
    expect(parseThemeModePreference('dark')).toBe('dark');
    expect(parseThemeModePreference('system')).toBe('system');
    expect(parseThemeModePreference('sepia')).toBeNull();
    expect(parseThemeModePreference(null)).toBeNull();
  });

  it('persists mode in memory fallback when window is unavailable', () => {
    expect(readStoredThemeMode()).toBeNull();
    writeStoredThemeMode('dark');
    expect(readStoredThemeMode()).toBe('dark');
    writeStoredThemeMode('light');
    expect(readStoredThemeMode()).toBe('light');
  });
});
