'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import type { PublicServiceDTO } from '@/lib/public-dto';
import { SectionHeading, WaveBottom, WaveTop } from './LandingParts';
import {
  GALLERY_INITIAL_COUNT,
  LANDING_ASSETS,
  LANDING_CREATIONS,
  galleryTileClass,
  galleryTileSizes,
} from './landingContent';

const LandingCreationLightbox = dynamic(
  () => import('./LandingCreationLightbox').then((mod) => mod.LandingCreationLightbox),
  { ssr: false },
);

interface LandingCreationsProps {
  instagramUrl: string;
  instagramHandle: string;
  services: PublicServiceDTO[];
}

export function LandingCreations({
  instagramUrl,
  instagramHandle,
  services,
}: LandingCreationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const creations = isExpanded
    ? LANDING_CREATIONS
    : LANDING_CREATIONS.slice(0, GALLERY_INITIAL_COUNT);

  const toggleExpanded = () => {
    setIsExpanded((value) => {
      const next = !value;
      if (!next && selectedIndex !== null && selectedIndex >= GALLERY_INITIAL_COUNT) {
        setSelectedIndex(null);
      }
      return next;
    });
  };

  return (
    <VStack as="section" id="galeria" aria-labelledby="creaciones-t" className="lk-cereza">
      <WaveTop />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        width={488}
        height={572}
        loading="lazy"
        decoding="async"
        style={{ right: '-8%', top: '3%', width: '52%' }}
      />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        width={366}
        height={429}
        loading="lazy"
        decoding="async"
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
          title="Algunas de nuestras creaciones"
          subtitle="Del french minimal al 3D con charms. Toca cualquier set para apartarlo."
          tone="light"
        />
        <ul className="lk-bento" aria-label="Sets de uñas">
          {creations.map((creation, index) => {
            const tile = galleryTileClass(index);
            const motion = index >= GALLERY_INITIAL_COUNT ? 'fx-fade-up' : 'lk-pop';
            return (
              <li key={creation.src} className={tile ? `${tile} ${motion}` : motion}>
                <button
                  type="button"
                  className="lk-bento-btn"
                  aria-haspopup="dialog"
                  aria-label={`Ver diseño ${creation.title} — Quiero este diseño`}
                  onClick={() => setSelectedIndex(index)}
                >
                  <Image
                    src={creation.src}
                    alt={`Set ${creation.title} hecho en Laikona`}
                    width={creation.width}
                    height={creation.height}
                    sizes={galleryTileSizes(index)}
                    loading="lazy"
                    decoding="async"
                  />
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
          <Button
            label={isExpanded ? 'Ver menos' : 'Ver más creaciones'}
            variant="secondary"
            size="lg"
            className="lk-btn-light fx-press"
            aria-expanded={isExpanded}
            onClick={toggleExpanded}
          />
          <Button
            label={instagramHandle}
            variant="secondary"
            size="lg"
            className="lk-btn-outline fx-press"
            icon={
              <img
                src={LANDING_ASSETS.iconInstagramLight}
                alt=""
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
