import type { Metadata } from 'next';
import '../../booking.css';
import { VStack } from '@astryxdesign/core/VStack';
import { readSignedInClientProfile } from '@/lib/auth/client-portal-profile';
import { formatDuration, getDateKeyInTimezone } from '@/lib/format';
import {
  getCachedPublicBootstrap,
  getCachedPublicServiceBySlug,
} from '@/lib/public/bootstrap';
import type { PublicReviewDTO } from '@/lib/public-dto';
import { getRepository } from '@/lib/repositories/db';
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
  const bootstrap = await getCachedPublicBootstrap();
  const { settings } = bootstrap;
  const cityShort = (settings.city || 'Puebla').split(',')[0]?.trim() || 'Puebla';
  const service =
    bootstrap.services.find((entry) => entry.slug === slug) ??
    (await getCachedPublicServiceBySlug(slug));

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

  const durationLabel = formatDuration(service.durationMinutes);
  const priceLabel = formatServicePrice(
    service.priceCents,
    service.isStartingPrice,
    settings.currency,
  );
  const canonicalPath = `/reservar/${encodeURIComponent(service.slug)}`;
  const title = `Reservar ${service.name} en ${cityShort}`;
  const serviceDescription = service.description.trim().replace(/\.+$/, '');
  const summaryPrefix = `${service.name} (${durationLabel}, ${priceLabel} ${settings.currency}) en ${settings.name}, ${cityShort}.`;
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
  const bootstrap = await getCachedPublicBootstrap();
  const { settings } = bootstrap;
  const timezone = settings.timezone || 'America/Mexico_City';
  const initialTodayKey = getDateKeyInTimezone(new Date(), timezone);

  const matchedPublicService = bootstrap.services.find((entry) => entry.slug === slug);
  const privateMatchedService = matchedPublicService
    ? null
    : await getCachedPublicServiceBySlug(slug);
  const activeServices = privateMatchedService
    ? [...bootstrap.services, privateMatchedService].toSorted(
        (a, b) => a.displayOrder - b.displayOrder,
      )
    : bootstrap.services;

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
    ? bootstrap.categories.find((cat) => cat.id === selectedService.categoryId)?.name
    : undefined;
  const siteOrigin = getSiteOrigin();

  const [initialClientProfile, reviewsData] = await Promise.all([
    readSignedInClientProfile({
      services: activeServices,
      staff: bootstrap.staff,
    }),
    getRepository().getPublicReviewsForService(selectedService?.id ?? null),
  ]);
  const { studioReviews, serviceReviews } = reviewsData;

  return (
    <VStack gap={0} width="100%">
      <BookingWidget
        settings={settings}
        categories={bootstrap.categories}
        services={activeServices}
        addons={bootstrap.addons}
        staff={bootstrap.staff}
        initialTodayKey={initialTodayKey}
        initialServiceSlug={resolvedSlug}
        initialExtraServiceSlugs={parseCsvParam(query.extras)}
        initialAddonIds={parseCsvParam(query.addons)}
        initialStaffSlug={query.staff?.trim() || undefined}
        initialDate={parsePlainDateParam(query.date)}
        initialLayout={parseLayoutParam(query.layout)}
        initialSlot={query.slot?.trim() || undefined}
        initialInspoNote={query.inspo?.trim() || undefined}
        initialClientProfile={initialClientProfile}
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
