import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from '@/lib/demo-seed';
import { toPublicServiceDTO, toPublicSettingsDTO } from '@/lib/public-dto';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import {
  SALON_FAQS,
  buildBookingBreadcrumbStructuredData,
  buildHomeStructuredData,
  buildSalonFaqs,
  buildServiceStructuredData,
  serializeJsonLd,
} from './structured-data';

function buildFixture() {
  const db = createInitialDemoDatabase();
  const settings = toPublicSettingsDTO(db.settings);
  const publicServices = db.services
    .filter((s) => s.isActive && !s.isPrivate)
    .map(toPublicServiceDTO);
  return { db, settings, publicServices };
}

describe('structured-data pure SEO builders', () => {
  it('provides 6 truthful Spanish Puebla FAQs synchronized with salon settings', () => {
    expect(SALON_FAQS).toHaveLength(6);
    expect(SALON_FAQS[0]?.answer).toContain('$200 MXN');
    expect(SALON_FAQS[1]?.answer).toContain('12 horas');
    expect(SALON_FAQS[2]?.answer).toContain('21 días');
    expect(SALON_FAQS[3]?.answer).toContain('Calle 25 Sur 1904');
    expect(SALON_FAQS[4]?.answer).toContain('Extras');
    expect(SALON_FAQS[5]?.answer).toContain('50%');

    const customFaqs = buildSalonFaqs({
      name: 'LAIKONA NAILS',
      depositAmountCents: 35000,
      currency: 'MXN',
      minCancelHours: 24,
      address: 'Av. Juárez 2100, Col. La Paz, 72160 Puebla, Pue.',
      instagramHandle: 'laikona.puebla',
    });

    expect(customFaqs).toHaveLength(6);
    expect(customFaqs[0]?.answer).toContain('$350 MXN');
    expect(customFaqs[0]?.answer).toContain('link de tu cita');
    expect(customFaqs[0]?.answer).not.toContain('DM');
    expect(customFaqs[1]?.answer).toContain('24 horas');
    expect(customFaqs[3]?.answer).toContain('Av. Juárez 2100');

    const noDepositFaqs = buildSalonFaqs({ paymentMode: 'none', depositAmountCents: 0 });
    expect(noDepositFaqs[0]?.answer).not.toContain('SPEI');
  });

  it('builds complete home @graph with NailSalon, BeautySalon, WebSite, and 1:1 FAQPage', () => {
    const { settings, publicServices } = buildFixture();
    const doc = buildHomeStructuredData({
      siteOrigin: 'https://laikonanails.com/',
      settings,
      services: publicServices,
      reviewsSummary: { count: 14, average: 4.94 },
    });

    expect(doc['@context']).toBe('https://schema.org');
    expect(Array.isArray(doc['@graph'])).toBe(true);
    expect(doc['@graph']).toHaveLength(3);

    const salon = doc['@graph'].find(
      (node) => Array.isArray(node['@type']) && node['@type'].includes('NailSalon'),
    );
    const website = doc['@graph'].find((node) => node['@type'] === 'WebSite');
    const faqPage = doc['@graph'].find((node) => node['@type'] === 'FAQPage');

    expect(salon).toBeDefined();
    expect(salon?.['@type']).toEqual(['NailSalon', 'BeautySalon']);
    expect(salon?.name).toBe('LAIKONA NAILS');
    expect(salon?.url).toBe('https://laikonanails.com/');
    expect(salon?.image).toBe('https://laikonanails.com/brand/laikona-cherry-editorial.webp');
    expect(salon?.priceRange).toBe('$$');
    expect(salon?.areaServed).toBe('Puebla, Puebla, México');
    expect(salon?.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.',
      addressLocality: 'Puebla',
      addressRegion: 'Puebla',
      postalCode: '72410',
      addressCountry: 'MX',
    });
    expect(salon?.geo).toEqual({
      '@type': 'GeoCoordinates',
      latitude: 19.0357,
      longitude: -98.2121,
    });
    expect(salon?.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ],
        opens: '10:00',
        closes: '19:00',
      },
    ]);
    expect(salon?.sameAs).toEqual([
      'https://www.instagram.com/laikona.nailsss/',
      'https://maps.google.com/?q=Calle+25+Sur+1904+Volcanes+Puebla',
    ]);
    expect(salon?.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.9,
      reviewCount: 14,
      bestRating: 5,
      worstRating: 1,
    });

    expect(website).toMatchObject({
      '@type': 'WebSite',
      name: 'LAIKONA NAILS',
      url: 'https://laikonanails.com/',
      inLanguage: 'es-MX',
    });

    const expectedFaqs = buildSalonFaqs(settings);
    expect(faqPage?.['@type']).toBe('FAQPage');
    expect(faqPage?.mainEntity).toEqual(
      expectedFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    );
  });

  it('derives openingHoursSpecification from salon schedules and omits aggregateRating when count is 0', () => {
    const { db, settings, publicServices } = buildFixture();
    const doc = buildHomeStructuredData({
      siteOrigin: 'https://laikonanails.com',
      settings,
      services: publicServices,
      reviewsSummary: { count: 0, average: 5 },
      schedules: db.schedules,
    });

    const salon = doc['@graph'][0];
    expect(salon?.aggregateRating).toBeUndefined();
    expect(salon?.openingHoursSpecification).toEqual([
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
        ],
        opens: '10:00',
        closes: '20:30',
      },
    ]);
  });

  it('strips unsafe javascript: and data: URLs from sameAs and images', () => {
    const { settings, publicServices } = buildFixture();
    const doc = buildHomeStructuredData({
      siteOrigin: 'javascript:alert(1)',
      settings: {
        ...settings,
        coverImageUrl: 'data:image/svg+xml,<svg/>',
        mapsUrl: 'javascript:alert(1)',
        instagramUrl: 'javascript:alert(2)',
        instagramHandle: '',
      },
      services: publicServices,
      reviewsSummary: { count: 1, average: 5 },
    });

    const salon = doc['@graph'][0];
    expect(salon?.url).toBe('https://laikonanails.com/');
    expect(salon?.image).toBe('https://laikonanails.com/brand/laikona-cherry-editorial.webp');
    expect(salon?.sameAs).toEqual(['https://www.instagram.com/laikona.nailsss/']);

    const serviceWithUnsafeImg = buildServiceStructuredData({
      siteOrigin: 'https://laikonanails.com',
      studioName: 'LAIKONA NAILS',
      service: {
        ...publicServices[0]!,
        imageUrl: '/api/media/proofs/private.png',
      },
    });
    expect(serviceWithUnsafeImg?.['@graph'][0]?.image).toBeUndefined();
  });

  it('builds Service, Offer, AggregateRating, and BreadcrumbList for public services', () => {
    const { publicServices } = buildFixture();
    const rubber = publicServices.find((srv) => srv.slug === 'rubber');
    expect(rubber).toBeDefined();

    const doc = buildServiceStructuredData({
      siteOrigin: 'https://laikonanails.com',
      studioName: 'LAIKONA NAILS',
      service: rubber as PublicServiceDTO,
      currency: 'MXN',
      serviceType: 'Esculturales y Nivelación',
      serviceReviewsCount: 5,
      serviceAverageRating: 4.86,
    });

    expect(doc).not.toBeNull();
    expect(doc?.['@context']).toBe('https://schema.org');

    const serviceNode = doc?.['@graph'].find((node) => node['@type'] === 'Service');
    const breadcrumbNode = doc?.['@graph'].find(
      (node) => node['@type'] === 'BreadcrumbList',
    );

    expect(serviceNode).toMatchObject({
      '@type': 'Service',
      name: rubber?.name,
      description: rubber?.description,
      serviceType: 'Esculturales y Nivelación',
      areaServed: 'Puebla, México',
      url: 'https://laikonanails.com/reservar/rubber',
      provider: {
        '@type': 'NailSalon',
        '@id': 'https://laikonanails.com/#nailsalon',
        name: 'LAIKONA NAILS',
        url: 'https://laikonanails.com/',
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'MXN',
        price: ((rubber?.priceCents ?? 0) / 100).toFixed(2),
        availability: 'https://schema.org/InStock',
        url: 'https://laikonanails.com/reservar/rubber',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: 4.9,
        reviewCount: 5,
        bestRating: 5,
        worstRating: 1,
      },
    });

    expect(breadcrumbNode?.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: 'https://laikonanails.com/',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Reservar',
        item: 'https://laikonanails.com/reservar',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: rubber?.name,
        item: 'https://laikonanails.com/reservar/rubber',
      },
    ]);
  });

  it('builds BreadcrumbList for /reservar landing', () => {
    const doc = buildBookingBreadcrumbStructuredData({
      siteOrigin: 'https://laikonanails.com',
    });

    expect(doc['@context']).toBe('https://schema.org');
    expect(doc['@graph'][0]).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Inicio',
          item: 'https://laikonanails.com/',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Reservar',
          item: 'https://laikonanails.com/reservar',
        },
      ],
    });
  });

  it('never leaks isPrivate services, commissionPercent, or ownerPinHash', () => {
    const { settings, publicServices } = buildFixture();
    const privateService: PublicServiceDTO = {
      ...publicServices[0]!,
      id: 'srv-vip-secret',
      name: 'Servicio VIP Privado Secreto',
      slug: 'vip-privado-secreto',
      isPrivate: true,
    };

    const settingsWithInternalLeak: PublicSettingsDTO & {
      ownerPinHash: string;
      defaultCommissionPercent: number;
    } = {
      ...settings,
      ownerPinHash: 'scrypt-hash-should-never-appear',
      defaultCommissionPercent: 35,
    };

    const serviceWithCommissionLeak: PublicServiceDTO & {
      commissionPercent: number;
    } = {
      ...publicServices[0]!,
      commissionPercent: 42,
    };

    const homeDoc = buildHomeStructuredData({
      siteOrigin: 'https://laikonanails.com',
      settings: settingsWithInternalLeak,
      services: [serviceWithCommissionLeak, privateService],
      reviewsSummary: { count: 3, average: 5 },
    });

    const serializedHome = serializeJsonLd(homeDoc);
    expect(serializedHome).not.toContain('vip-privado-secreto');
    expect(serializedHome).not.toContain('Servicio VIP Privado Secreto');
    expect(serializedHome).not.toContain('isPrivate');
    expect(serializedHome).not.toContain('commissionPercent');
    expect(serializedHome).not.toContain('defaultCommissionPercent');
    expect(serializedHome).not.toContain('ownerPinHash');
    expect(serializedHome).not.toContain('scrypt-hash-should-never-appear');

    const privateServiceDoc = buildServiceStructuredData({
      siteOrigin: 'https://laikonanails.com',
      studioName: 'LAIKONA NAILS',
      service: privateService,
      currency: 'MXN',
    });
    expect(privateServiceDoc).toBeNull();
  });

  it('escapes script breakout payloads safely and round-trips via JSON.parse', () => {
    const malicious = {
      '@context': 'https://schema.org',
      name: '</script><script>alert("xss")</script> & <img src=x>',
      note: 'line\u2028sep\u2029end',
    };

    const serialized = serializeJsonLd(malicious);
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).not.toContain('&');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u2028');
    expect(serialized).toContain('\\u2029');
    expect(JSON.parse(serialized)).toEqual(malicious);
  });
});
