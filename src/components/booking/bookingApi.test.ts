import { afterEach, describe, expect, it, vi } from 'vitest';
import { submitBookingRequest } from './bookingApi';

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
  sessionToken: 'sess-test-1',
  privacyConsentAccepted: true,
  marketingOptIn: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
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

  it('passes an AbortSignal timeout and resolves valid manageUrl or manageToken', async () => {
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
  });
});
