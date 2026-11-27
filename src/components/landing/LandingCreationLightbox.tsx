'use client';

import { useCallback } from 'react';
import Image, { getImageProps } from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PublicServiceDTO } from '@/lib/public-dto';
import { useGalleryLightbox } from '@/lib/hooks/useGalleryLightbox';
import { isOptimizableLocalRasterImage, type LandingCreation } from './landingContent';

const LIGHTBOX_IMAGE_SIZES = '(max-width: 47.5rem) 92vw, 32rem';

interface LandingCreationLightboxProps {
  creations: readonly LandingCreation[];
  activeIndex: number;
  services: readonly PublicServiceDTO[];
  onChangeIndex: (index: number | null) => void;
}

export function LandingCreationLightbox({
  creations,
  activeIndex,
  services,
  onChangeIndex,
}: LandingCreationLightboxProps) {
  const resolvePreloadItem = useCallback(
    (index: number) => {
      const item = creations[index];
      if (!item) return null;
      if (!isOptimizableLocalRasterImage(item.src)) {
        return { src: item.src };
      }
      const { props } = getImageProps({
        src: item.src,
        alt: '',
        width: item.width,
        height: item.height,
        sizes: LIGHTBOX_IMAGE_SIZES,
        quality: 75,
      });
      return {
        src: props.src,
        srcSet: props.srcSet,
        sizes: props.sizes,
      };
    },
    [creations],
  );

  const { hasMultiple, direction, counterLabel, goPrev, goNext, close, swipeHandlers } =
    useGalleryLightbox({
      total: creations.length,
      activeIndex,
      onChangeIndex,
      resolvePreloadItem,
    });

  const activeCreation = creations[activeIndex] ?? null;
  if (!activeCreation) {
    return null;
  }

  const matchedService =
    services.find((service) => service.slug === activeCreation.suggestedServiceSlug) ?? null;
  const bookingHref = matchedService
    ? `/reservar/${encodeURIComponent(matchedService.slug)}?inspo=${encodeURIComponent(activeCreation.title)}`
    : `/reservar?inspo=${encodeURIComponent(activeCreation.title)}`;

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) close();
      }}
      aria-labelledby="lk-lightbox-title"
      width="min(32rem, 94vw)"
      maxHeight="90dvh"
      padding={0}
    >
      <VStack gap={0} className="lk-portal">
        <HStack justify="between" align="center" gap={3} padding={5} paddingBlockEnd={3}>
          <VStack gap={0.5} style={{ minWidth: 0 }}>
            <Heading level={2} id="lk-lightbox-title" className="lk-serif" style={{ fontSize: '1.65rem' }}>
              {activeCreation.title}
            </Heading>
            <Text type="supporting" color="secondary">
              {matchedService ? matchedService.name : activeCreation.styleTag}
            </Text>
          </VStack>
          <Button
            label="Cerrar"
            variant="ghost"
            size="md"
            className="lk-icon-touch fx-press"
            isIconOnly
            icon={<X size={18} aria-hidden="true" />}
            onClick={close}
          />
        </HStack>

        <VStack paddingInline={5}>
          <VStack
            className="lk-lightbox-stage"
            data-direction={direction}
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchEnd={swipeHandlers.onTouchEnd}
            onTouchCancel={swipeHandlers.onTouchCancel}
          >
            {isOptimizableLocalRasterImage(activeCreation.src) ? (
              <Image
                key={activeCreation.src}
                src={activeCreation.src}
                alt={`Set de uñas ${activeCreation.title} (${activeCreation.styleTag}) en LAIKONA NAILS Puebla`}
                width={activeCreation.width}
                height={activeCreation.height}
                sizes={LIGHTBOX_IMAGE_SIZES}
                loading="eager"
                decoding="async"
                className="lk-lightbox-img"
              />
            ) : (
              <img
                key={activeCreation.src}
                src={activeCreation.src}
                alt={`Set de uñas ${activeCreation.title} (${activeCreation.styleTag}) en LAIKONA NAILS Puebla`}
                width={activeCreation.width}
                height={activeCreation.height}
                loading="eager"
                decoding="async"
                className="lk-lightbox-img"
              />
            )}
          </VStack>
        </VStack>

        <VStack gap={3} padding={5}>
          <HStack justify="between" align="center" gap={2}>
            <button
              type="button"
              className="lk-lightbox-nav fx-press"
              aria-label="Diseño anterior"
              disabled={!hasMultiple}
              onClick={goPrev}
            >
              <ChevronLeft size={18} aria-hidden="true" />
              Anterior
            </button>
            <Text
              type="supporting"
              color="accent"
              weight="bold"
              hasTabularNumbers
              className="lk-lightbox-counter"
              aria-hidden="true"
            >
              {counterLabel}
            </Text>
            <Text className="rb-sr-only" role="status" aria-live="polite" aria-atomic="true">
              {`${activeCreation.title}, diseño ${counterLabel}`}
            </Text>
            <button
              type="button"
              className="lk-lightbox-nav fx-press"
              aria-label="Siguiente diseño"
              disabled={!hasMultiple}
              onClick={goNext}
            >
              Siguiente
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </HStack>
          <Button
            label="Quiero este diseño"
            variant="primary"
            size="lg"
            width="100%"
            className="fx-press"
            href={bookingHref}
          />
          <Text type="supporting" color="secondary" justify="center" textWrap="pretty">
            Desliza o usa las flechas · Guardamos esta referencia automáticamente en tu reserva.
          </Text>
        </VStack>
      </VStack>
    </Dialog>
  );
}
