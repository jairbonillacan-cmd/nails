import type { Metadata } from 'next';
import '../booking.css';
import { ViewTransition } from 'react';
import { readSignedInClientProfile } from '@/lib/auth/client-portal-profile';
import { getRepository } from '@/lib/repositories/db';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import { getSiteOrigin } from '@/lib/seo/site-url';
import type { BookingLayoutView } from '@/lib/types';
import { BookingWidget } from '@/components/BookingWidget';

export const dynamic = 'force-dynamic';

const RESERVAR_TITLE = 'Reservar cita en línea';
const RESERVAR_DESCRIPTION =
  'Agenda tu cita de manicure, rubber, acrílico, softgel o pedicure en Puebla. Consulta horarios en vivo, elige profesional y aparta en LAIKONA NAILS.';
const RESERVAR_OG_ALT =
  'LAIKONA NAILS — Reserva tu cita de manicure, rubber y nail art en Puebla';

export const metadata: Metadata = {
  title: RESERVAR_TITLE,
  description: RESERVAR_DESCRIPTION,
  alternates: { canonical: '/reservar' },
  openGraph: {
    title: `${RESERVAR_TITLE} · LAIKONA NAILS`,
    description: RESERVAR_DESCRIPTION,
    url: '/reservar',
    siteName: 'LAIKONA NAILS',
    locale: 'es_MX',
    type: 'website',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: RESERVAR_OG_ALT,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${RESERVAR_TITLE} · LAIKONA NAILS`,
    description: RESERVAR_DESCRIPTION,
    images: ['/twitter-image'],
  },
};

interface ReservarSearchParams {
  servicio?: string;
  extras?: string;
  addons?: string;
  staff?: string;
  date?: string;
  layout?: string;
  slot?: string;
  inspo?: string;
}

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

export default async function ReservarPage({
  searchParams,
}: {
  searchParams: Promise<ReservarSearchParams>;
}) {
  const params = await searchParams;
  const db = await getRepository().getSnapshot();
  const siteOrigin = getSiteOrigin();
  const initialTodayKey = getDateKeyInTimezone(
    new Date(),
    db.settings.timezone || 'America/Mexico_City',
  );

  const publicServices = db.services
    .filter((s) => s.isActive && !s.isPrivate)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(toPublicServiceDTO);

  const requestedServiceSlug = params.servicio?.trim();
  const initialServiceSlug =
    requestedServiceSlug &&
    publicServices.some((service) => service.slug === requestedServiceSlug)
      ? requestedServiceSlug
      : undefined;

  return (
    <ViewTransition enter="lk-fade-in" exit="lk-page-out" default="none">
    <BookingWidget
      settings={toPublicSettingsDTO(db.settings)}
      categories={db.categories.toSorted((a, b) => a.displayOrder - b.displayOrder)}
      services={publicServices}
      addons={db.addons
        .filter((a) => a.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder)}
      staff={db.staff
        .filter((s) => s.isActive)
        .toSorted((a, b) => a.displayOrder - b.displayOrder)
        .map(toPublicStaffDTO)}
      initialTodayKey={initialTodayKey}
      initialServiceSlug={initialServiceSlug}
      initialExtraServiceSlugs={parseCsvParam(params.extras)}
      initialAddonIds={parseCsvParam(params.addons)}
      initialStaffSlug={params.staff?.trim() || undefined}
      initialDate={parsePlainDateParam(params.date)}
      initialLayout={parseLayoutParam(params.layout)}
      initialSlot={params.slot?.trim() || undefined}
      initialInspoNote={params.inspo?.trim() || undefined}
      siteOrigin={siteOrigin}
      emitBookingBreadcrumb
      initialClientProfile={await readSignedInClientProfile(db.clients)}
    />
    </ViewTransition>
  );
}
