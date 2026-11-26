'use client';

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
import { useSalonAppearance } from './SalonThemeProvider';
import { normalizeInstagramHandle, resolveInstagramUrl } from './booking/bookingHelpers';
import { LandingNav } from './landing/LandingNav';
import { LandingMenu } from './landing/LandingMenu';
import { LandingCreations } from './landing/LandingCreations';
import { LandingReviews } from './landing/LandingReviews';
import { LandingTeam } from './landing/LandingTeam';
import { LandingConnect } from './landing/LandingConnect';
import { LandingVisit } from './landing/LandingVisit';
import { LandingFooter } from './landing/LandingFooter';

const MARQUEE_ITEMS = [
  'Reagenda hasta 12 h antes',
  'Solo con cita',
  'Trae tu foto de inspiración',
] as const;

interface LandingViewProps {
  initialSettings: PublicSettingsDTO;
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  reviews: PublicReviewDTO[];
  reviewsSummary: { count: number; average: number };
}

export function LandingView({
  initialSettings,
  categories,
  services,
  addons,
  staff,
  reviews,
  reviewsSummary,
}: LandingViewProps) {
  const { settings: liveSettings } = useSalonAppearance();
  const settings = liveSettings ?? initialSettings;

  const whatsappUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, me gustaría información para agendar mis uñas.`,
  );
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const depositLabel = formatCurrency(settings.depositAmountCents ?? 20000, settings.currency);
  const marquee = [`Anticipo de ${depositLabel}`, ...MARQUEE_ITEMS];
  const ratingLabel = reviewsSummary.average.toFixed(1).replace('.', ',');

  return (
    <VStack as="main" gap={0} className="lk-root">
      <VStack className="lk-marquee" aria-label={marquee.join('. ')}>
        <HStack className="lk-marquee-track" aria-hidden="true">
          {[...marquee, ...marquee, ...marquee, ...marquee].map((item, index) => (
            <Text key={`${item}-${index}`} color="inherit">
              {item}  ✿
            </Text>
          ))}
        </HStack>
      </VStack>

      <LandingNav salonName={settings.name} instagramUrl={instagramUrl} instagramHandle={instagramHandle} />

      <VStack as="section" id="inicio" aria-labelledby="hero-t" padding={3} paddingBlockEnd={0}>
        <VStack gap={6} justify="end" className="lk-hero">
          <picture className="lk-hero-media" aria-hidden="true">
            <source media="(max-width: 47.5rem)" srcSet="/landing/hero-movil.webp" />
            <img
              src="/landing/hero-escritorio.webp"
              alt=""
              width={1600}
              height={900}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <VStack className="lk-hero-scrim" aria-hidden="true" />
          <VStack gap={6} className="lk-hero-content">
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
              <HStack gap={2} align="center" className="lk-hero-sub lk-intro-3">
                <Text color="inherit" className="lk-stars" aria-hidden="true">★★★★★</Text>
                <Text color="inherit" hasTabularNumbers>
                  {ratingLabel} en Google · {reviewsSummary.count} {reviewsSummary.count === 1 ? 'reseña' : 'reseñas'}
                </Text>
              </HStack>
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
      <LandingCreations instagramUrl={instagramUrl} instagramHandle={instagramHandle} />
      <LandingReviews reviews={reviews} summary={reviewsSummary} reviewUrl={settings.mapsUrl} />
      <LandingTeam staff={staff} services={services} currency={settings.currency} />
      <LandingConnect instagramUrl={instagramUrl} instagramHandle={instagramHandle} />
      <LandingVisit
        address={settings.address}
        mapsUrl={settings.mapsUrl}
        whatsappUrl={whatsappUrl}
        instagramHandle={instagramHandle}
      />
      <LandingFooter
        salonName={settings.name}
        address={settings.address}
        instagramUrl={instagramUrl}
        whatsappUrl={whatsappUrl}
        year={settings.updatedAt.slice(0, 4)}
      />
    </VStack>
  );
}
