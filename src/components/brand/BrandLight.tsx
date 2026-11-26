'use client';

import { useRef } from 'react';
import { useBrandLight } from '@/lib/hooks/useBrandLight';

interface BrandLightProps {
  className?: string;
  intensity?: number;
  speed?: number;
}

export function BrandLight({ className, intensity = 1, speed = 1 }: BrandLightProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useBrandLight(ref, { intensity, speed });
  return <canvas ref={ref} className={className ? `lk-light ${className}` : 'lk-light'} aria-hidden="true" />;
}
