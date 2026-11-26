'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { SectionHeading, WaveBottom, WaveTop } from './LandingParts';
import {
  GALLERY_INITIAL_COUNT,
  LANDING_ASSETS,
  LANDING_GALLERY,
  galleryTileClass,
} from './landingContent';

interface LandingCreationsProps {
  instagramUrl: string;
  instagramHandle: string;
}

export function LandingCreations({ instagramUrl, instagramHandle }: LandingCreationsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const photos = isExpanded ? LANDING_GALLERY : LANDING_GALLERY.slice(0, GALLERY_INITIAL_COUNT);

  return (
    <VStack as="section" id="galeria" aria-labelledby="creaciones-t" className="lk-cereza">
      <WaveTop />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        width={760}
        height={760}
        loading="lazy"
        decoding="async"
        style={{ right: '-8%', top: '3%', width: '52%' }}
      />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        width={560}
        height={560}
        loading="lazy"
        decoding="async"
        style={{ left: '-10%', top: '48%', width: '38%', opacity: 0.05 }}
      />
      <VStack gap={8} className="lk-wrap" paddingBlockStart={6} paddingBlockEnd={10} style={{ position: 'relative' }}>
        <SectionHeading
          id="creaciones-t"
          title="Algunas de nuestras creaciones"
          subtitle="Del french minimal al 3D con charms."
          tone="light"
        />
        <ul className="lk-bento" aria-label="Sets de uñas">
          {photos.map((src, index) => {
            const tile = galleryTileClass(index);
            const motion = index >= GALLERY_INITIAL_COUNT ? 'fx-fade-up' : 'lk-pop';
            return (
              <li key={src} className={tile ? `${tile} ${motion}` : motion}>
                <img
                  src={src}
                  alt={`Set de uñas ${index + 1} hecho en Laikona`}
                  width={600}
                  height={750}
                  loading="lazy"
                  decoding="async"
                />
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
            onClick={() => setIsExpanded((value) => !value)}
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
    </VStack>
  );
}
