import type { Metadata } from 'next';
import './landing.css';
import { getSnapshot } from '@/lib/repositories/db';
import {
  toPublicReviewDTO,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicReviewDTO,
} from '@/lib/public-dto';
import { getSiteOrigin } from '@/lib/seo/site-url';
import { LandingView } from '@/components/LandingView';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const cityShort = (settings.city || 'Puebla').split(',')[0]?.trim() || 'Puebla';
  const title = `${settings.name} — Manicure, Rubber y Nail Art en ${cityShort}`;
  const description = `Manicure, rubber, acrílico escultural, softgel y nail art en ${cityShort}. Consulta precios, horarios en vivo y agenda tu cita en línea en ${settings.name}.`;
  const canonicalUrl = `${getSiteOrigin()}/`;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: settings.name,
      locale: 'es_MX',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default function HomePage() {
  const db = getSnapshot();
  const siteOrigin = getSiteOrigin();
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

  return (
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
      siteOrigin={siteOrigin}
    />
  );
}
