import { describe, expect, it, vi } from 'vitest';
import {
  registerAppServiceWorker,
  subscribeOnlineStatus,
  type OnlineEventTargetLike,
} from './useServiceWorker';

describe('useServiceWorker helpers', () => {
  it('registers /sw.js with root scope and returns true when supported', async () => {
    const register = vi.fn().mockResolvedValue({ scope: '/' });
    const ok = await registerAppServiceWorker({ register });
    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('returns false gracefully when serviceWorker is absent or rejects', async () => {
    expect(await registerAppServiceWorker(null)).toBe(false);
    expect(await registerAppServiceWorker(undefined)).toBe(false);

    const register = vi.fn().mockRejectedValue(new Error('Registration denied'));
    expect(await registerAppServiceWorker({ register })).toBe(false);
  });

  it('tracks online and offline transitions and removes listeners on cleanup', () => {
    const listeners: Record<'online' | 'offline', Set<() => void>> = {
      online: new Set(),
      offline: new Set(),
    };
    const fakeWindow: OnlineEventTargetLike = {
      addEventListener(type, listener) {
        listeners[type].add(listener);
      },
      removeEventListener(type, listener) {
        listeners[type].delete(listener);
      },
    };

    const states: boolean[] = [];
    const unsubscribe = subscribeOnlineStatus(fakeWindow, (offline) => {
      states.push(offline);
    });

    for (const fn of listeners.offline) fn();
    for (const fn of listeners.online) fn();
    expect(states).toEqual([true, false]);

    unsubscribe();
    expect(listeners.offline.size).toBe(0);
    expect(listeners.online.size).toBe(0);
  });
});
