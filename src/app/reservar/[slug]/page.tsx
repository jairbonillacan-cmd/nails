import type { Metadata } from 'next';
import { VStack } from '@astryxdesign/core/VStack';
import { formatDuration, getDateKeyInTimezone } from '@/lib/format';
import {
  toPublicReviewDTO,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicReviewDTO,
} from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import { getSiteOrigin } from '@/lib/seo/site-url';
import type { BookingLayoutView } from '@/lib/types';
import { formatServicePrice } from '@/components/booking/bookingHelpers';
import { BookingWidget } from '@/components/BookingWidget';
import { ServiceReviewsSection } from '@/components/ServiceReviewsSection';

export const dynamic = 'force-dynamic';

const PLAIN_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCsvParam(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  );
}

function parseLayoutParam(raw: string | undefined): BookingLayoutView | undefined {
  if (raw === 'month' || raw === 'week' || raw === 'column') {
    return raw;
  }
  return undefined;
}

function parsePlainDateParam(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? '';
  return PLAIN_DATE_RE.test(trimmed) ? trimmed : undefined;
}

function computeAverageRating(reviews: PublicReviewDTO[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Number((total / reviews.length).toFixed(1));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const cityShort = (settings.city || 'Puebla').split(',')[0]?.trim() || 'Puebla';
  const service = db.services.find(
    (entry) => entry.isActive && entry.slug === slug,
  );

  if (!service) {
    return {
      title: 'Reservar cita en línea',
      description: `Agenda tu cita de uñas en tiempo real en ${settings.name}, ${cityShort}.`,
      robots: { index: false, follow: false },
    };
  }

  if (service.isPrivate) {
    return {
      title: 'Reservar cita privada',
      description: `Agenda tu cita en tiempo real en ${settings.name}.`,
      robots: { index: false, follow: false },
    };
  }

  const publicService = toPublicServiceDTO(service);
  const durationLabel = formatDuration(publicService.durationMinutes);
  const priceLabel = formatServicePrice(
    publicService.priceCents,
    publicService.isStartingPrice,
    settings.currency,
  );
  const canonicalPath = `/reservar/${encodeURIComponent(publicService.slug)}`;
  const title = `Reservar ${publicService.name} en ${cityShort}`;
  const serviceDescription = publicService.description.trim().replace(/\.+$/, '');
  const summaryPrefix = `${publicService.name} (${durationLabel}, ${priceLabel} ${settings.currency}) en ${settings.name}, ${cityShort}.`;
  const description = serviceDescription
    ? `${summaryPrefix} ${serviceDescription}. Agenda en línea con horarios en vivo.`
    : `${summaryPrefix} Consulta horarios en vivo y agenda tu cita en línea.`;
  const socialTitle = `${title} · ${settings.name}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: socialTitle,
      description,
      url: canonicalPath,
      siteName: settings.name,
      locale: 'es_MX',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
    },
  };
}

export default async function ReservarServicioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    servicio?: string;
    extras?: string;
    addons?: string;
    staff?: string;
    date?: string;
    layout?: string;
    slot?: string;
    inspo?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const timezone = settings.timezone || 'America/Mexico_City';
  const initialTodayKey = getDateKeyInTimezone(new Date(), timezone);

  const activeServices = db.services
    .filter((s) => s.isActive && (!s.isPrivate || s.slug === slug))
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(toPublicServiceDTO);

  const requestedOverride = query.servicio?.trim();
  const resolvedSlug =
    requestedOverride &&
    activeServices.some((service) => service.slug === requestedOverride)
      ? requestedOverride
      : slug;

  const selectedService =
    activeServices.find((service) => service.slug === resolvedSlug) ??
    activeServices[0] ??
    null;
  const selectedCategoryName = selectedService
    ? db.categories.find((cat) => cat.id === selectedService.categoryId)?.name
    : undefined;
  const siteOrigin = getSiteOrigin();

  const bookingById = new Map(
    db.bookings.map((booking) => [booking.id, booking]),
  );
  const clientById = new Map(db.clients.map((client) => [client.id, client]));

  const studioReviews: PublicReviewDTO[] = db.reviews
    .flatMap((review) => {
      const booking = bookingById.get(review.bookingId);
      if (!booking || booking.status !== 'completed') {
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
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));

  const serviceReviews: PublicReviewDTO[] = selectedService
    ? db.reviews
        .flatMap((review) => {
          const booking = bookingById.get(review.bookingId);
          if (!booking || booking.status !== 'completed') {
            return [];
          }
          const matchesService =
            booking.serviceId === selectedService.id ||
            Boolean(booking.extraServiceIds?.includes(selectedService.id));
          if (!matchesService) {
            return [];
          }
          const client = clientById.get(review.clientId ?? booking.clientId);
          return [
            toPublicReviewDTO(review, {
              serviceId: selectedService.id,
              clientFullName: client?.fullName ?? null,
            }),
          ];
        })
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  return (
    <VStack gap={0} width="100%">
      <BookingWidget
        settings={settings}
        categories={db.categories.toSorted((a, b) => a.displayOrder - b.displayOrder)}
        services={activeServices}
        addons={db.addons
          .filter((a) => a.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)}
        staff={db.staff
          .filter((s) => s.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicStaffDTO)}
        initialTodayKey={initialTodayKey}
        initialServiceSlug={resolvedSlug}
        initialExtraServiceSlugs={parseCsvParam(query.extras)}
        initialAddonIds={parseCsvParam(query.addons)}
        initialStaffSlug={query.staff?.trim() || undefined}
        initialDate={parsePlainDateParam(query.date)}
        initialLayout={parseLayoutParam(query.layout)}
        initialSlot={query.slot?.trim() || undefined}
        initialInspoNote={query.inspo?.trim() || undefined}
      />
      {selectedService ? (
        <ServiceReviewsSection
          studioName={settings.name}
          serviceName={selectedService.name}
          timezone={timezone}
          serviceReviews={serviceReviews}
          studioReviews={studioReviews}
          serviceAverage={computeAverageRating(serviceReviews)}
          studioAverage={computeAverageRating(studioReviews)}
          studioReviewCount={studioReviews.length}
          googleReviewUrl={settings.googleReviewUrl}
          service={selectedService}
          currency={settings.currency}
          siteOrigin={siteOrigin}
          serviceType={selectedCategoryName}
        />
      ) : null}
    </VStack>
  );
}
