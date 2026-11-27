import { describe, expect, it } from 'vitest';
import {
  buildGoogleReviewMessage,
  buildGoogleReviewWhatsAppLink,
  resolveSafeGoogleReviewUrl,
} from './review-request';

describe('Google review WhatsApp helper', () => {
  it('accepts valid HTTPS URLs and rejects empty or unsafe schemes', () => {
    expect(resolveSafeGoogleReviewUrl('https://g.page/r/laikona-nails-puebla/review')).toBe(
      'https://g.page/r/laikona-nails-puebla/review',
    );
    expect(resolveSafeGoogleReviewUrl('  ')).toBeNull();
    expect(resolveSafeGoogleReviewUrl(null)).toBeNull();
    expect(resolveSafeGoogleReviewUrl('http://insecure.example/review')).toBeNull();
    expect(resolveSafeGoogleReviewUrl('javascript:alert(1)')).toBeNull();
  });

  it('builds a polite Spanish review request using only the client first name', () => {
    const message = buildGoogleReviewMessage({
      clientFullName: 'Sofía Martínez',
      salonName: 'LAIKONA NAILS',
      googleReviewUrl: 'https://g.page/r/laikona-nails-puebla/review',
    });
    expect(message).toContain('Hola Sofía');
    expect(message).toContain('LAIKONA NAILS');
    expect(message).toContain('https://g.page/r/laikona-nails-puebla/review');
    expect(message).not.toContain('Martínez');
  });

  it('builds a wa.me link when a valid review URL is configured and returns null otherwise', () => {
    const link = buildGoogleReviewWhatsAppLink({
      phoneE164: '+522221112233',
      clientFullName: 'Valeria Gómez',
      salonName: 'LAIKONA NAILS',
      googleReviewUrl: 'https://g.page/r/laikona-nails-puebla/review',
    });
    expect(link).not.toBeNull();
    expect(link?.startsWith('https://wa.me/522221112233?text=')).toBe(true);
    expect(decodeURIComponent(link ?? '')).toContain(
      'https://g.page/r/laikona-nails-puebla/review',
    );

    expect(
      buildGoogleReviewWhatsAppLink({
        phoneE164: '+522221112233',
        clientFullName: 'Valeria Gómez',
        salonName: 'LAIKONA NAILS',
        googleReviewUrl: null,
      }),
    ).toBeNull();
  });
});
