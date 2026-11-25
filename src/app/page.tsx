import { getRuntimeIntegrationStatus } from '@/lib/env';
import { getSnapshot } from '@/lib/repositories/db';
import {
  toPublicReviewDTO,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicReviewDTO,
  type PublicServiceDTO,
  type PublicSettingsDTO,
} from '@/lib/public-dto';
import { resolveInstagramUrl } from '@/components/booking/bookingHelpers';
import { LandingView } from '@/components/LandingView';

export const dynamic = 'force-dynamic';

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

function serializeJsonLd(payload: Record<string, unknown>): string {
  return JSON.stringify(payload)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildNailSalonJsonLd(input: {
  baseUrl: string;
  settings: PublicSettingsDTO;
  services: PublicServiceDTO[];
  reviewsCount: number;
  averageRating: number;
}): Record<string, unknown> {
  const instagramUrl = resolveInstagramUrl(input.settings);
  const mapsUrl = resolveSafeHttpUrl(input.settings.mapsUrl);
  const sameAs = [instagramUrl, mapsUrl].filter(
    (entry): entry is string => Boolean(entry),
  );

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': ['NailSalon', 'LocalBusiness'],
    '@id': `${input.baseUrl}/#nailsalon`,
    name: input.settings.name,
    description: input.settings.description,
    url: input.baseUrl,
    image: `${input.baseUrl}/brand/laikona-cherry-editorial.webp`,
    telephone: input.settings.whatsappNumber,
    email: input.settings.contactEmail,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: input.settings.address,
      addressLocality: 'Puebla',
      addressRegion: 'Puebla',
      addressCountry: 'MX',
    },
    areaServed: {
      '@type': 'City',
      name: 'Puebla',
    },
    sameAs,
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `Catálogo de servicios de ${input.settings.name}`,
      itemListElement: input.services.map((service) => ({
        '@type': 'Offer',
        url: `${input.baseUrl}/reservar/${encodeURIComponent(service.slug)}`,
        priceCurrency: input.settings.currency,
        price: (service.priceCents / 100).toFixed(2),
        availability: 'https://schema.org/InStock',
        itemOffered: {
          '@type': 'Service',
          name: service.name,
          description: service.description,
        },
      })),
    },
  };

  if (input.reviewsCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.averageRating,
      reviewCount: input.reviewsCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return schema;
}

export default function HomePage() {
  const db = getSnapshot();
  const baseUrl = getRuntimeIntegrationStatus().appUrl.replace(/\/+$/, '');
  const publicSettings = toPublicSettingsDTO(db.settings);
  const publicServices = db.services
    .filter((s) => s.isActive && !s.isPrivate)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(toPublicServiceDTO);
  const reviewsCount = db.reviews.length;
  const average =
    reviewsCount > 0
      ? Number(
          (
            db.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewsCount
          ).toFixed(1),
        )
      : 5.0;

  const bookingById = new Map(db.bookings.map((booking) => [booking.id, booking]));
  const clientById = new Map(db.clients.map((client) => [client.id, client]));
  const publicReviews: PublicReviewDTO[] = db.reviews
    .flatMap((review) => {
      const booking = bookingById.get(review.bookingId);
      if (!booking || booking.status !== 'completed' || !review.comment.trim()) {
        return [];
      }
      const client = clientById.get(review.clientId ?? booking.clientId);
      return [
        toPublicReviewDTO(review, {
          serviceId: booking.serviceId,
          clientFullName: client?.fullName ?? null,
        }),
      ];
    })
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const serializedJsonLd = serializeJsonLd(
    buildNailSalonJsonLd({
      baseUrl,
      settings: publicSettings,
      services: publicServices,
      reviewsCount,
      averageRating: average,
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializedJsonLd }}
      />
      <LandingView
        initialSettings={publicSettings}
        categories={db.categories.toSorted((a, b) => a.displayOrder - b.displayOrder)}
        services={publicServices}
        addons={db.addons
          .filter((a) => a.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)}
        staff={db.staff
          .filter((s) => s.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicStaffDTO)}
        reviews={publicReviews}
        reviewsSummary={{ count: reviewsCount, average }}
      />
    </>
  );
}
