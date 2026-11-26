'use client';

import { useEffect, type RefObject } from 'react';
import { INTRO_COOKIE } from '@/lib/intro';

const HOLD_MS = 2100;
const EXIT_MS = 700;

function measureFlight(logo: Element, target: Element): Record<string, string> | null {
  const from = logo.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width <= 0 || to.width <= 0) return null;
  return {
    '--fly-x': `${to.left + to.width / 2 - (from.left + from.width / 2)}px`,
    '--fly-y': `${to.top + to.height / 2 - (from.top + from.height / 2)}px`,
    '--fly-s': String(to.width / from.width),
  };
}

export function useIntroCurtain(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const html = document.documentElement;
    document.cookie = `${INTRO_COOKIE}=1; path=/; SameSite=Lax`;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.dataset.phase = 'done';
      return;
    }

    let holdTimer = 0;
    let doneTimer = 0;
    let navObserver: MutationObserver | null = null;

    const finish = () => {
      root.dataset.phase = 'done';
      const nav = document.querySelector('.lk-nav');
      if (!nav) return;
      html.dataset.lkIntro = 'done';
      navObserver = new MutationObserver(() => {
        if (nav.getAttribute('data-hero') === 'top') return;
        delete html.dataset.lkIntro;
        navObserver?.disconnect();
      });
      navObserver.observe(nav, { attributes: true, attributeFilter: ['data-hero'] });
    };

    const exit = () => {
      if (root.dataset.phase) return;
      window.clearTimeout(holdTimer);
      const logo = root.querySelector('.lk-curtain-logo');
      const target = document.querySelector('.lk-nav .lk-lm');
      const flight = logo && target ? measureFlight(logo, target) : null;
      if (logo instanceof SVGElement && flight) {
        for (const [name, value] of Object.entries(flight)) logo.style.setProperty(name, value);
      }
      root.dataset.phase = 'exit';
      doneTimer = window.setTimeout(finish, EXIT_MS);
    };

    holdTimer = window.setTimeout(exit, Math.max(0, HOLD_MS - performance.now()));
    root.addEventListener('pointerdown', exit);
    window.addEventListener('keydown', exit);
    window.addEventListener('wheel', exit, { passive: true });

    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(doneTimer);
      root.removeEventListener('pointerdown', exit);
      window.removeEventListener('keydown', exit);
      window.removeEventListener('wheel', exit);
      navObserver?.disconnect();
      delete html.dataset.lkIntro;
    };
  }, [ref]);
}
