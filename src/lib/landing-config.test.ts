import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from './demo-seed';
import {
  DEFAULT_HERO_DESKTOP_IMAGE,
  DEFAULT_HERO_MOBILE_IMAGE,
  isSafeBrandMediaPath,
  resolveLandingContent,
} from './landing-config';
import { buildSalonFaqs } from './seo/structured-data';

describe('landing-config customization and media path allowlist', () => {
  it('resolves editorial defaults when optional customization fields are omitted', () => {
    const { settings } = createInitialDemoDatabase();
    const resolved = resolveLandingContent(settings);

    expect(resolved.heroTitle).toBe('El arte está en tus uñas');
    expect(resolved.heroPrimaryCta).toBe('Agendar cita');
    expect(resolved.heroSecondaryCta).toBe('Ver creaciones');
    expect(resolved.heroImageDesktopUrl).toBe(DEFAULT_HERO_DESKTOP_IMAGE);
    expect(resolved.heroImageMobileUrl).toBe(DEFAULT_HERO_MOBILE_IMAGE);
    expect(resolved.customLogoUrl).toBeNull();
    expect(resolved.galleryMode).toBe('mix');
    expect(resolved.sections.showMarquee).toBe(true);
    expect(resolved.sections.showMenu).toBe(true);
    expect(resolved.sections.showCreations).toBe(true);
    expect(resolved.sections.showFaq).toBe(true);
    expect(resolved.sections.showMapEmbed).toBe(true);
    expect(resolved.visitHoursDays).toBe('Lunes a sábado');
  });

  it('applies custom hero media, section toggles, hours, marquee, and custom FAQs', () => {
    const { settings } = createInitialDemoDatabase();
    const customSettings = {
      ...settings,
      logoUrl: '/api/media/gallery/logo-custom.png',
      coverImageUrl: '/api/media/gallery/hero-custom.webp',
      landingContent: {
        ...settings.landingContent,
        heroTitle: 'Manicure de autor en Puebla',
        heroPrimaryCta: 'Reservar hoy',
        heroSecondaryCta: 'Explorar sets',
        marqueeItems: ['Promo de otoño', 'Softgel desde $450'],
        menuTitle: 'Nuestros servicios',
        menuBannerText: 'Incluye preparación en seco',
        galleryMode: 'custom_only' as const,
        visitHoursDays: 'Martes a domingo',
        visitHoursText: '11:00 a 19:00 · Con cita previa',
        customFaqs: [
          {
            id: 'faq-custom-1',
            question: '¿Hacen diseños personalizados?',
            answer: 'Sí, trae tu foto y cotizamos al instante.',
          },
        ],
        sections: {
          showConnect: false,
          showMapEmbed: false,
        },
      },
    };

    const resolved = resolveLandingContent(customSettings);
    expect(resolved.heroTitle).toBe('Manicure de autor en Puebla');
    expect(resolved.heroPrimaryCta).toBe('Reservar hoy');
    expect(resolved.heroSecondaryCta).toBe('Explorar sets');
    expect(resolved.heroImageDesktopUrl).toBe('/api/media/gallery/hero-custom.webp');
    expect(resolved.heroImageMobileUrl).toBe('/api/media/gallery/hero-custom.webp');
    expect(resolved.customLogoUrl).toBe('/api/media/gallery/logo-custom.png');
    expect(resolved.marqueeItems).toEqual(['Promo de otoño', 'Softgel desde $450']);
    expect(resolved.menuTitle).toBe('Nuestros servicios');
    expect(resolved.menuBannerText).toBe('Incluye preparación en seco');
    expect(resolved.galleryMode).toBe('custom_only');
    expect(resolved.visitHoursDays).toBe('Martes a domingo');
    expect(resolved.visitHoursText).toBe('11:00 a 19:00 · Con cita previa');
    expect(resolved.sections.showConnect).toBe(false);
    expect(resolved.sections.showMapEmbed).toBe(false);
    expect(resolved.sections.showMenu).toBe(true);

    const faqs = buildSalonFaqs(customSettings);
    expect(faqs).toHaveLength(1);
    expect(faqs[0]?.question).toBe('¿Hacen diseños personalizados?');
  });

  it('allows only safe studio and public gallery paths and blocks external or private paths', () => {
    expect(isSafeBrandMediaPath('/landing/hero-escritorio.webp')).toBe(true);
    expect(isSafeBrandMediaPath('/brand/logo.png')).toBe(true);
    expect(isSafeBrandMediaPath('/api/media/gallery/a1b2c3d4-1234.webp')).toBe(true);

    expect(isSafeBrandMediaPath('https://evil.example/hero.png')).toBe(false);
    expect(isSafeBrandMediaPath('//evil.example/hero.png')).toBe(false);
    expect(isSafeBrandMediaPath('/api/media/proofs/secret.png')).toBe(false);
    expect(isSafeBrandMediaPath('/api/media/inspo/private.jpg')).toBe(false);
    expect(isSafeBrandMediaPath('/api/media/gallery/../proofs/secret.png')).toBe(false);
    expect(isSafeBrandMediaPath('javascript:alert(1)')).toBe(false);
    expect(isSafeBrandMediaPath('')).toBe(false);
  });

  it('serves updated photos for saved paths to the original built-in hero images', () => {
    const { settings } = createInitialDemoDatabase();
    const resolved = resolveLandingContent({
      ...settings,
      landingContent: {
        ...settings.landingContent,
        heroImageDesktopUrl: '/landing/hero-escritorio.webp',
        heroImageMobileUrl: '/landing/hero-movil.webp',
      },
    });

    expect(resolved.heroImageDesktopUrl).toBe(DEFAULT_HERO_DESKTOP_IMAGE);
    expect(resolved.heroImageMobileUrl).toBe(DEFAULT_HERO_MOBILE_IMAGE);
  });
});
