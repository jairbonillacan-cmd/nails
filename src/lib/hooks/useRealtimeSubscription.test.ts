import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '../realtime';
import { createRealtimeDebouncer } from './useRealtimeSubscription';

describe('createRealtimeDebouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses a rapid burst into a single trailing emit after 300ms', () => {
    vi.useFakeTimers();
    const emitted: RealtimeEvent[] = [];
    const debouncer = createRealtimeDebouncer((evt) => emitted.push(evt));

    debouncer.push({ type: 'hold_changed', timestamp: '2026-11-26T10:00:00.000Z' });
    vi.advanceTimersByTime(150);
    debouncer.push({ type: 'schedule_changed', timestamp: '2026-11-26T10:00:00.150Z' });
    vi.advanceTimersByTime(150);
    debouncer.push({ type: 'hold_changed', timestamp: '2026-11-26T10:00:00.300Z' });

    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(299);
    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.type).toBe('hold_changed');
    expect(emitted[0]?.timestamp).toBe('2026-11-26T10:00:00.300Z');
  });

  it('preserves high-priority slot_changed type when followed by hold_changed in same window', () => {
    vi.useFakeTimers();
    const emitted: RealtimeEvent[] = [];
    const debouncer = createRealtimeDebouncer((evt) => emitted.push(evt));

    debouncer.push({ type: 'slot_changed', staffId: 'karla', timestamp: '2026-11-26T10:00:00.000Z' });
    vi.advanceTimersByTime(80);
    debouncer.push({ type: 'hold_changed', staffId: 'karla', timestamp: '2026-11-26T10:00:00.080Z' });

    vi.advanceTimersByTime(300);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.type).toBe('slot_changed');
    expect(emitted[0]?.timestamp).toBe('2026-11-26T10:00:00.080Z');
  });

  it('emits connected immediately without delaying or canceling pending events', () => {
    vi.useFakeTimers();
    const emitted: RealtimeEvent[] = [];
    const debouncer = createRealtimeDebouncer((evt) => emitted.push(evt));

    debouncer.push({ type: 'slot_changed', timestamp: '2026-11-26T10:00:00.000Z' });
    debouncer.push({ type: 'connected', timestamp: '2026-11-26T10:00:00.010Z' });

    expect(emitted.map((evt) => evt.type)).toEqual(['connected']);

    vi.advanceTimersByTime(300);
    expect(emitted.map((evt) => evt.type)).toEqual(['connected', 'slot_changed']);
  });

  it('cancels pending trailing emit cleanly', () => {
    vi.useFakeTimers();
    const emitted: RealtimeEvent[] = [];
    const debouncer = createRealtimeDebouncer((evt) => emitted.push(evt));

    debouncer.push({ type: 'schedule_changed', timestamp: '2026-11-26T10:00:00.000Z' });
    vi.advanceTimersByTime(100);
    debouncer.cancel();
    vi.advanceTimersByTime(500);

    expect(emitted).toHaveLength(0);
  });
});
