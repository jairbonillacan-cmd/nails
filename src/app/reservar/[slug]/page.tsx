import type { Metadata } from 'next';
import { VStack } from '@astryxdesign/core/VStack';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  toPublicReviewDTO,
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
  type PublicReviewDTO,
} from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import { BookingWidget } from '@/components/BookingWidget';
import { ServiceReviewsSection } from '@/components/ServiceReviewsSection';

export const dynamic = 'force-dynamic';

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
  const service = db.services.find(
    (entry) => entry.isActive && entry.slug === slug,
  );

  if (!service) {
    return {
      title: 'Reservar cita',
      description: `Agenda tu cita en tiempo real en ${settings.name}.`,
    };
  }

  return {
    title: `Reservar ${service.name}`,
    description: `${service.description} Agenda ${service.name} en tiempo real en ${settings.name}.`,
    alternates: { canonical: `/reservar/${encodeURIComponent(service.slug)}` },
  };
}

export default async function ReservarServicioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ staff?: string; inspo?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const timezone = settings.timezone || 'America/Mexico_City';
  const initialTodayKey = getDateKeyInTimezone(new Date(), timezone);

  const activeServices = db.services
    .filter((s) => s.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(toPublicServiceDTO);

  const selectedService =
    activeServices.find((service) => service.slug === slug) ??
    activeServices[0] ??
    null;

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
        services={activeServices}
        addons={db.addons
          .filter((a) => a.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)}
        staff={db.staff
          .filter((s) => s.isActive)
          .toSorted((a, b) => a.displayOrder - b.displayOrder)
          .map(toPublicStaffDTO)}
        initialTodayKey={initialTodayKey}
        initialServiceSlug={slug}
        initialStaffSlug={query.staff}
        initialInspoNote={query.inspo}
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
        />
      ) : null}
    </VStack>
  );
}
