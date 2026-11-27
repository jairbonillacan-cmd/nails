import { describe, expect, it, vi } from 'vitest';
import {
  createRouteProgressController,
  nextTrickleProgress,
  schedulePendingNavigationFallback,
  shouldStartRouteProgress,
  type AnchorClickInfo,
  type RouteProgressScheduler,
  type RouteProgressState,
} from './useRouteProgress';

const BASE_URL = 'https://laikona.example/reservar?servicio=rubber';

function makeClick(overrides: Partial<AnchorClickInfo> = {}): AnchorClickInfo {
  return {
    href: '/admin',
    target: null,
    hasDownload: false,
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...overrides,
  };
}

function createFakeScheduler() {
  let nextId = 1;
  const intervals = new Map<number, { cb: () => void; ms: number }>();
  const timeouts = new Map<number, { cb: () => void; ms: number }>();

  const scheduler: RouteProgressScheduler = {
    setInterval: vi.fn((cb: () => void, ms: number) => {
      const id = nextId++;
      intervals.set(id, { cb, ms });
      return id;
    }),
    clearInterval: vi.fn((id: number) => {
      intervals.delete(id);
    }),
    setTimeout: vi.fn((cb: () => void, ms: number) => {
      const id = nextId++;
      timeouts.set(id, { cb, ms });
      return id;
    }),
    clearTimeout: vi.fn((id: number) => {
      timeouts.delete(id);
    }),
  };

  return {
    scheduler,
    intervals,
    timeouts,
    tickIntervals() {
      for (const entry of Array.from(intervals.values())) {
        entry.cb();
      }
    },
    flushTimeouts() {
      for (const [id, entry] of Array.from(timeouts.entries())) {
        timeouts.delete(id);
        entry.cb();
      }
    },
  };
}

describe('shouldStartRouteProgress', () => {
  it('starts for internal same-origin navigation to a different path or search', () => {
    expect(shouldStartRouteProgress(makeClick({ href: '/admin' }), BASE_URL)).toBe(true);
    expect(
      shouldStartRouteProgress(makeClick({ href: '/reservar?servicio=softgel' }), BASE_URL),
    ).toBe(true);
    expect(
      shouldStartRouteProgress(makeClick({ href: 'https://laikona.example/links' }), BASE_URL),
    ).toBe(true);
    expect(shouldStartRouteProgress(makeClick({ href: '/links', target: '_self' }), BASE_URL)).toBe(
      true,
    );
  });

  it('ignores same-route links and hash-only anchors', () => {
    expect(shouldStartRouteProgress(makeClick({ href: '#galeria' }), BASE_URL)).toBe(false);
    expect(
      shouldStartRouteProgress(makeClick({ href: '/reservar?servicio=rubber' }), BASE_URL),
    ).toBe(false);
    expect(
      shouldStartRouteProgress(makeClick({ href: '/reservar?servicio=rubber#paso-2' }), BASE_URL),
    ).toBe(false);
  });

  it('ignores external origins and non-http protocols', () => {
    expect(
      shouldStartRouteProgress(makeClick({ href: 'https://instagram.com/laikona.nailsss' }), BASE_URL),
    ).toBe(false);
    expect(
      shouldStartRouteProgress(makeClick({ href: 'mailto:hola@laikona.example' }), BASE_URL),
    ).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ href: 'tel:+522221234567' }), BASE_URL)).toBe(
      false,
    );
  });

  it('ignores _blank, download, modifier keys, non-primary button, and prevented clicks', () => {
    expect(shouldStartRouteProgress(makeClick({ target: '_blank' }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ hasDownload: true }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ defaultPrevented: true }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ button: 1 }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ metaKey: true }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ ctrlKey: true }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ shiftKey: true }), BASE_URL)).toBe(false);
    expect(shouldStartRouteProgress(makeClick({ altKey: true }), BASE_URL)).toBe(false);
  });
});

describe('createRouteProgressController', () => {
  it('starts, trickles monotonically below 1, completes, and resets cleanly to idle', () => {
    const fake = createFakeScheduler();
    const states: RouteProgressState[] = [];
    const controller = createRouteProgressController((s) => states.push(s), fake.scheduler);

    controller.start();
    expect(controller.getState()).toEqual({ status: 'loading', progress: 0.14 });

    fake.tickIntervals();
    fake.tickIntervals();
    fake.tickIntervals();
    const afterTrickle = controller.getState();
    expect(afterTrickle.status).toBe('loading');
    expect(afterTrickle.progress).toBeGreaterThan(0.14);
    expect(afterTrickle.progress).toBeLessThan(1);

    controller.complete();
    expect(controller.getState()).toEqual({ status: 'finishing', progress: 1 });
    expect(fake.intervals.size).toBe(0);

    fake.flushTimeouts();
    expect(controller.getState()).toEqual({ status: 'idle', progress: 0 });
    expect(states.at(-1)).toEqual({ status: 'idle', progress: 0 });
  });

  it('auto-completes via safety timeout if navigation never resolves', () => {
    const fake = createFakeScheduler();
    const controller = createRouteProgressController(() => undefined, fake.scheduler);

    controller.start();
    expect(fake.timeouts.size).toBe(1);

    fake.flushTimeouts();
    expect(controller.getState()).toEqual({ status: 'finishing', progress: 1 });

    fake.flushTimeouts();
    expect(controller.getState()).toEqual({ status: 'idle', progress: 0 });
  });

  it('cleans up all timers on dispose and stops emitting updates', () => {
    const fake = createFakeScheduler();
    const onChange = vi.fn();
    const controller = createRouteProgressController(onChange, fake.scheduler);

    controller.start();
    expect(fake.intervals.size).toBe(1);
    expect(fake.timeouts.size).toBe(1);

    const callsBeforeDispose = onChange.mock.calls.length;
    controller.dispose();
    expect(fake.intervals.size).toBe(0);
    expect(fake.timeouts.size).toBe(0);

    controller.complete();
    controller.start();
    expect(onChange.mock.calls.length).toBe(callsBeforeDispose);
  });

  it('caps trickle progress safely below 1', () => {
    let value = 0.14;
    for (let i = 0; i < 40; i += 1) {
      value = nextTrickleProgress(value);
    }
    expect(value).toBeLessThanOrEqual(0.92);
    expect(value).toBeGreaterThan(0.85);
  });
});

describe('schedulePendingNavigationFallback', () => {
  it('triggers hard navigation fallback after delay when navigation has not unmounted', () => {
    const fake = createFakeScheduler();
    const navigate = vi.fn();
    const cancel = schedulePendingNavigationFallback(
      '/cita/tok-123',
      navigate,
      4000,
      fake.scheduler,
    );

    expect(fake.timeouts.size).toBe(1);
    expect(navigate).not.toHaveBeenCalled();

    fake.flushTimeouts();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/cita/tok-123');
    cancel();
  });

  it('cancels the fallback cleanly on unmount and ignores non-relative URLs', () => {
    const fake = createFakeScheduler();
    const navigate = vi.fn();
    const cancel = schedulePendingNavigationFallback(
      '/cita/tok-456',
      navigate,
      4000,
      fake.scheduler,
    );

    cancel();
    fake.flushTimeouts();
    expect(navigate).not.toHaveBeenCalled();

    schedulePendingNavigationFallback('https://evil.example', navigate, 4000, fake.scheduler);
    expect(fake.timeouts.size).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
  });
});
