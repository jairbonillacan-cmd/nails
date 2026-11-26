'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';

export type HeroScrollState = 'pending' | 'top' | 'inside' | 'past';

export interface HeroNavPhase {
  state: HeroScrollState;
  isFloating: boolean;
}

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange, { passive: true });
  return () => {
    window.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
  };
}

function getServerSnapshot(): HeroScrollState {
  return 'pending';
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

export function resolveNavPhase(previous: HeroNavPhase, next: HeroScrollState): HeroNavPhase {
  if (next === 'past') return { state: next, isFloating: true };
  if (next === 'inside') {
    return {
      state: next,
      isFloating: previous.state === 'past' || (previous.state === 'inside' && previous.isFloating),
    };
  }
  return { state: next, isFloating: false };
}

function useHeroScrollState(heroSelector: string, topThreshold: number, navHeight: number): HeroScrollState {
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

export function useHeroNavPhase(heroSelector: string, topThreshold = 24, navHeight = 96): HeroNavPhase {
  const state = useHeroScrollState(heroSelector, topThreshold, navHeight);
  const [phase, setPhase] = useState<HeroNavPhase>(() => ({ state, isFloating: state === 'past' }));
  if (phase.state === state) return phase;
  const nextPhase = resolveNavPhase(phase, state);
  setPhase(nextPhase);
  return nextPhase;
}
