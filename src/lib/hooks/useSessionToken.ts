function createCryptoToken(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getOrCreateBrowserSessionToken(storageKey: string): string {
  if (typeof window === 'undefined') return '';
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const fresh = `sess-${createCryptoToken()}`;
  window.sessionStorage.setItem(storageKey, fresh);
  return fresh;
}
