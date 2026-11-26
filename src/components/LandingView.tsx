'use client';

import dynamic from 'next/dynamic';
import { getImageProps } from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import type { ServiceAddon, ServiceCategory } from '@/lib/types';
import type {
  PublicReviewDTO,
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import { buildWhatsAppLink, formatCurrency } from '@/lib/format';
import {
  buildHomeStructuredData,
  buildSalonFaqs,
} from '@/lib/seo/structured-data';
import { JsonLdScript } from './seo/JsonLdScript';
import { useSalonAppearance } from './SalonThemeProvider';
import { normalizeInstagramHandle, resolveInstagramUrl } from './booking/bookingHelpers';
import { LandingNav } from './landing/LandingNav';
import { LandingMenu } from './landing/LandingMenu';
import { LandingConnect } from './landing/LandingConnect';
import { LandingFaq } from './landing/LandingFaq';
import { LandingFooter } from './landing/LandingFooter';

const LandingCreations = dynamic(() =>
  import('./landing/LandingCreations').then((mod) => mod.LandingCreations),
);

const LandingReviews = dynamic(() =>
  import('./landing/LandingReviews').then((mod) => mod.LandingReviews),
);

const LandingTeam = dynamic(() =>
  import('./landing/LandingTeam').then((mod) => mod.LandingTeam),
);

const LandingVisit = dynamic(() =>
  import('./landing/LandingVisit').then((mod) => mod.LandingVisit),
);

interface LandingViewProps {
  initialSettings: PublicSettingsDTO;
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  reviews: PublicReviewDTO[];
  reviewsSummary: { count: number; average: number };
  siteOrigin?: string;
}

export function LandingView({
  initialSettings,
  categories,
  services,
  addons,
  staff,
  reviews,
  reviewsSummary,
  siteOrigin,
}: LandingViewProps) {
  const { settings: liveSettings } = useSalonAppearance();
  const settings = liveSettings ?? initialSettings;

  const whatsappUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, me gustaría información para agendar mis uñas.`,
  );
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const depositCents = settings.depositAmountCents ?? 20000;
  const hasDeposit = settings.paymentMode !== 'none' && depositCents > 0;
  const depositLabel = hasDeposit ? formatCurrency(depositCents, settings.currency) : null;
  const rescheduleHours = settings.minRescheduleHours || 12;
  const marquee = [
    ...(depositLabel ? [`Anticipo de ${depositLabel}`] : []),
    `Reagenda hasta ${rescheduleHours} h antes`,
    'Solo con cita',
    'Trae tu foto de inspiración',
  ];
  const ratingLabel = reviewsSummary.average.toFixed(1);
  const reviewUrl = settings.googleReviewUrl?.trim() || settings.mapsUrl;
  const salonFaqs = buildSalonFaqs(settings);
  const homeStructuredData = buildHomeStructuredData({
    siteOrigin,
    settings,
    services,
    reviewsSummary,
  });

  const heroCommon = {
    alt: '',
    sizes: '100vw',
    quality: 75,
  };
  const {
    props: { srcSet: mobileHeroSrcSet, sizes: mobileHeroSizes },
  } = getImageProps({
    ...heroCommon,
    src: '/landing/hero-movil.webp',
    width: 720,
    height: 960,
  });
  const { props: desktopHeroProps } = getImageProps({
    ...heroCommon,
    src: '/landing/hero-escritorio.webp',
    width: 1600,
    height: 900,
    loading: 'eager',
    fetchPriority: 'high',
    decoding: 'sync',
  });

  return (
    <VStack as="main" gap={0} className="lk-root">
      <JsonLdScript id="jsonld-home" data={homeStructuredData} />
      <VStack className="lk-marquee" aria-label={marquee.join('. ')}>
        <HStack className="lk-marquee-track" aria-hidden="true">
          {[...marquee, ...marquee, ...marquee, ...marquee].map((item, index) => (
            <Text key={`${item}-${index}`} color="inherit">
              {item}  ✿
            </Text>
          ))}
        </HStack>
      </VStack>

      <LandingNav
        salonName={settings.name}
        instagramUrl={instagramUrl}
        instagramHandle={instagramHandle}
        whatsappUrl={whatsappUrl}
      />

      <VStack as="section" id="inicio" aria-labelledby="hero-t" padding={3} paddingBlockEnd={0}>
        <VStack gap={6} justify="end" className="lk-hero">
          <picture className="lk-hero-media" aria-hidden="true">
            <source
              media="(max-width: 47.5rem)"
              srcSet={mobileHeroSrcSet}
              sizes={mobileHeroSizes}
              width={720}
              height={960}
            />
            <img {...desktopHeroProps} alt="" />
          </picture>
          <VStack className="lk-hero-scrim" aria-hidden="true" />
          <VStack gap={5} className="lk-hero-content">
            <Heading level={1} id="hero-t" color="inherit" className="lk-serif lk-h1 lk-intro">
              El arte está en tus uñas
            </Heading>
            <VStack className="lk-hero-sub lk-intro-2" style={{ maxWidth: '27rem' }}>
              <Text type="large" color="inherit" textWrap="pretty">
                Acrílico escultural, Softgel y Rubber en {settings.city || 'Puebla'}. Tú traes la idea.
              </Text>
            </VStack>
            <HStack gap={3} wrap="wrap" className="lk-hero-actions lk-intro-3">
              <Button label="Agendar cita" variant="primary" size="lg" className="fx-press" href="/reservar" />
              <Button label="Ver creaciones" variant="secondary" size="lg" className="lk-btn-outline fx-press" href="#galeria" />
            </HStack>
            {reviewsSummary.count > 0 ? (
              <a
                href="#resenas"
                className="lk-hero-sub lk-intro-3"
                style={{
                  color: 'inherit',
                  textDecoration: 'none',
                  alignSelf: 'flex-start',
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: '2.75rem',
                }}
              >
                <HStack gap={2} align="center">
                  <Text color="inherit" className="lk-stars" aria-hidden="true">★★★★★</Text>
                  <Text color="inherit" hasTabularNumbers>
                    {ratingLabel} en Google · {reviewsSummary.count} {reviewsSummary.count === 1 ? 'reseña' : 'reseñas'}
                  </Text>
                </HStack>
              </a>
            ) : null}
          </VStack>
        </VStack>
      </VStack>

      <LandingMenu
        categories={categories}
        services={services}
        addons={addons}
        currency={settings.currency}
        depositLabel={depositLabel}
      />
      <LandingCreations
        instagramUrl={instagramUrl}
        instagramHandle={instagramHandle}
        services={services}
      />
      <LandingReviews reviews={reviews} summary={reviewsSummary} reviewUrl={reviewUrl} />
      <LandingTeam staff={staff} services={services} currency={settings.currency} />
      <LandingConnect instagramUrl={instagramUrl} instagramHandle={instagramHandle} />
      <LandingFaq faqs={salonFaqs} whatsappUrl={whatsappUrl} />
      <LandingVisit
        address={settings.address}
        mapsUrl={settings.mapsUrl}
        whatsappUrl={whatsappUrl}
        instagramUrl={instagramUrl}
        instagramHandle={instagramHandle}
      />
      <LandingFooter
        salonName={settings.name}
        address={settings.address}
        mapsUrl={settings.mapsUrl}
        instagramUrl={instagramUrl}
        whatsappUrl={whatsappUrl}
        year={settings.updatedAt.slice(0, 4)}
      />
    </VStack>
  );
}
