import { formatCurrency } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { AvailabilitySchedule } from '@/lib/types';

type JsonLdPrimitive = string | number | boolean | null;
type JsonLdValue = JsonLdPrimitive | JsonLdObject | readonly JsonLdValue[];

export interface JsonLdObject {
  readonly [key: string]: JsonLdValue | undefined;
}

interface JsonLdGraphDocument extends JsonLdObject {
  readonly '@context': 'https://schema.org';
  readonly '@graph': readonly JsonLdObject[];
}

export interface SalonFaqItem {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

type SalonFaqSettings = Partial<
  Pick<
    PublicSettingsDTO,
    | 'name'
    | 'address'
    | 'currency'
    | 'depositAmountCents'
    | 'minCancelHours'
    | 'minRescheduleHours'
    | 'instagramHandle'
    | 'paymentMode'
  >
>;

interface HomeStructuredDataInput {
  readonly siteOrigin?: string;
  readonly settings: PublicSettingsDTO;
  readonly services: readonly PublicServiceDTO[];
  readonly reviewsSummary: { readonly count: number; readonly average: number };
  readonly schedules?: ReadonlyArray<Pick<AvailabilitySchedule, 'rules'>>;
}

interface ServiceStructuredDataInput {
  readonly siteOrigin?: string;
  readonly studioName: string;
  readonly service: PublicServiceDTO;
  readonly currency?: PublicSettingsDTO['currency'];
  readonly serviceType?: string | null;
  readonly serviceReviewsCount?: number;
  readonly serviceAverageRating?: number | null;
}

interface BookingBreadcrumbInput {
  readonly siteOrigin?: string;
}

const DEFAULT_SITE_ORIGIN = 'https://laikonanails.com';
const DEFAULT_SALON_NAME = 'LAIKONA NAILS';
const DEFAULT_PUEBLA_ADDRESS = 'Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.';
const DEFAULT_POSTAL_CODE = '72410';
const DEFAULT_INSTAGRAM_HANDLE = '@laikona.nailsss';
const DEFAULT_SALON_IMAGE_PATH = '/brand/laikona-cherry-editorial.webp';
const PUEBLA_GEO = { latitude: 19.0357, longitude: -98.2121 } as const;

const SCHEMA_WEEKDAYS: Readonly<Record<number, string>> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const DEFAULT_OPENING_HOURS: readonly JsonLdObject[] = [
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
];

function normalizeOrigin(siteOrigin?: string): string {
  const trimmed = siteOrigin?.trim() ?? '';
  if (!trimmed) return DEFAULT_SITE_ORIGIN;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.origin;
    }
    return DEFAULT_SITE_ORIGIN;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

function resolveSafeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function resolvePublicImageUrl(
  origin: string,
  candidate: string | null | undefined,
  fallbackPath?: string,
): string | null {
  const trimmed = candidate?.trim() ?? '';
  if (trimmed) {
    const absolute = resolveSafeHttpUrl(trimmed);
    if (absolute) return absolute;
    if (
      trimmed.startsWith('/') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/api/media/')
    ) {
      return `${origin}${trimmed}`;
    }
  }
  return fallbackPath ? `${origin}${fallbackPath}` : null;
}

function normalizeHandle(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return DEFAULT_INSTAGRAM_HANDLE;
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

function resolveInstagramProfileUrl(
  settings: Pick<PublicSettingsDTO, 'instagramUrl' | 'instagramHandle'>,
): string | null {
  const direct = resolveSafeHttpUrl(settings.instagramUrl);
  if (direct && direct.startsWith('https://')) {
    return direct;
  }
  const slug = normalizeHandle(settings.instagramHandle)
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9._]/g, '');
  return slug ? `https://www.instagram.com/${encodeURIComponent(slug)}/` : null;
}

function extractPostalCode(address: string): string {
  const match = /\b(\d{5})\b/.exec(address);
  return match?.[1] ?? DEFAULT_POSTAL_CODE;
}

function formatDepositLabel(cents: number, currency: 'MXN' | 'USD'): string {
  const formatted = formatCurrency(cents, currency);
  return formatted.includes(currency) ? formatted : `${formatted} ${currency}`;
}

function deriveOpeningHoursSpecification(
  schedules?: ReadonlyArray<Pick<AvailabilitySchedule, 'rules'>>,
): readonly JsonLdObject[] {
  if (!schedules || schedules.length === 0) {
    return DEFAULT_OPENING_HOURS;
  }

  const dayBounds = new Map<number, { opens: string; closes: string }>();
  for (const schedule of schedules) {
    for (const rule of schedule.rules) {
      if (!rule.startTime || !rule.endTime) continue;
      const existing = dayBounds.get(rule.dayOfWeek);
      if (!existing) {
        dayBounds.set(rule.dayOfWeek, {
          opens: rule.startTime,
          closes: rule.endTime,
        });
      } else {
        dayBounds.set(rule.dayOfWeek, {
          opens: rule.startTime < existing.opens ? rule.startTime : existing.opens,
          closes: rule.endTime > existing.closes ? rule.endTime : existing.closes,
        });
      }
    }
  }

  if (dayBounds.size === 0) {
    return DEFAULT_OPENING_HOURS;
  }

  const grouped = new Map<string, { opens: string; closes: string; days: string[] }>();
  for (const dayIndex of [1, 2, 3, 4, 5, 6, 0]) {
    const bounds = dayBounds.get(dayIndex);
    const dayName = SCHEMA_WEEKDAYS[dayIndex];
    if (!bounds || !dayName) continue;
    const key = `${bounds.opens}|${bounds.closes}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.days.push(dayName);
    } else {
      grouped.set(key, {
        opens: bounds.opens,
        closes: bounds.closes,
        days: [dayName],
      });
    }
  }

  return Array.from(grouped.values()).map((entry) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: entry.days,
    opens: entry.opens,
    closes: entry.closes,
  }));
}

export function buildSalonFaqs(settings?: SalonFaqSettings): readonly SalonFaqItem[] {
  const salonName = settings?.name?.trim() || DEFAULT_SALON_NAME;
  const currency = settings?.currency ?? 'MXN';
  const depositCents = settings?.depositAmountCents ?? 20000;
  const hasDeposit = settings?.paymentMode !== 'none' && depositCents > 0;
  const depositText = formatDepositLabel(depositCents, currency);
  const cancelHours = Math.max(
    1,
    settings?.minCancelHours ?? settings?.minRescheduleHours ?? 12,
  );
  const address = settings?.address?.trim() || DEFAULT_PUEBLA_ADDRESS;
  const instagramHandle = normalizeHandle(settings?.instagramHandle);

  return [
    {
      id: 'faq-anticipo',
      question: '¿Cómo aparto mi cita y cuánto es el anticipo?',
      answer: hasDeposit
        ? `Apartas tu cita en línea desde /reservar con un anticipo de ${depositText} vía transferencia SPEI o enviando tu comprobante por Instagram DM a ${instagramHandle}. El anticipo se descuenta del total de tu servicio.`
        : 'Apartas tu cita en línea desde /reservar eligiendo tu técnica, especialista y horario disponible en tiempo real.',
    },
    {
      id: 'faq-reagendar',
      question: '¿Con cuánta anticipación puedo reagendar o cancelar?',
      answer: `Puedes reagendar o cancelar hasta ${cancelHours} horas antes de tu cita sin perder tu anticipo, directamente desde el enlace de tu confirmación o en /mis-citas.`,
    },
    {
      id: 'faq-retoque',
      question: '¿Cada cuánto recomiendan el retoque de Rubber, acrílico o softgel?',
      answer:
        'Recomendamos hacer tu retoque cada 21 días para cuidar la salud de tu uña natural y mantener el set intacto. Puedes agendar tu siguiente retoque en 1 clic desde /mis-citas.',
    },
    {
      id: 'faq-ubicacion',
      question: `¿Dónde está ubicado ${salonName} en Puebla y atienden sin cita?`,
      answer: `Estamos ubicados en ${address}. Atendemos únicamente con cita previa para dedicarte tu bloque completo sin prisas.`,
    },
    {
      id: 'faq-extras',
      question: '¿Puedo agregar nail art, efectos o retiro de gel previo?',
      answer:
        'Sí. En el paso de Extras de /reservar puedes agregar nail art, efectos chrome o cat eye, largo extra o retiro de gel previo; el tiempo y el total se calculan solos.',
    },
    {
      id: 'faq-sellos',
      question: '¿Cómo funciona la Tarjeta de Sellos LAIKONA?',
      answer:
        'Acumulas sellos digitales automáticamente en cada visita completada y al completar 8 sellos obtienes 50% de descuento en tu siguiente servicio. Puedes consultar tu avance en /mis-citas.',
    },
  ];
}

export const SALON_FAQS: readonly SalonFaqItem[] = buildSalonFaqs();

export function buildHomeStructuredData(
  input: HomeStructuredDataInput,
): JsonLdGraphDocument {
  const origin = normalizeOrigin(input.siteOrigin);
  const { settings, reviewsSummary } = input;
  const addressText = settings.address.trim() || DEFAULT_PUEBLA_ADDRESS;
  const instagramUrl = resolveInstagramProfileUrl(settings);
  const mapsUrl = resolveSafeHttpUrl(settings.mapsUrl);
  const sameAs = Array.from(
    new Set(
      [instagramUrl, mapsUrl].filter((url): url is string => Boolean(url)),
    ),
  );
  const salonImage = resolvePublicImageUrl(
    origin,
    settings.coverImageUrl,
    DEFAULT_SALON_IMAGE_PATH,
  );
  const publicServices = input.services.filter((service) => !service.isPrivate);
  const faqs = buildSalonFaqs(settings);

  const salonNode: JsonLdObject = {
    '@type': ['NailSalon', 'BeautySalon'],
    '@id': `${origin}/#nailsalon`,
    name: settings.name,
    description: settings.description,
    url: `${origin}/`,
    ...(salonImage ? { image: salonImage } : {}),
    ...(settings.whatsappNumber.trim()
      ? { telephone: settings.whatsappNumber.trim() }
      : {}),
    ...(settings.contactEmail.trim()
      ? { email: settings.contactEmail.trim() }
      : {}),
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: addressText,
      addressLocality: 'Puebla',
      addressRegion: 'Puebla',
      postalCode: extractPostalCode(addressText),
      addressCountry: 'MX',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: PUEBLA_GEO.latitude,
      longitude: PUEBLA_GEO.longitude,
    },
    areaServed: 'Puebla, Puebla, México',
    openingHoursSpecification: deriveOpeningHoursSpecification(input.schedules),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Catálogo de servicios de ${settings.name}`,
      itemListElement: publicServices.map((service) => ({
        '@type': 'Offer',
        url: `${origin}/reservar/${encodeURIComponent(service.slug)}`,
        priceCurrency: settings.currency,
        price: (service.priceCents / 100).toFixed(2),
        availability: 'https://schema.org/InStock',
        itemOffered: {
          '@type': 'Service',
          name: service.name,
          description: service.description,
        },
      })),
    },
    ...(reviewsSummary.count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number(reviewsSummary.average.toFixed(1)),
            reviewCount: reviewsSummary.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  const websiteNode: JsonLdObject = {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: settings.name,
    url: `${origin}/`,
    inLanguage: 'es-MX',
    publisher: {
      '@id': `${origin}/#nailsalon`,
    },
  };

  const faqNode: JsonLdObject = {
    '@type': 'FAQPage',
    '@id': `${origin}/#faq`,
    url: `${origin}/#preguntas`,
    inLanguage: 'es-MX',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [salonNode, websiteNode, faqNode],
  };
}

export function buildServiceStructuredData(
  input: ServiceStructuredDataInput,
): JsonLdGraphDocument | null {
  if (input.service.isPrivate) {
    return null;
  }

  const origin = normalizeOrigin(input.siteOrigin);
  const currency = input.currency ?? 'MXN';
  const serviceUrl = `${origin}/reservar/${encodeURIComponent(input.service.slug)}`;
  const serviceImage = resolvePublicImageUrl(origin, input.service.imageUrl);
  const reviewsCount = input.serviceReviewsCount ?? 0;
  const hasAggregateRating =
    reviewsCount > 0 && typeof input.serviceAverageRating === 'number';

  const serviceNode: JsonLdObject = {
    '@type': 'Service',
    '@id': `${serviceUrl}#service`,
    name: input.service.name,
    description: input.service.description,
    serviceType: input.serviceType?.trim() || 'Manicure y nail art',
    url: serviceUrl,
    ...(serviceImage ? { image: serviceImage } : {}),
    provider: {
      '@type': 'NailSalon',
      '@id': `${origin}/#nailsalon`,
      name: input.studioName,
      url: `${origin}/`,
    },
    areaServed: 'Puebla, México',
    offers: {
      '@type': 'Offer',
      priceCurrency: currency,
      price: (input.service.priceCents / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      url: serviceUrl,
    },
    ...(hasAggregateRating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Number((input.serviceAverageRating ?? 5).toFixed(1)),
            reviewCount: reviewsCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  const breadcrumbNode: JsonLdObject = {
    '@type': 'BreadcrumbList',
    '@id': `${serviceUrl}#breadcrumb`,
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: `${origin}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Reservar',
        item: `${origin}/reservar`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: input.service.name,
        item: serviceUrl,
      },
    ],
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [serviceNode, breadcrumbNode],
  };
}

export function buildBookingBreadcrumbStructuredData(
  input?: BookingBreadcrumbInput,
): JsonLdGraphDocument {
  const origin = normalizeOrigin(input?.siteOrigin);

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${origin}/reservar#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Inicio',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Reservar',
            item: `${origin}/reservar`,
          },
        ],
      },
    ],
  };
}

export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
