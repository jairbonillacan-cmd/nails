'use client';

import { Button } from '@astryxdesign/core/Button';
import { Pause, Play } from 'lucide-react';
import { useAutoAdvance } from '@/lib/hooks/useAutoAdvance';
import { landingPhoto } from './landingContent';

const SLIDE_INTERVAL_MS = 6500;

const EXTRA_SLIDES = [
  '/landing/sets/07-rubi-y-negro-4x5.webp',
  '/landing/sets/12-rojo-laca-dorado-4x5.webp',
  '/landing/sets/10-vino-metalizado-4x5.webp',
  '/landing/sets/03-flor-coral-4x5.webp',
] as const;

interface LandingHeroSlidesProps {
  desktopUrl: string;
  mobileUrl: string;
}

export function LandingHeroSlides({ desktopUrl, mobileUrl }: LandingHeroSlidesProps) {
  const slideCount = EXTRA_SLIDES.length + 1;
  const { index, isPaused, togglePause } = useAutoAdvance(slideCount, SLIDE_INTERVAL_MS);

  return (
    <>
      <picture
        className="lk-hero-media lk-hero-slide"
        data-active={index === 0 ? 'true' : 'false'}
        aria-hidden="true"
      >
        <source media="(max-width: 47.5rem)" srcSet={mobileUrl} width={720} height={960} />
        <img
          src={desktopUrl}
          alt=""
          width={1600}
          height={900}
          loading="eager"
          fetchPriority="high"
          decoding="sync"
        />
      </picture>
      {EXTRA_SLIDES.map((src, slideIndex) => (
        <picture
          key={src}
          className="lk-hero-media lk-hero-slide"
          data-kind="portrait"
          data-active={index === slideIndex + 1 ? 'true' : 'false'}
          aria-hidden="true"
        >
          <img
            {...landingPhoto(src)}
            alt=""
            width={800}
            height={1000}
            loading="lazy"
            fetchPriority="low"
            decoding="async"
          />
        </picture>
      ))}
      <Button
        label={isPaused ? 'Reanudar fotos' : 'Pausar fotos'}
        variant="ghost"
        size="sm"
        isIconOnly
        icon={isPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
        className="lk-hero-pause"
        aria-pressed={isPaused}
        onClick={togglePause}
      />
    </>
  );
}
