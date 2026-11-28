import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AvailableSlot } from '@/lib/availability/engine';
import { requestSlotHold, submitBookingRequest } from './bookingApi';

const BASE_PAYLOAD = {
  serviceId: 'srv-rubber',
  extraServiceIds: [],
  addonIds: [],
  staffId: 'staff-karla',
  startAt: '2026-12-01T16:00:00.000Z',
  clientName: 'Ana Prueba',
  clientPhone: '+522221234567',
  clientInstagram: null,
  clientEmail: null,
  clientBirthday: null,
  clientNotes: '',
  inspoPhotoUrl: null,
  paymentProofUrl: null,
  proofDeliveryMethod: 'none' as const,
  couponCode: null,
  privacyConsentAccepted: true,
  marketingOptIn: false,
};

const BASE_HOLD_INPUT = {
  serviceId: 'srv-rubber',
  extraServiceIds: ['srv-retiro'],
  addonIds: ['addon-chrome'],
  staffId: 'staff-karla',
  startAt: '2026-12-01T16:00:00.000Z',
};

const SUGGESTED_SLOT: AvailableSlot = {
  startAt: '2026-12-01T19:30:00.000Z',
  endAt: '2026-12-01T21:30:00.000Z',
  occupiedStartAt: '2026-12-01T19:30:00.000Z',
  occupiedEndAt: '2026-12-01T21:30:00.000Z',
  staffId: 'staff-paty',
  staffName: 'Paty',
  localTime24: '13:30',
  localTime12: '1:30 p.m.',
  period: 'afternoon',
  availableStaffIds: ['staff-paty'],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requestSlotHold discriminated union', () => {
  it('returns held on 200 with valid hold payload, omits sessionToken, and forwards waitlistOfferToken', async () => {
    const expiresIso = '2026-12-01T16:05:00.000Z';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          holdId: 'hold-abc',
          hold: { id: 'hold-abc', holdId: 'hold-abc', expiresAt: expiresIso },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestSlotHold({
      ...BASE_HOLD_INPUT,
      waitlistOfferToken: '  offer-token-99  ',
    });

    expect(result).toEqual({
      kind: 'held',
      holdId: 'hold-abc',
      holdExpiresAt: Date.parse(expiresIso),
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeDefined();
    const sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('sessionToken');
    expect(sentBody.waitlistOfferToken).toBe('offer-token-99');
  });

  it('returns held with null ids when server reports slot holds are disabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ disabled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await requestSlotHold(BASE_HOLD_INPUT);
    expect(result).toEqual({ kind: 'held', holdId: null, holdExpiresAt: null });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('waitlistOfferToken');
    expect(sentBody).not.toHaveProperty('sessionToken');
  });

  it('returns conflict with suggested slots on 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'SLOT_TAKEN',
            error: 'Ese horario se acaba de ocupar.',
            suggestedSlots: [SUGGESTED_SLOT],
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const result = await requestSlotHold(BASE_HOLD_INPUT);
    expect(result).toEqual({
      kind: 'conflict',
      error: 'Ese horario se acaba de ocupar.',
      suggestedSlots: [SUGGESTED_SLOT],
    });
  });

  it('returns rate_limited with Retry-After seconds on 429', async () => {
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

    const result = await requestSlotHold(BASE_HOLD_INPUT);
    expect(result).toEqual({
      kind: 'rate_limited',
      error: 'Demasiados intentos.',
      retryAfterSeconds: 45,
    });
  });

  it('returns policy on 400 and 422 responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'BOOKING_WINDOW_EXCEEDED',
            error: 'La fecha elegida rebasa la ventana permitida.',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const res400 = await requestSlotHold(BASE_HOLD_INPUT);
    expect(res400).toEqual({
      kind: 'policy',
      code: 'BOOKING_WINDOW_EXCEEDED',
      error: 'La fecha elegida rebasa la ventana permitida.',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'INVALID_INPUT',
            error: 'Servicio no válido.',
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const res422 = await requestSlotHold(BASE_HOLD_INPUT);
    expect(res422).toEqual({
      kind: 'policy',
      code: 'INVALID_INPUT',
      error: 'Servicio no válido.',
    });
  });

  it('returns unavailable on 500, malformed 200, non-JSON HTML, network failure, and timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Error interno al apartar.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const res500 = await requestSlotHold(BASE_HOLD_INPUT);
    expect(res500).toEqual({
      kind: 'unavailable',
      status: 500,
      error: 'Error interno al apartar.',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ hold: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const malformed200 = await requestSlotHold(BASE_HOLD_INPUT);
    expect(malformed200.kind).toBe('unavailable');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    const html502 = await requestSlotHold(BASE_HOLD_INPUT);
    expect(html502.kind).toBe('unavailable');
    if (html502.kind === 'unavailable') {
      expect(html502.status).toBe(502);
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
    const html200 = await requestSlotHold(BASE_HOLD_INPUT);
    expect(html200.kind).toBe('unavailable');

    const timeoutErr = new Error('Timed out');
    timeoutErr.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));
    const timedOut = await requestSlotHold(BASE_HOLD_INPUT);
    expect(timedOut.kind).toBe('unavailable');
    if (timedOut.kind === 'unavailable') {
      expect(timedOut.error).toContain('tardó demasiado');
    }

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const offline = await requestSlotHold(BASE_HOLD_INPUT);
    expect(offline.kind).toBe('unavailable');
    if (offline.kind === 'unavailable') {
      expect(offline.error).toContain('conexión');
    }
  });
});

describe('submitBookingRequest resilience', () => {
  it('returns an actionable error instead of throwing on timeout or abort', async () => {
    const timeoutErr = new Error('The operation timed out');
    timeoutErr.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));

    const result = await submitBookingRequest('idem-timeout', BASE_PAYLOAD);
    expect(result).toEqual({
      kind: 'error',
      code: 'REQUEST_TIMEOUT',
      error:
        'La solicitud tardó demasiado en responder. Revisa tu conexión o consulta «Mis citas» antes de intentar de nuevo.',
    });
  });

  it('returns an actionable error when the gateway responds with non-JSON HTML (e.g. 502/524)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>524 A Timeout Occurred</body></html>', {
          status: 524,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const result = await submitBookingRequest('idem-html', BASE_PAYLOAD);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('HTTP_524');
      expect(result.error).toContain('tardó demasiado');
    }
  });

  it('rejects a 201 payload that is missing both manageUrl and booking.manageToken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ booking: {} }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await submitBookingRequest('idem-missing-url', BASE_PAYLOAD);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.code).toBe('MISSING_MANAGE_URL');
    }
  });

  it('passes an AbortSignal timeout, omits sessionToken, and resolves valid manageUrl or manageToken', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ booking: { manageToken: 'abc123token' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitBookingRequest('idem-ok', BASE_PAYLOAD);
    expect(result).toEqual({
      kind: 'ok',
      manageUrl: '/cita/abc123token',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeDefined();
    const sentBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('sessionToken');
  });
});
