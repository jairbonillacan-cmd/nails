'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type HeroScrollState = 'top' | 'inside' | 'past';

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange, { passive: true });
  return () => {
    window.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
  };
}

function getServerSnapshot(): HeroScrollState {
  return 'top';
}

export function resolveHeroScrollState(input: {
  scrollY: number;
  heroBottom: number | null;
  topThreshold: number;
  navHeight: number;
}): HeroScrollState {
  if (input.scrollY <= input.topThreshold) return 'top';
  if (input.heroBottom === null) return 'past';
  return input.heroBottom > input.navHeight ? 'inside' : 'past';
}

export function useHeroScrollState(heroSelector: string, topThreshold = 24, navHeight = 96): HeroScrollState {
  const getSnapshot = useCallback((): HeroScrollState => {
    const hero = document.querySelector(heroSelector);
    return resolveHeroScrollState({
      scrollY: window.scrollY,
      heroBottom: hero ? hero.getBoundingClientRect().bottom : null,
      topThreshold,
      navHeight,
    });
  }, [heroSelector, topThreshold, navHeight]);
  return useSyncExternalStore(subscribeToScroll, getSnapshot, getServerSnapshot);
}
