'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

interface ServiceWorkerState {
  isOffline: boolean;
  swReady: boolean;
}

interface ServiceWorkerContainerLike {
  register: (scriptURL: string, options?: RegistrationOptions) => Promise<unknown>;
}

export interface OnlineEventTargetLike {
  addEventListener: (type: 'online' | 'offline', listener: () => void) => void;
  removeEventListener: (type: 'online' | 'offline', listener: () => void) => void;
}

export async function registerAppServiceWorker(
  container: ServiceWorkerContainerLike | null | undefined,
  scriptUrl = '/sw.js',
): Promise<boolean> {
  if (!container || typeof container.register !== 'function') {
    return false;
  }
  try {
    await container.register(scriptUrl, { scope: '/' });
    return true;
  } catch {
    return false;
  }
}

export function subscribeOnlineStatus(
  target: OnlineEventTargetLike | null | undefined,
  onChange: (isOffline: boolean) => void,
): () => void {
  if (!target) {
    return () => undefined;
  }
  const handleOnline = () => onChange(false);
  const handleOffline = () => onChange(true);
  target.addEventListener('online', handleOnline);
  target.addEventListener('offline', handleOffline);
  return () => {
    target.removeEventListener('online', handleOnline);
    target.removeEventListener('offline', handleOffline);
  };
}

function getClientOfflineSnapshot(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function getServerOfflineSnapshot(): boolean {
  return false;
}

function subscribeWindowOnline(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  return subscribeOnlineStatus(window, () => onStoreChange());
}

export function useServiceWorker(options?: { register?: boolean }): ServiceWorkerState {
  const shouldRegister = options?.register ?? true;
  const isOffline = useSyncExternalStore(
    subscribeWindowOnline,
    getClientOfflineSnapshot,
    getServerOfflineSnapshot,
  );
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    if (!shouldRegister || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;
    void registerAppServiceWorker(navigator.serviceWorker).then((ok) => {
      if (!cancelled && ok) {
        setSwReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [shouldRegister]);

  return { isOffline, swReady };
}
