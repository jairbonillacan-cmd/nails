'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import type { PublicGalleryItemDTO, PublicServiceDTO } from '@/lib/public-dto';
import { SectionHeading, WaveBottom, WaveTop } from './LandingParts';
import {
  GALLERY_INITIAL_COUNT,
  LANDING_ASSETS,
  LANDING_CREATIONS,
  galleryTileClass,
  galleryTileSizes,
  isOptimizableLocalRasterImage,
  type LandingCreation,
} from './landingContent';

const LandingCreationLightbox = dynamic(
  () => import('./LandingCreationLightbox').then((mod) => mod.LandingCreationLightbox),
  { ssr: false },
);

interface LandingCreationsProps {
  title?: string;
  subtitle?: string;
  customGallery?: PublicGalleryItemDTO[];
  galleryMode?: 'mix' | 'custom_only';
  instagramUrl: string;
  instagramHandle: string;
  services: PublicServiceDTO[];
}

export function LandingCreations({
  title = 'Algunas de nuestras creaciones',
  subtitle = 'Del french minimal al 3D con charms. Toca cualquier set para apartarlo.',
  customGallery = [],
  galleryMode = 'mix',
  instagramUrl,
  instagramHandle,
  services,
}: LandingCreationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const mappedCustom: LandingCreation[] = customGallery
    .filter((item) => !item.imageUrl.trim().toLowerCase().endsWith('.svg'))
    .map((item) => {
      const linked = item.serviceId
        ? services.find((service) => service.id === item.serviceId)
        : null;
      return {
        src: item.imageUrl,
        title: item.title,
        styleTag: item.category || 'Diseño del estudio',
        suggestedServiceSlug: linked?.slug ?? '',
        width: 800,
        height: 1000,
      };
    });
  const customSrcSet = new Set(mappedCustom.map((item) => item.src));
  const fallbackCreations = LANDING_CREATIONS.filter((item) => !customSrcSet.has(item.src));
  const allCreations: readonly LandingCreation[] =
    galleryMode === 'custom_only' && mappedCustom.length > 0
      ? mappedCustom
      : [...mappedCustom, ...fallbackCreations];
  const creations = allCreations;
  const canExpand = allCreations.length > GALLERY_INITIAL_COUNT;

  const toggleExpanded = () => {
    setIsExpanded((value) => !value);
  };

  return (
    <VStack as="section" id="galeria" aria-labelledby="creaciones-t" className="lk-cereza">
      <WaveTop />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        aria-hidden="true"
        width={488}
        height={572}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        style={{ right: '-8%', top: '3%', width: '52%' }}
      />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        aria-hidden="true"
        width={366}
        height={429}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        style={{ left: '-10%', top: '48%', width: '38%', opacity: 0.05 }}
      />
      <VStack
        gap={6}
        className="lk-wrap"
        paddingBlockStart={6}
        paddingBlockEnd={10}
        style={{ position: 'relative' }}
      >
        <SectionHeading
          id="creaciones-t"
          title={title}
          subtitle={subtitle}
          tone="light"
        />
        <ul className="lk-bento" aria-label="Sets de uñas">
          {creations.map((creation, index) => {
            const tile = galleryTileClass(index);
            const isExtra = index >= GALLERY_INITIAL_COUNT;
            const motion = isExtra ? 'fx-fade-up' : 'lk-pop';
            const altText = `Set de uñas ${creation.title} (${creation.styleTag}) en LAIKONA NAILS Puebla`;
            return (
              <li
                key={`${creation.src}-${index}`}
                className={tile ? `${tile} ${motion}` : motion}
                data-extra={isExtra && !isExpanded ? 'true' : undefined}
              >
                <button
                  type="button"
                  className="lk-bento-btn"
                  aria-haspopup="dialog"
                  aria-label={`Ver diseño ${creation.title} — Quiero este diseño`}
                  onClick={() => setSelectedIndex(index)}
                >
                  {isOptimizableLocalRasterImage(creation.src) ? (
                    <Image
                      src={creation.src}
                      alt={altText}
                      width={creation.width}
                      height={creation.height}
                      sizes={galleryTileSizes(index)}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <img
                      src={creation.src}
                      alt={altText}
                      width={creation.width}
                      height={creation.height}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <HStack
                    className="lk-bento-cap"
                    wrap="wrap"
                    aria-hidden="true"
                    style={{ boxSizing: 'border-box' }}
                  >
                    <Text type="supporting" weight="semibold" color="inherit" maxLines={1}>
                      {creation.title}
                    </Text>
                    <Text className="lk-bento-pill" color="accent">
                      Quiero este diseño
                    </Text>
                  </HStack>
                </button>
              </li>
            );
          })}
        </ul>
        <HStack justify="center" gap={3} wrap="wrap">
          {canExpand ? (
            <Button
              label={isExpanded ? 'Ver menos' : 'Ver más creaciones'}
              variant="secondary"
              size="lg"
              className="lk-btn-light lk-bento-more fx-press"
              aria-expanded={isExpanded}
              onClick={toggleExpanded}
            />
          ) : null}
          <Button
            label={instagramHandle}
            variant="secondary"
            size="lg"
            className="lk-btn-outline fx-press"
            icon={
              <img
                src={LANDING_ASSETS.iconInstagramLight}
                alt=""
                aria-hidden="true"
                width={20}
                height={20}
                loading="lazy"
                decoding="async"
              />
            }
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>
      </VStack>
      <WaveBottom />

      {selectedIndex !== null ? (
        <LandingCreationLightbox
          creations={creations}
          activeIndex={selectedIndex}
          services={services}
          onChangeIndex={setSelectedIndex}
        />
      ) : null}
    </VStack>
  );
}
