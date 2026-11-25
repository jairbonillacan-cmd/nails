export function getOrCreateBrowserSessionToken(storageKey: string): string {
  if (typeof window === 'undefined') return '';
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const fresh = `sess-${Math.random().toString(36).slice(2, 12)}`;
  window.sessionStorage.setItem(storageKey, fresh);
  return fresh;
}
