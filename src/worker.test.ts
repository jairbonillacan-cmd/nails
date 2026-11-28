import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openNextFetchMock = vi.fn<
  (request: Request, env: Record<string, unknown>, ctx: unknown) => Promise<Response>
>();

vi.mock('../.open-next/worker.js', () => ({
  default: {
    fetch: (request: Request, env: Record<string, unknown>, ctx: unknown) =>
      openNextFetchMock(request, env, ctx),
  },
}));

import worker from '../worker';

function makeContext() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };
}

function makeController(cron: string) {
  return {
    cron,
    scheduledTime: Date.parse('2026-12-01T09:00:00.000Z'),
    noRetry: vi.fn(),
  };
}

describe('worker.ts Cloudflare Worker entrypoint & cron dispatcher', () => {
  beforeEach(() => {
    openNextFetchMock.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('routes */15 * * * * to /api/cron/reminders and 0 9 * * * to /api/cron/retention without redundant waitUntil', async () => {
    openNextFetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    const ctx = makeContext();

    await worker.scheduled(
      makeController('*/15 * * * *'),
      { CRON_SECRET: 'secret-123', NEXT_PUBLIC_APP_URL: 'https://laikona.devand.net' },
      ctx,
    );

    expect(ctx.waitUntil).not.toHaveBeenCalled();
    expect(openNextFetchMock).toHaveBeenCalledTimes(1);
    const req1 = openNextFetchMock.mock.calls[0]?.[0];
    expect(req1?.method).toBe('POST');
    expect(req1?.url).toBe('https://laikona.devand.net/api/cron/reminders');
    expect(req1?.headers.get('authorization')).toBe('Bearer secret-123');
    expect(req1?.signal).toBeDefined();

    await worker.scheduled(
      makeController('0 9 * * *'),
      { CRON_SECRET: 'secret-123', NEXT_PUBLIC_APP_URL: 'invalid-url' },
      ctx,
    );

    expect(openNextFetchMock).toHaveBeenCalledTimes(2);
    const req2 = openNextFetchMock.mock.calls[1]?.[0];
    expect(req2?.url).toBe('https://internal.laikona/api/cron/retention');
  });

  it('throws on unrecognized cron expressions instead of silently falling back to reminders', async () => {
    const ctx = makeContext();
    await expect(
      worker.scheduled(makeController('0 0 * * *'), { CRON_SECRET: 'secret-123' }, ctx),
    ).rejects.toThrow(/Unrecognized scheduled cron expression/);
    expect(openNextFetchMock).not.toHaveBeenCalled();
  });

  it('throws when CRON_SECRET is missing or downstream returns non-2xx HTTP status', async () => {
    const ctx = makeContext();
    await expect(
      worker.scheduled(makeController('*/15 * * * *'), { CRON_SECRET: '   ' }, ctx),
    ).rejects.toThrow(/CRON_SECRET is not configured/);
    expect(openNextFetchMock).not.toHaveBeenCalled();

    openNextFetchMock.mockResolvedValueOnce(
      new Response('{"error":"upstream failed"}', { status: 500 }),
    );
    await expect(
      worker.scheduled(makeController('*/15 * * * *'), { CRON_SECRET: 'secret-123' }, ctx),
    ).rejects.toThrow(/failed with HTTP 500/);
  });

  it('aborts and rejects when a scheduled cron handler hangs past 25 seconds', async () => {
    vi.useFakeTimers();
    openNextFetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const ctx = makeContext();

    const task = worker.scheduled(
      makeController('*/15 * * * *'),
      { CRON_SECRET: 'secret-123' },
      ctx,
    );
    const assertion = expect(task).rejects.toThrow(/timed out after 25000ms/);
    await vi.advanceTimersByTimeAsync(25_100);
    await assertion;
  });

  it('delegates HTTP fetch directly to openNextHandler.fetch', async () => {
    const expected = new Response('ok', { status: 200 });
    openNextFetchMock.mockResolvedValueOnce(expected);
    const req = new Request('https://laikona.devand.net/');
    const env = {};
    const ctx = makeContext();

    const res = await worker.fetch(req, env, ctx);
    expect(res).toBe(expected);
    expect(openNextFetchMock).toHaveBeenCalledWith(req, env, ctx);
  });
});
