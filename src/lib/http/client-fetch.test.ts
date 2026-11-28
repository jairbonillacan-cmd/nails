import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CLIENT_FETCH_TIMEOUT_MS,
  fetchBlobWithTimeout,
  fetchJsonWithTimeout,
  parseRetryAfterSeconds,
  sendBestEffortRequest,
} from './client-fetch';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseRetryAfterSeconds', () => {
  it('parses positive integer headers and ignores invalid values', () => {
    expect(parseRetryAfterSeconds('45')).toBe(45);
    expect(parseRetryAfterSeconds(' 12 ')).toBe(12);
    expect(parseRetryAfterSeconds('0')).toBeUndefined();
    expect(parseRetryAfterSeconds('-5')).toBeUndefined();
    expect(parseRetryAfterSeconds('')).toBeUndefined();
    expect(parseRetryAfterSeconds(null)).toBeUndefined();
  });

  it('parses HTTP-date Retry-After headers relative to now', () => {
    const nowMs = Date.parse('2026-12-01T12:00:00.500Z');
    const futureHeader = 'Tue, 01 Dec 2026 12:00:33 GMT';
    expect(parseRetryAfterSeconds(futureHeader, nowMs)).toBe(33);

    const pastHeader = new Date(nowMs - 5_000).toUTCString();
    expect(parseRetryAfterSeconds(pastHeader, nowMs)).toBe(1);
  });
});

describe('fetchJsonWithTimeout', () => {
  it('returns parsed JSON and passes an AbortSignal on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, value: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchJsonWithTimeout<{ ok: boolean; value: number }>('/api/example', {
      method: 'GET',
    });

    expect(DEFAULT_CLIENT_FETCH_TIMEOUT_MS).toBe(15_000);
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { ok: true, value: 42 },
      aborted: false,
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeDefined();
  });

  it('handles 204 No Content without throwing SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    const result = await fetchJsonWithTimeout<Record<string, never>>('/api/logout', {
      method: 'DELETE',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(204);
  });

  it('parses Retry-After and surfaces wait time on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'RATE_LIMITED',
            error: 'Demasiados intentos.',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '45',
            },
          },
        ),
      ),
    );

    const result = await fetchJsonWithTimeout<{ code?: string; error?: string }>('/api/login', {
      method: 'POST',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.reason).toBe('http_error');
      expect(result.retryAfterSeconds).toBe(45);
      expect(result.error).toContain('45 s');
      expect(result.data?.code).toBe('RATE_LIMITED');
    }
  });

  it('provides friendly Spanish fallbacks for bare 429 and 409 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '15' },
        }),
      ),
    );
    const bare429 = await fetchJsonWithTimeout('/api/rate-limit');
    expect(bare429.ok).toBe(false);
    if (!bare429.ok) {
      expect(bare429.status).toBe(429);
      expect(bare429.retryAfterSeconds).toBe(15);
      expect(bare429.error).toContain('15 segundos');
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const bare409 = await fetchJsonWithTimeout('/api/conflict');
    expect(bare409.ok).toBe(false);
    if (!bare409.ok) {
      expect(bare409.status).toBe(409);
      expect(bare409.error).toContain('conflicto');
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Ya existe una clienta con este teléfono.' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const custom409 = await fetchJsonWithTimeout('/api/conflict-custom');
    expect(custom409.ok).toBe(false);
    if (!custom409.ok) {
      expect(custom409.error).toBe('Ya existe una clienta con este teléfono.');
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('', { status: 409 }),
      ),
    );
    const blob409 = await fetchBlobWithTimeout('/api/export');
    expect(blob409.ok).toBe(false);
    if (!blob409.ok) {
      expect(blob409.status).toBe(409);
      expect(blob409.error).toContain('conflicto');
    }
  });

  it('handles non-JSON HTML responses on 502/524 and 200 without throwing SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>524 A Timeout Occurred</body></html>', {
          status: 524,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const html524 = await fetchJsonWithTimeout<{ ok?: boolean }>('/api/test');
    expect(html524.ok).toBe(false);
    if (!html524.ok) {
      expect(html524.status).toBe(524);
      expect(html524.reason).toBe('invalid_json');
      expect(html524.data).toBeNull();
      expect(html524.error).toContain('524');
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>Unexpected HTML</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const html200 = await fetchJsonWithTimeout<{ ok?: boolean }>('/api/test');
    expect(html200.ok).toBe(false);
    if (!html200.ok) {
      expect(html200.status).toBe(200);
      expect(html200.reason).toBe('invalid_json');
      expect(html200.error).toContain('inesperada');
    }
  });

  it('classifies TimeoutError and network TypeError cleanly', async () => {
    const timeoutErr = new Error('The operation timed out');
    timeoutErr.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

    const timedOut = await fetchJsonWithTimeout('/api/slow', { timeoutMs: 500 });
    expect(timedOut.ok).toBe(false);
    if (!timedOut.ok) {
      expect(timedOut.reason).toBe('timeout');
      expect(timedOut.aborted).toBe(false);
      expect(timedOut.error).toContain('tardó demasiado');
    }

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const offline = await fetchJsonWithTimeout('/api/offline');
    expect(offline.ok).toBe(false);
    if (!offline.ok) {
      expect(offline.reason).toBe('network');
      expect(offline.aborted).toBe(false);
      expect(offline.error).toContain('conexión');
    }
  });

  it('distinguishes caller abort from timeout', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const preAborted = await fetchJsonWithTimeout('/api/aborted', {
      signal: controller.signal,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(preAborted.ok).toBe(false);
    if (!preAborted.ok) {
      expect(preAborted.reason).toBe('aborted');
      expect(preAborted.aborted).toBe(true);
    }

    const inFlightController = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        inFlightController.abort();
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }),
    );

    const inFlightAborted = await fetchJsonWithTimeout('/api/in-flight', {
      signal: inFlightController.signal,
    });
    expect(inFlightAborted.ok).toBe(false);
    if (!inFlightAborted.ok) {
      expect(inFlightAborted.reason).toBe('aborted');
      expect(inFlightAborted.aborted).toBe(true);
    }
  });
});

describe('fetchBlobWithTimeout & sendBestEffortRequest', () => {
  it('returns Blob on 200 CSV download and parses JSON error code on 403', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('col1,col2\n1,2\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const csvRes = await fetchBlobWithTimeout('/api/admin/operations?export=csv', {
      timeoutMs: 30_000,
    });
    expect(csvRes.ok).toBe(true);
    if (csvRes.ok) {
      expect(await csvRes.blob.text()).toContain('col1,col2');
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ code: 'OWNER_PIN_REQUIRED', error: 'Se requiere PIN.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const pinRes = await fetchBlobWithTimeout('/api/admin/operations?export=csv');
    expect(pinRes.ok).toBe(false);
    if (!pinRes.ok) {
      expect(pinRes.status).toBe(403);
      expect(pinRes.code).toBe('OWNER_PIN_REQUIRED');
      expect(pinRes.error).toBe('Se requiere PIN.');
    }
  });

  it('swallows rejections safely in sendBestEffortRequest and attaches AbortSignal', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Offline'));
    vi.stubGlobal('fetch', fetchMock);

    expect(() =>
      sendBestEffortRequest('/api/analytics/events', {
        method: 'POST',
        body: JSON.stringify({ eventType: 'page_view' }),
        keepalive: true,
      }),
    ).not.toThrow();

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeDefined();
    expect(init?.keepalive).toBe(true);
  });
});
