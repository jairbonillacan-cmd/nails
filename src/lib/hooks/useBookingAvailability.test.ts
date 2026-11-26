import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayAvailabilitySummary } from '@/lib/availability/engine';
import { fetchAvailabilityWindow } from '@/components/booking/bookingApi';
import {
  createBookingAvailabilityController,
  createBookingAvailabilityStore,
  DEFAULT_AVAILABILITY_TTL_MS,
  isAvailabilityRealtimeEvent,
  matchesInvalidationFilter,
  type AvailabilityWindowFetcher,
  type BookingAvailabilityQuery,
  type BookingAvailabilityState,
} from './useBookingAvailability';

function makeDays(startDate: string, slotCount = 2): DayAvailabilitySummary[] {
  const parts = startDate.split('-').map(Number);
  const year = parts[0] ?? 2026;
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;
  return [0, 1, 2].map((offset) => {
    const dt = new Date(Date.UTC(year, month, day + offset, 12, 0, 0));
    const dateKey = dt.toISOString().slice(0, 10);
    return {
      date: dateKey,
      hasSlots: slotCount > 0,
      slotCount,
      slots: Array.from({ length: slotCount }, (_, idx) => ({
        startAt: `${dateKey}T${String(16 + idx * 2).padStart(2, '0')}:00:00.000Z`,
        endAt: `${dateKey}T${String(18 + idx * 2).padStart(2, '0')}:00:00.000Z`,
        occupiedStartAt: `${dateKey}T${String(16 + idx * 2).padStart(2, '0')}:00:00.000Z`,
        occupiedEndAt: `${dateKey}T${String(18 + idx * 2).padStart(2, '0')}:00:00.000Z`,
        staffId: 'staff-karla',
        staffName: 'Karla',
        localTime24: `${String(10 + idx * 2).padStart(2, '0')}:00`,
        localTime12: `${10 + idx * 2}:00 a.m.`,
        period: 'morning',
        availableStaffIds: ['staff-karla'],
      })),
    };
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const RUBBER_NOV: BookingAvailabilityQuery = {
  serviceId: 'srv-rubber',
  extraServiceIds: ['srv-retiro', 'srv-pedi'],
  addonIds: ['addon-chrome', 'addon-french'],
  staffId: 'any',
  windowStartDate: '2026-11-26',
};

const RUBBER_DEC: BookingAvailabilityQuery = {
  serviceId: 'srv-rubber',
  extraServiceIds: ['srv-retiro', 'srv-pedi'],
  addonIds: ['addon-chrome', 'addon-french'],
  staffId: 'any',
  windowStartDate: '2026-12-01',
};

const SOFTGEL_NOV: BookingAvailabilityQuery = {
  serviceId: 'srv-softgel',
  extraServiceIds: [],
  addonIds: [],
  staffId: 'any',
  windowStartDate: '2026-11-26',
};

describe('createBookingAvailabilityStore', () => {
  it('returns cache hits for equivalent normalized keys and deduplicates in-flight promises', async () => {
    let clock = 1_000_000;
    const deferred = createDeferred<DayAvailabilitySummary[] | null>();
    const fetcher = vi.fn<AvailabilityWindowFetcher>(() => deferred.promise);

    const store = createBookingAvailabilityStore({
      fetcher,
      now: () => clock,
      freshTtlMs: DEFAULT_AVAILABILITY_TTL_MS,
    });

    const reorderedQuery: BookingAvailabilityQuery = {
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-pedi', 'srv-retiro', 'srv-pedi'],
      addonIds: ['addon-french', 'addon-chrome'],
      staffId: 'any',
      windowStartDate: '2026-11-26',
    };

    const p1 = store.load(RUBBER_NOV);
    const p2 = store.load(reorderedQuery);
    expect(fetcher).toHaveBeenCalledTimes(1);

    const expectedDays = makeDays('2026-11-26');
    deferred.resolve(expectedDays);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(expectedDays);
    expect(r2).toEqual(expectedDays);

    clock += 10_000;
    const cached = await store.load(reorderedQuery);
    expect(cached).toEqual(expectedDays);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.size()).toBe(1);
  });

  it('marks entries stale after TTL and serves stale-while-revalidate seamlessly', async () => {
    let clock = 2_000_000;
    const initialDays = makeDays('2026-11-26', 2);
    const refreshedDays = makeDays('2026-11-26', 1);
    const refreshDeferred = createDeferred<DayAvailabilitySummary[] | null>();

    const fetcher = vi
      .fn<AvailabilityWindowFetcher>()
      .mockResolvedValueOnce(initialDays)
      .mockImplementationOnce(() => refreshDeferred.promise);

    const store = createBookingAvailabilityStore({
      fetcher,
      now: () => clock,
      freshTtlMs: 45_000,
    });

    const states: BookingAvailabilityState[] = [];
    const controller = createBookingAvailabilityController({
      store,
      onStateChange: (next) => states.push(next),
    });

    await controller.activate(RUBBER_NOV);
    expect(controller.getState().days).toEqual(initialDays);
    expect(controller.getState().isLoading).toBe(false);

    clock += 46_000;
    expect(store.peek(RUBBER_NOV)?.isStale).toBe(true);

    const revalidatePromise = controller.activate(RUBBER_NOV);
    expect(controller.getState().days).toEqual(initialDays);
    expect(controller.getState().isLoading).toBe(false);
    expect(controller.getState().isRevalidating).toBe(true);

    refreshDeferred.resolve(refreshedDays);
    await revalidatePromise;

    expect(controller.getState().days).toEqual(refreshedDays);
    expect(controller.getState().isLoading).toBe(false);
    expect(controller.getState().isRevalidating).toBe(false);
    expect(states.some((s) => s.isRevalidating && s.days.length === initialDays.length)).toBe(true);
    controller.dispose();
  });

  it('aborts stale requests via AbortController on rapid service and staff switches', async () => {
    const signals: AbortSignal[] = [];
    const deferreds = [
      createDeferred<DayAvailabilitySummary[] | null>(),
      createDeferred<DayAvailabilitySummary[] | null>(),
      createDeferred<DayAvailabilitySummary[] | null>(),
    ];
    let callIdx = 0;

    const fetcher = vi.fn<AvailabilityWindowFetcher>((input) => {
      if (input.signal) signals.push(input.signal);
      const current = deferreds[callIdx];
      callIdx += 1;
      return current?.promise ?? Promise.resolve([]);
    });

    const store = createBookingAvailabilityStore({ fetcher });
    const controller = createBookingAvailabilityController({
      store,
      onStateChange: () => undefined,
    });

    const karlaQuery: BookingAvailabilityQuery = {
      ...SOFTGEL_NOV,
      staffId: 'staff-karla',
    };

    const p1 = controller.activate(RUBBER_NOV);
    const p2 = controller.activate(SOFTGEL_NOV);
    const p3 = controller.activate(karlaQuery);

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(true);
    expect(signals[2]?.aborted).toBe(false);

    const staleRubberDays = makeDays('2026-11-26', 3);
    const finalKarlaDays = makeDays('2026-11-26', 1);

    deferreds[0]?.resolve(staleRubberDays);
    deferreds[1]?.resolve(makeDays('2026-11-26', 2));
    deferreds[2]?.resolve(finalKarlaDays);

    await Promise.all([p1, p2, p3]);

    expect(controller.getState().days).toEqual(finalKarlaDays);
    expect(controller.getState().isLoading).toBe(false);
    expect(store.getFresh(RUBBER_NOV)).toBeNull();
    expect(store.getFresh(karlaQuery)).toEqual(finalKarlaDays);
    controller.dispose();
  });

  it('supports Step 1 prefetch leading to 0ms Step 2 cache hit and next-month background prefetch', async () => {
    const novDays = makeDays('2026-11-26', 2);
    const decDays = makeDays('2026-12-01', 3);

    const fetcher = vi.fn<AvailabilityWindowFetcher>(async (input) => {
      if (input.startDate === '2026-12-01') return decDays;
      return novDays;
    });

    const store = createBookingAvailabilityStore({ fetcher });
    const states: BookingAvailabilityState[] = [];
    const controller = createBookingAvailabilityController({
      store,
      onStateChange: (next) => states.push(next),
    });

    await controller.activate(RUBBER_NOV, { nextWindowStartDate: null });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(controller.getState().days).toEqual(novDays);

    const statesBeforeStep2 = states.length;
    await controller.activate(RUBBER_NOV, { nextWindowStartDate: '2026-12-01' });
    await flushMicrotasks();

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ startDate: '2026-12-01', serviceId: 'srv-rubber' }),
    );
    expect(store.getFresh(RUBBER_DEC)).toEqual(decDays);
    expect(states.slice(statesBeforeStep2).some((s) => s.isLoading)).toBe(false);

    const statesBeforeNextMonth = states.length;
    await controller.activate(RUBBER_DEC, { nextWindowStartDate: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(controller.getState().days).toEqual(decDays);
    expect(controller.getState().isLoading).toBe(false);
    expect(states.slice(statesBeforeNextMonth).some((s) => s.isLoading)).toBe(false);
    controller.dispose();
  });

  it('invalidates only affected cache entries on realtime events and revalidates active view without empty flash', async () => {
    const karlaNov: BookingAvailabilityQuery = {
      ...RUBBER_NOV,
      staffId: 'staff-karla',
    };
    const patyNov: BookingAvailabilityQuery = {
      ...RUBBER_NOV,
      staffId: 'staff-paty',
    };
    const initialKarlaDays = makeDays('2026-11-26', 2);
    const initialPatyDays = makeDays('2026-11-26', 3);
    const updatedKarlaDays = makeDays('2026-11-26', 1);
    const refreshDeferred = createDeferred<DayAvailabilitySummary[] | null>();
    let karlaCalls = 0;

    const fetcher = vi.fn<AvailabilityWindowFetcher>((input) => {
      if (input.staffId === 'staff-paty') return Promise.resolve(initialPatyDays);
      karlaCalls += 1;
      if (karlaCalls === 1) return Promise.resolve(initialKarlaDays);
      return refreshDeferred.promise;
    });

    const store = createBookingAvailabilityStore({ fetcher });
    const states: BookingAvailabilityState[] = [];
    const controller = createBookingAvailabilityController({
      store,
      onStateChange: (next) => states.push(next),
    });

    await controller.activate(karlaNov);
    await store.prefetch(patyNov);
    expect(store.size()).toBe(2);

    const patyEventAffectedActive = controller.invalidateFromRealtime({
      staffId: 'staff-paty',
      date: '2026-11-27',
    });
    expect(patyEventAffectedActive).toBe(false);
    expect(store.getFresh(patyNov)).toBeNull();
    expect(store.getFresh(karlaNov)).toEqual(initialKarlaDays);

    await store.prefetch(patyNov);
    const stateCountBeforeRealtime = states.length;
    const karlaEventAffectedActive = controller.invalidateFromRealtime({
      staffId: 'staff-karla',
      date: '2026-11-27',
    });
    expect(karlaEventAffectedActive).toBe(true);
    expect(store.getFresh(karlaNov)).toBeNull();
    expect(store.getFresh(patyNov)).toEqual(initialPatyDays);

    expect(controller.getState().days).toEqual(initialKarlaDays);
    expect(controller.getState().isLoading).toBe(false);
    expect(controller.getState().isRevalidating).toBe(true);

    refreshDeferred.resolve(updatedKarlaDays);
    await flushMicrotasks();

    expect(controller.getState().days).toEqual(updatedKarlaDays);
    expect(controller.getState().isLoading).toBe(false);
    expect(controller.getState().isRevalidating).toBe(false);
    expect(
      states
        .slice(stateCountBeforeRealtime)
        .some((s) => s.isLoading || s.days.length === 0),
    ).toBe(false);

    controller.dispose();
  });

  it('recognizes realtime availability events and scopes invalidation filters accurately', () => {
    expect(isAvailabilityRealtimeEvent('slot_changed')).toBe(true);
    expect(isAvailabilityRealtimeEvent('hold_changed')).toBe(true);
    expect(isAvailabilityRealtimeEvent('schedule_changed')).toBe(true);
    expect(isAvailabilityRealtimeEvent('connected')).toBe(false);

    const days = makeDays('2026-11-26', 2);
    expect(matchesInvalidationFilter(RUBBER_NOV, days, undefined)).toBe(true);
    expect(
      matchesInvalidationFilter(RUBBER_NOV, days, {
        staffId: 'staff-karla',
        date: '2026-11-27',
      }),
    ).toBe(true);
    expect(
      matchesInvalidationFilter(
        { ...RUBBER_NOV, staffId: 'staff-paty' },
        days,
        { staffId: 'staff-karla', date: '2026-11-27' },
      ),
    ).toBe(false);
    expect(
      matchesInvalidationFilter(RUBBER_NOV, days, { date: '2026-12-20' }),
    ).toBe(false);
  });

  it('prevents pre-invalidation in-flight responses from poisoning cache and supports bounded LRU + clear', async () => {
    const staleDeferred = createDeferred<DayAvailabilitySummary[] | null>();
    const freshDays = makeDays('2026-11-26', 1);
    let callCount = 0;

    const fetcher = vi.fn<AvailabilityWindowFetcher>(() => {
      callCount += 1;
      if (callCount === 1) return staleDeferred.promise;
      return Promise.resolve(freshDays);
    });

    const store = createBookingAvailabilityStore({ fetcher, maxEntries: 2 });
    const firstLoad = store.load(RUBBER_NOV);

    store.invalidate({ date: '2026-11-26' });
    const secondLoad = store.load(RUBBER_NOV);

    staleDeferred.resolve(makeDays('2026-11-26', 4));
    await Promise.all([firstLoad, secondLoad]);

    expect(store.getFresh(RUBBER_NOV)).toEqual(freshDays);

    await store.prefetch(SOFTGEL_NOV);
    await store.prefetch(RUBBER_DEC);
    expect(store.size()).toBe(2);

    store.clear();
    expect(store.size()).toBe(0);
  });

  it('aborts superseded hover prefetch requests when prefetchWindow switches targets rapidly', async () => {
    const signals: AbortSignal[] = [];
    const deferredA = createDeferred<DayAvailabilitySummary[] | null>();
    const deferredB = createDeferred<DayAvailabilitySummary[] | null>();
    let calls = 0;

    const fetcher = vi.fn<AvailabilityWindowFetcher>((input) => {
      if (input.signal) signals.push(input.signal);
      calls += 1;
      return calls === 1 ? deferredA.promise : deferredB.promise;
    });

    const store = createBookingAvailabilityStore({ fetcher });
    const controller = createBookingAvailabilityController({
      store,
      onStateChange: () => undefined,
    });

    const pA = controller.prefetchWindow(RUBBER_NOV);
    const pB = controller.prefetchWindow(SOFTGEL_NOV);

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    const softgelDays = makeDays('2026-11-26', 2);
    deferredA.resolve(makeDays('2026-11-26', 1));
    deferredB.resolve(softgelDays);
    await Promise.all([pA, pB]);

    expect(store.getFresh(RUBBER_NOV)).toBeNull();
    expect(store.getFresh(SOFTGEL_NOV)).toEqual(softgelDays);
    controller.dispose();
  });
});

describe('fetchAvailabilityWindow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds canonical sorted query parameters, forwards AbortSignal, and handles abort cleanly', async () => {
    const days = makeDays('2026-11-26', 2);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ days }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const result = await fetchAvailabilityWindow({
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-pedi', 'srv-retiro', 'srv-rubber'],
      addonIds: ['addon-b', 'addon-a'],
      staffId: 'staff-karla',
      startDate: '2026-11-26',
      signal: controller.signal,
    });

    expect(result).toEqual(days);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/availability?serviceId=srv-rubber&addonIds=addon-a%2Caddon-b&startDate=2026-11-26&days=35&extraServiceIds=srv-pedi%2Csrv-retiro&staffId=staff-karla',
      expect.objectContaining({
        cache: 'no-store',
        signal: controller.signal,
      }),
    );

    const abortedController = new AbortController();
    abortedController.abort();
    const abortedResult = await fetchAvailabilityWindow({
      serviceId: 'srv-rubber',
      extraServiceIds: [],
      addonIds: [],
      staffId: 'any',
      startDate: '2026-11-26',
      signal: abortedController.signal,
    });
    expect(abortedResult).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
