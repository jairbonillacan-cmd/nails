import { describe, expect, it } from 'vitest';
import { buildCheckoutReceiptWhatsAppUrl } from './receipt';

const BASE_SETTINGS = {
  name: 'LAIKONA NAILS',
  currency: 'MXN' as const,
  timezone: 'America/Mexico_City',
};

const BASE_BOOKING = {
  bookingCode: 'NL-1042',
  startAt: '2026-11-27T17:30:00.000Z',
  client: {
    fullName: 'Sofía Ramírez',
    phoneE164: '+522224123987',
  },
  service: { name: 'Rubber' },
  staff: { name: 'Karla' },
  addons: [{ name: 'Diseño francés' }],
};

function decodeWaText(url: string | null): string {
  expect(url).not.toBeNull();
  const parsed = new URL(url ?? '');
  return parsed.searchParams.get('text') ?? '';
}

describe('buildCheckoutReceiptWhatsAppUrl', () => {
  it('builds a polite Mexican Spanish receipt URL with 12h time, currency, tips, and stamp progress', () => {
    const url = buildCheckoutReceiptWhatsAppUrl({
      settings: BASE_SETTINGS,
      booking: BASE_BOOKING,
      paidCents: 46000,
      totalTipsCents: 5000,
      stampAwarded: true,
      stampsCount: 7,
      stampsRequired: 8,
    });

    expect(url).toMatch(/^https:\/\/wa\.me\/522224123987\?text=/);
    const text = decodeWaText(url);
    expect(text).toContain('Hola Sofía, ¡gracias por tu visita a LAIKONA NAILS!');
    expect(text).toContain('Comprobante de cobro (NL-1042)');
    expect(text).toContain('Servicio: Rubber + Diseño francés');
    expect(text).toContain('Con: Karla');
    expect(text).toMatch(/11:30\s*a\.?\s?m\./i);
    expect(text).not.toContain('a.m..');
    expect(text).not.toContain('p.m..');
    expect(text).toContain('Total pagado: $460');
    expect(text).toContain('Propina: $50');
    expect(text).toContain('Tarjeta de sellos: +1 sello (7/8 para tu próximo premio).');
    expect(text).not.toContain('522224123987');
    expect(text).not.toContain('Ramírez');
  });

  it('handles reward-ready stamps, redeemed rewards, and redeemed packages cleanly', () => {
    const rewardReadyUrl = buildCheckoutReceiptWhatsAppUrl({
      settings: BASE_SETTINGS,
      booking: BASE_BOOKING,
      paidCents: 35000,
      stampAwarded: true,
      stampsCount: 8,
      stampsRequired: 8,
    });
    expect(decodeWaText(rewardReadyUrl)).toContain(
      'Tarjeta de sellos: +1 sello (8/8 — ¡ya tienes tu premio listo!).',
    );

    const packageUrl = buildCheckoutReceiptWhatsAppUrl({
      settings: BASE_SETTINGS,
      booking: { ...BASE_BOOKING, addons: [] },
      paidCents: 0,
      redeemedPackageName: 'Paquete 4 Rubber',
      redeemedReward: true,
    });
    const pkgText = decodeWaText(packageUrl);
    expect(pkgText).toContain('Paquete aplicado: Paquete 4 Rubber (-1 sesión)');
    expect(pkgText).not.toContain('Total pagado:');
    expect(pkgText).toContain('Tarjeta de sellos: premio canjeado en esta visita.');
  });

  it('returns null when the client phone has fewer than 10 digits', () => {
    const url = buildCheckoutReceiptWhatsAppUrl({
      settings: BASE_SETTINGS,
      booking: {
        ...BASE_BOOKING,
        client: { fullName: 'Sofía', phoneE164: '12345' },
      },
      paidCents: 35000,
    });
    expect(url).toBeNull();
  });
});
