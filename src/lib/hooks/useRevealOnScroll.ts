'use client';

import { useEffect } from 'react';

const REVEAL_SELECTOR =
  '.lk-reveal, .lk-reveal-2, .lk-reveal-3, .lk-pop, .lk-draw, .lk-section ul:not(.lk-marquee-track) > li';

export function useRevealOnScroll(rootSelector: string): void {
  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const html = document.documentElement;
    const observed = new WeakSet<Element>();

    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-in', 'true');
          intersection.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0 },
    );

    const observeAll = () => {
      root.querySelectorAll(REVEAL_SELECTOR).forEach((element) => {
        if (observed.has(element) || element.hasAttribute('data-in')) return;
        observed.add(element);
        intersection.observe(element);
      });
    };

    observeAll();
    html.setAttribute('data-lk-motion', 'true');
    const mutations = new MutationObserver(observeAll);
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      intersection.disconnect();
      html.removeAttribute('data-lk-motion');
    };
  }, [rootSelector]);
}
