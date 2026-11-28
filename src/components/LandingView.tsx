'use client';

import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import type { ServiceAddon, ServiceCategory } from '@/lib/types';
import type {
  PublicGalleryItemDTO,
  PublicReviewDTO,
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import { buildWhatsAppLink, formatCurrency } from '@/lib/format';
import { resolveLandingContent } from '@/lib/landing-config';
import {
  buildHomeStructuredData,
  buildSalonFaqs,
} from '@/lib/seo/structured-data';
import { useRevealOnScroll } from '@/lib/hooks/useRevealOnScroll';
import { JsonLdScript } from './seo/JsonLdScript';
import { useSalonAppearance } from './SalonThemeProvider';
import {
  hasConfiguredDeposit,
  normalizeInstagramHandle,
  resolveInstagramUrl,
} from './booking/bookingHelpers';
import { LandingNav } from './landing/LandingNav';
import { LandingMenu } from './landing/LandingMenu';
import { LandingFooter } from './landing/LandingFooter';
import { LandingHeroSlides } from './landing/LandingHeroSlides';

const LandingCreations = dynamic(() =>
  import('./landing/LandingCreations').then((mod) => mod.LandingCreations),
);

const LandingReviews = dynamic(() =>
  import('./landing/LandingReviews').then((mod) => mod.LandingReviews),
);

const LandingTeam = dynamic(() =>
  import('./landing/LandingTeam').then((mod) => mod.LandingTeam),
);

const LandingConnect = dynamic(() =>
  import('./landing/LandingConnect').then((mod) => mod.LandingConnect),
);

const LandingFaq = dynamic(() =>
  import('./landing/LandingFaq').then((mod) => mod.LandingFaq),
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
  gallery?: PublicGalleryItemDTO[];
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
  gallery = [],
  siteOrigin,
}: LandingViewProps) {
  useRevealOnScroll('#lk-landing');
  const { settings: liveSettings } = useSalonAppearance();
  const settings = liveSettings ?? initialSettings;
  const landing = resolveLandingContent(settings);
  const { sections } = landing;

  const whatsappUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, me gustaría información para agendar mis uñas.`,
  );
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const depositCents = settings.depositAmountCents ?? 0;
  const hasDeposit = hasConfiguredDeposit(settings, depositCents) && depositCents > 0;
  const depositLabel = hasDeposit ? formatCurrency(depositCents, settings.currency) : null;
  const rescheduleHours = settings.minRescheduleHours || 12;
  const autoMarquee = [
    ...(depositLabel ? [`Anticipo de ${depositLabel}`] : []),
    `Reagenda hasta ${rescheduleHours} h antes`,
    'Solo con cita',
    'Trae tu foto de inspiración',
  ];
  const marquee = landing.marqueeItems.length > 0 ? landing.marqueeItems : autoMarquee;
  const ratingLabel = reviewsSummary.average.toFixed(1);
  const reviewUrl = settings.googleReviewUrl?.trim() || settings.mapsUrl;
  const salonFaqs = buildSalonFaqs(settings);
  const homeStructuredData = buildHomeStructuredData({
    siteOrigin,
    settings,
    services,
    reviewsSummary,
  });

  const secondaryCtaHref = sections.showCreations
    ? '#galeria'
    : sections.showMenu
      ? '#servicios'
      : null;

  return (
    <VStack gap={0} className="lk-root" id="lk-landing">
      <a href="#main-content" className="lk-skip-link">
        Saltar al contenido principal
      </a>
      <JsonLdScript id="jsonld-home" data={homeStructuredData} />

      {sections.showMarquee ? (
        <VStack className="lk-marquee" aria-label={marquee.join('. ')}>
          <HStack className="lk-marquee-track" aria-hidden="true">
            {[...marquee, ...marquee, ...marquee, ...marquee].map((item, index) => (
              <Text key={`${item}-${index}`} color="inherit">
                {item}  ✿
              </Text>
            ))}
          </HStack>
        </VStack>
      ) : null}

      <LandingNav
        salonName={settings.name}
        customLogoUrl={landing.customLogoUrl}
        instagramUrl={instagramUrl}
        instagramHandle={instagramHandle}
        whatsappUrl={whatsappUrl}
        sections={sections}
      />

      <VStack as="main" id="main-content" tabIndex={-1} gap={0} width="100%">
        <VStack as="section" id="inicio" aria-labelledby="hero-t" gap={0}>
          <VStack gap={6} justify="end" className="lk-hero">
            <LandingHeroSlides
              desktopUrl={landing.heroImageDesktopUrl}
              mobileUrl={landing.heroImageMobileUrl}
            />
            <VStack className="lk-hero-scrim" aria-hidden="true" />
            <VStack gap={5} className="lk-hero-content">
              <Heading level={1} id="hero-t" color="inherit" className="lk-serif lk-h1">
                {landing.heroTitle}
              </Heading>
              <VStack className="lk-hero-sub" style={{ maxWidth: '27rem' }}>
                <Text type="large" color="inherit" textWrap="pretty">
                  {landing.heroSubtitle}
                </Text>
              </VStack>
              <HStack gap={3} wrap="wrap" className="lk-hero-actions">
                <Button
                  label={landing.heroPrimaryCta}
                  variant="primary"
                  size="lg"
                  className="fx-press"
                  href="/reservar"
                />
                {secondaryCtaHref ? (
                  <Button
                    label={landing.heroSecondaryCta}
                    variant="secondary"
                    size="lg"
                    className="lk-btn-outline fx-press"
                    href={secondaryCtaHref}
                  />
                ) : null}
              </HStack>
              {sections.showHeroRating && reviewsSummary.count > 0 ? (
                sections.showReviews ? (
                  <a
                    href="#resenas"
                    className="lk-hero-sub"
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
                        {ratingLabel} en Google · {reviewsSummary.count}{' '}
                        {reviewsSummary.count === 1 ? 'reseña' : 'reseñas'}
                      </Text>
                    </HStack>
                  </a>
                ) : (
                  <HStack gap={2} align="center" className="lk-hero-sub">
                    <Text color="inherit" className="lk-stars" aria-hidden="true">★★★★★</Text>
                    <Text color="inherit" hasTabularNumbers>
                      {ratingLabel} en Google · {reviewsSummary.count}{' '}
                      {reviewsSummary.count === 1 ? 'reseña' : 'reseñas'}
                    </Text>
                  </HStack>
                )
              ) : null}
            </VStack>
          </VStack>
        </VStack>

        {sections.showMenu ? (
          <LandingMenu
            salonName={settings.name}
            title={landing.menuTitle}
            bannerText={landing.menuBannerText}
            categories={categories}
            services={services}
            addons={addons}
            currency={settings.currency}
            depositLabel={depositLabel}
          />
        ) : null}

        {sections.showCreations ? (
          <LandingCreations
            salonName={settings.name}
            title={landing.creationsTitle}
            subtitle={landing.creationsSubtitle}
            customGallery={gallery}
            galleryMode={landing.galleryMode}
            instagramUrl={instagramUrl}
            instagramHandle={instagramHandle}
            services={services}
          />
        ) : null}

        {sections.showReviews ? (
          <LandingReviews
            title={landing.reviewsTitle}
            subtitle={landing.reviewsSubtitle}
            reviews={reviews}
            summary={reviewsSummary}
            reviewUrl={reviewUrl}
            timezone={settings.timezone || 'America/Mexico_City'}
          />
        ) : null}

        {sections.showTeam ? (
          <LandingTeam
            salonName={settings.name}
            title={landing.teamTitle}
            subtitle={landing.teamSubtitle}
            staff={staff}
            services={services}
            currency={settings.currency}
          />
        ) : null}

        {sections.showConnect ? (
          <LandingConnect
            salonName={settings.name}
            title={landing.connectTitle}
            subtitle={landing.connectSubtitle}
            instagramUrl={instagramUrl}
            instagramHandle={instagramHandle}
          />
        ) : null}

        {sections.showFaq ? (
          <LandingFaq
            title={landing.faqTitle}
            subtitle={landing.faqSubtitle}
            faqs={salonFaqs}
            whatsappUrl={whatsappUrl}
          />
        ) : null}

        {sections.showVisit ? (
          <LandingVisit
            title={landing.visitTitle}
            hoursDays={landing.visitHoursDays}
            hoursText={landing.visitHoursText}
            showMapEmbed={sections.showMapEmbed}
            address={settings.address}
            mapsUrl={settings.mapsUrl}
            whatsappUrl={whatsappUrl}
            instagramUrl={instagramUrl}
            instagramHandle={instagramHandle}
          />
        ) : null}
      </VStack>

      <LandingFooter
        salonName={settings.name}
        customLogoUrl={landing.customLogoUrl}
        hoursDays={landing.visitHoursDays}
        hoursText={landing.visitHoursText}
        sections={sections}
        address={settings.address}
        mapsUrl={settings.mapsUrl}
        instagramUrl={instagramUrl}
        whatsappUrl={whatsappUrl}
        year={settings.updatedAt.slice(0, 4)}
      />
    </VStack>
  );
}
