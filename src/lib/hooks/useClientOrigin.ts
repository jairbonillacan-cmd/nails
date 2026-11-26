'use client';

import { useSyncExternalStore } from 'react';

function subscribeNoop(): () => void {
  return () => undefined;
}

function getClientOrigin(): string {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function getServerOrigin(): string {
  return '';
}

export function useClientOrigin(fallbackOrigin: string): string {
  const clientOrigin = useSyncExternalStore(
    subscribeNoop,
    getClientOrigin,
    getServerOrigin,
  );
  return (clientOrigin || fallbackOrigin).replace(/\/+$/, '');
}
