'use client';

import { useRef } from 'react';
import { BrandLight } from '@/components/brand/BrandLight';
import { useIntroCurtain } from '@/lib/hooks/useIntroCurtain';
import { LaikonaLogoMark } from './LaikonaLogoMark';

export function LandingIntro() {
  const ref = useRef<HTMLElement>(null);
  useIntroCurtain(ref);
  return (
    <aside ref={ref} className="lk-curtain" aria-hidden="true">
      <figure className="lk-curtain-panel">
        <BrandLight />
      </figure>
      <LaikonaLogoMark className="lk-curtain-logo" />
    </aside>
  );
}
