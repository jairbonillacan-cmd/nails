'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ExternalLink, Sparkles } from 'lucide-react';
import { CopyableField, StatusTag, SurfaceCard } from '@/components/ui';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { formatCurrency } from '@/lib/format';
import { resolveLandingContent } from '@/lib/landing-config';
import { countVisibleLandingSections } from './brandFormUtils';
import type { SalonSettings } from '@/lib/types';

type ActiveServiceMode = NonNullable<SalonSettings['serviceMode']>;

interface BrandGallerySectionProps {
  draft: SalonSettings;
  activeServiceMode: ActiveServiceMode;
  isDepositEnabled: boolean;
  depositAmountCents: number;
  depositBeneficiary: string;
}

function serviceModeLabel(mode: ActiveServiceMode): string {
  if (mode === 'home') return 'A domicilio';
  if (mode === 'online') return 'Solo en línea';
  return 'En estudio';
}

export function BrandGallerySection({
  draft,
  activeServiceMode,
  isDepositEnabled,
  depositAmountCents,
  depositBeneficiary,
}: BrandGallerySectionProps) {
  const resolved = resolveLandingContent(draft);
  const visibleSections = countVisibleLandingSections(draft);
  const heroLogoSrc = resolved.customLogoUrl ?? LANDING_ASSETS.logoWhite;
  const marqueePreview =
    resolved.marqueeItems.length > 0
      ? resolved.marqueeItems.slice(0, 2).join(' · ')
      : `${draft.name} · ${resolved.visitHoursDays}`;

  return (
    <SurfaceCard
      id="brand-live-preview-heading"
      tone="subtle"
      padded
      icon={<Sparkles size={16} aria-hidden="true" />}
      title="Vista previa en vivo"
      subtitle="Refleja al instante tu portada, textos, secciones y cobro."
      actions={
        <Button
          label="Abrir"
          variant="ghost"
          size="sm"
          icon={<ExternalLink size={14} aria-hidden="true" />}
          href="/"
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <VStack className="ad-live-frame" gap={0}>
        {resolved.sections.showMarquee ? (
          <HStack className="ad-live-marquee" justify="center" align="center">
            <Text className="ad-live-marquee-txt" color="inherit">
              {marqueePreview}
            </Text>
          </HStack>
        ) : null}

        <VStack className="ad-live-hero" justify="between">
          <img
            src={resolved.heroImageDesktopUrl}
            alt=""
            className="ad-live-hero-img"
            aria-hidden="true"
          />
          <VStack className="ad-live-hero-scrim" aria-hidden="true" />
          <VStack className="ad-live-hero-body" gap={2} justify="between">
            <HStack justify="between" align="center" gap={2}>
              <img
                src={heroLogoSrc}
                alt={draft.name}
                className="ad-live-hero-logo"
              />
              <Text className="ad-live-mode-tag" color="inherit">
                {serviceModeLabel(activeServiceMode)}
              </Text>
            </HStack>

            <VStack gap={1}>
              <Heading level={3} className="lk-serif ad-live-hero-title">
                {resolved.heroTitle}
              </Heading>
              <Text className="ad-live-hero-sub" color="inherit">
                {resolved.heroSubtitle}
              </Text>
            </VStack>

            <HStack gap={2} wrap="wrap" className="ad-live-hero-actions">
              <Text className="ad-live-cta-primary" color="inherit">
                {resolved.heroPrimaryCta}
              </Text>
              <Text className="ad-live-cta-ghost" color="inherit">
                {resolved.heroSecondaryCta}
              </Text>
            </HStack>
          </VStack>
        </VStack>

        <VStack gap={3} padding={4}>
          <HStack justify="between" align="center" gap={2} wrap="wrap">
            <Text type="supporting" weight="semibold">
              {visibleSections} de 8 secciones visibles
            </Text>
            <Text type="supporting" color="secondary">
              {resolved.visitHoursDays}
            </Text>
          </HStack>

          {resolved.menuBannerText ? (
            <VStack className="ad-subpanel">
              <Text type="supporting">{resolved.menuBannerText}</Text>
            </VStack>
          ) : null}

          {isDepositEnabled ? (
            <VStack className="ad-subpanel" gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text type="label" color="accent" weight="semibold" hasTabularNumbers>
                  ANTICIPO SPEI ({formatCurrency(depositAmountCents, draft.currency)})
                </Text>
                <StatusTag
                  tone="neutral"
                  label={draft.depositBankName || 'Mercado Pago'}
                />
              </HStack>
              <Text type="supporting">Titular: {depositBeneficiary}</Text>
              <CopyableField
                label="CLABE"
                value={draft.depositClabe}
                copyLabel="Copiar CLABE"
                copiedLabel="Copiada"
                feedbackMessage="CLABE copiada al portapapeles."
                monospace
              />
            </VStack>
          ) : null}

          <Text type="supporting" color="secondary">
            {draft.address} · {draft.instagramHandle}
          </Text>
        </VStack>
      </VStack>
    </SurfaceCard>
  );
}
