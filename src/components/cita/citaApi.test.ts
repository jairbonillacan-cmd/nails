import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRescheduleAvailability,
  patchManageBooking,
  postManageBookingReview,
} from './citaApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('citaApi resilience', () => {
  it('returns structured error instead of empty days when availability returns 500 or HTML', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Servicio no disponible.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const res500 = await fetchRescheduleAvailability({
      serviceId: 'srv-1',
      extraServiceIdsKey: '',
      addonIdsKey: '',
      staffId: 'staff-1',
      startDate: '2026-12-01',
      manageToken: 'tok-12345678',
    });

    expect(res500).toEqual({
      ok: false,
      aborted: false,
      error: 'Servicio no disponible.',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>524 Timeout</body></html>', {
          status: 524,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const html524 = await fetchRescheduleAvailability({
      serviceId: 'srv-1',
      extraServiceIdsKey: '',
      addonIdsKey: '',
      staffId: 'staff-1',
      startDate: '2026-12-01',
      manageToken: 'tok-12345678',
    });

    expect(html524.ok).toBe(false);
    if (!html524.ok) {
      expect(html524.aborted).toBe(false);
      expect(html524.error).toContain('524');
    }
  });

  it('handles non-JSON 502 HTML and 429 Retry-After cleanly in patchManageBooking and postManageBookingReview', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    const patchHtml = await patchManageBooking('tok-12345678', {
      action: 'upload_proof',
      paymentProofUrl: 'https://www.mercadopago.com.mx/receipt/123',
    });
    expect(patchHtml.ok).toBe(false);
    expect(patchHtml.status).toBe(502);
    expect(patchHtml.data.error).toContain('502');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Demasiados intentos.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '20' },
        }),
      ),
    );

    const reviewRateLimited = await postManageBookingReview('tok-12345678', 5, 'Excelente');
    expect(reviewRateLimited.ok).toBe(false);
    expect(reviewRateLimited.error).toContain('20 s');
  });
});
