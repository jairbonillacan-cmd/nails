import type { Metadata } from 'next';
import { ViewTransition } from 'react';
import { cookies } from 'next/headers';
import { preload } from 'react-dom';
import './landing.css';
import { getCachedPublicBootstrap } from '@/lib/public/bootstrap';
import { getRepository } from '@/lib/repositories/db';
import {
  toPublicGalleryItemDTO,
  type PublicReviewDTO,
} from '@/lib/public-dto';
import { resolveLandingContent } from '@/lib/landing-config';
import { getSiteOrigin } from '@/lib/seo/site-url';
import { LandingView } from '@/components/LandingView';
import { LandingIntro } from '@/components/landing/LandingIntro';
import { INTRO_COOKIE } from '@/lib/intro';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getCachedPublicBootstrap();
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

export default async function HomePage() {
  const [bootstrap, reviewsData] = await Promise.all([
    getCachedPublicBootstrap(),
    getRepository().getPublicReviewsForService(null),
  ]);
  const siteOrigin = getSiteOrigin();
  const publicSettings = bootstrap.settings;
  const resolvedLanding = resolveLandingContent(publicSettings);
  preload(resolvedLanding.heroImageDesktopUrl, {
    as: 'image',
    fetchPriority: 'high',
    media: '(min-width: 47.5625rem)',
  });
  preload(resolvedLanding.heroImageMobileUrl, {
    as: 'image',
    fetchPriority: 'high',
    media: '(max-width: 47.5rem)',
  });
  const publicGallery = bootstrap.gallery.map(toPublicGalleryItemDTO);
  const publicReviews: PublicReviewDTO[] = reviewsData.studioReviews
    .filter((review) => review.comment.trim().length > 0)
    .slice(0, 8);

  const showIntro = !(await cookies()).has(INTRO_COOKIE);

  return (
    <ViewTransition enter="lk-page-in" exit="lk-page-out" default="none">
    {showIntro ? <LandingIntro /> : null}
    <LandingView
      initialSettings={publicSettings}
      categories={bootstrap.categories}
      services={bootstrap.services}
      addons={bootstrap.addons}
      staff={bootstrap.staff}
      reviews={publicReviews}
      reviewsSummary={bootstrap.reviewsSummary}
      gallery={publicGallery}
      siteOrigin={siteOrigin}
    />
    </ViewTransition>
  );
}
