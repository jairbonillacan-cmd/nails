'use client';

import { useRef } from 'react';
import { useIntroCurtain } from '@/lib/hooks/useIntroCurtain';

export function LandingIntro() {
  const ref = useRef<HTMLElement>(null);
  useIntroCurtain(ref);
  return <aside ref={ref} className="lk-curtain" data-phase="done" aria-hidden="true" />;
}
