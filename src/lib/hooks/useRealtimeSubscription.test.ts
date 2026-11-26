import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '../realtime';
import { PUBLIC_SLOTS_CHANNEL } from '../realtime';

interface MockChannel {
  broadcastHandlers: Map<string, (msg: { payload?: Record<string, unknown> }) => void>;
  postgresHandlers: Array<
    (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => void
  >;
  subscribeStatusCb: ((status: string) => void) | null;
  on: (
    type: string,
    filter: { event?: string; schema?: string; table?: string },
    cb: (payload: Record<string, unknown>) => void,
  ) => MockChannel;
  subscribe: (cb: (status: string) => void) => MockChannel;
}

const mockRemoveChannel = vi.fn(async () => 'ok');
let latestMockChannel: MockChannel | null = null;
let latestChannelName: string | null = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn((name: string) => {
      latestChannelName = name;
      const ch: MockChannel = {
        broadcastHandlers: new Map(),
        postgresHandlers: [],
        subscribeStatusCb: null,
        on(type, filter, cb) {
          if (type === 'broadcast' && filter.event) {
            ch.broadcastHandlers.set(filter.event, cb);
          } else if (type === 'postgres_changes') {
            ch.postgresHandlers.push(cb);
          }
          return ch;
        },
        subscribe(cb) {
          ch.subscribeStatusCb = cb;
          return ch;
        },
      };
      latestMockChannel = ch;
      return ch;
    }),
    removeChannel: mockRemoveChannel,
  })),
}));

import { GET as getRealtimeRoute } from '@/app/api/realtime/route';
import {
  createRealtimeDebouncer,
  mapBroadcastPayloadToRealtimeEvent,
  mapPostgresChangeToRealtimeEvent,
  resolveRealtimeTransportMode,
  subscribeSupabasePublicSlots,
} from './useRealtimeSubscription';

describe('createRealtimeDebouncer', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockRemoveChannel.mockClear();
    latestMockChannel = null;
    latestChannelName = null;
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

describe('Production Supabase Realtime Transport & /api/realtime route', () => {
  afterEach(() => {
    vi.useRealTimers();
    mockRemoveChannel.mockClear();
    latestMockChannel = null;
    latestChannelName = null;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('selects supabase transport only when both public env vars are set and sse in Demo Mode', () => {
    expect(resolveRealtimeTransportMode(undefined, undefined)).toBe('sse');
    expect(resolveRealtimeTransportMode('https://proj.supabase.co', '')).toBe('sse');
    expect(
      resolveRealtimeTransportMode('https://proj.supabase.co', 'public-anon-key'),
    ).toBe('supabase');
  });

  it('maps broadcast and postgres_changes payloads without exposing PII', () => {
    const broadcastEvt = mapBroadcastPayloadToRealtimeEvent(
      'slot_changed',
      {
        type: 'slot_changed',
        staffId: 'staff-karla',
        date: '2026-12-01',
        timestamp: '2026-12-01T15:00:00.000Z',
      },
      '2026-12-01T15:00:01.000Z',
    );
    expect(broadcastEvt).toEqual({
      type: 'slot_changed',
      staffId: 'staff-karla',
      date: '2026-12-01',
      timestamp: '2026-12-01T15:00:00.000Z',
    });

    const holdPgEvt = mapPostgresChangeToRealtimeEvent(
      {
        new: {
          source_kind: 'slot_hold',
          staff_id: 'staff-paty',
          slot_date: '2026-12-02',
        },
      },
      '2026-12-02T10:00:00.000Z',
    );
    expect(holdPgEvt).toEqual({
      type: 'hold_changed',
      staffId: 'staff-paty',
      date: '2026-12-02',
      timestamp: '2026-12-02T10:00:00.000Z',
    });

    const bookingPgEvt = mapPostgresChangeToRealtimeEvent(
      {
        old: {
          source_kind: 'booking',
          staff_id: 'staff-karla',
          slot_date: '2026-12-03',
        },
      },
      '2026-12-03T10:00:00.000Z',
    );
    expect(bookingPgEvt).toEqual({
      type: 'slot_changed',
      staffId: 'staff-karla',
      date: '2026-12-03',
      timestamp: '2026-12-03T10:00:00.000Z',
    });
  });

  it('subscribes to Supabase public-slots broadcast + postgres_changes and cleans up channel on last unsubscribe', async () => {
    const receivedA: RealtimeEvent[] = [];
    const receivedB: RealtimeEvent[] = [];

    const unsubA = subscribeSupabasePublicSlots(
      'https://proj.supabase.co',
      'anon-key-1',
      (evt) => receivedA.push(evt),
    );
    const unsubB = subscribeSupabasePublicSlots(
      'https://proj.supabase.co',
      'anon-key-1',
      (evt) => receivedB.push(evt),
    );

    await vi.waitFor(() => {
      expect(latestMockChannel).not.toBeNull();
    });
    expect(latestChannelName).toBe(PUBLIC_SLOTS_CHANNEL);

    latestMockChannel?.subscribeStatusCb?.('SUBSCRIBED');
    expect(receivedA.map((e) => e.type)).toEqual(['connected']);
    expect(receivedB.map((e) => e.type)).toEqual(['connected']);

    latestMockChannel?.broadcastHandlers.get('slot_changed')?.({
      payload: { type: 'slot_changed', staffId: 'staff-karla', date: '2026-12-01' },
    });
    latestMockChannel?.postgresHandlers[0]?.({
      new: { source_kind: 'slot_hold', staff_id: 'staff-tere', slot_date: '2026-12-02' },
    });

    expect(receivedA.map((e) => e.type)).toEqual([
      'connected',
      'slot_changed',
      'hold_changed',
    ]);
    expect(receivedB.map((e) => e.type)).toEqual([
      'connected',
      'slot_changed',
      'hold_changed',
    ]);

    unsubA();
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    unsubB();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('cancels safely when unsubscribed before lazy @supabase/supabase-js import resolves', async () => {
    const received: RealtimeEvent[] = [];
    const unsub = subscribeSupabasePublicSlots(
      'https://proj.supabase.co',
      'anon-key-cancel',
      (evt) => received.push(evt),
    );
    unsub();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(latestMockChannel).toBeNull();
    expect(mockRemoveChannel).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it('GET /api/realtime returns JSON metadata in Supabase mode and SSE stream in Demo mode', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const supaRes = await getRealtimeRoute();
    expect(supaRes.status).toBe(200);
    expect(supaRes.headers.get('content-type')).toContain('application/json');
    expect(await supaRes.json()).toEqual({
      mode: 'supabase',
      channel: PUBLIC_SLOTS_CHANNEL,
    });

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const demoRes = await getRealtimeRoute();
    expect(demoRes.status).toBe(200);
    expect(demoRes.headers.get('content-type')).toContain('text/event-stream');
    await demoRes.body?.cancel();
  });
});
