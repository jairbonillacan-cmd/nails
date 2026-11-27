'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { BrandLight } from './BrandLight';

interface BrandLoaderProps {
  label: string;
}

export function BrandLoader({ label }: BrandLoaderProps) {
  return (
    <VStack
      as="main"
      className="lk-root lk-stage lk-loader"
      gap={0}
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <BrandLight intensity={0.7} speed={0.6} />
      <VStack className="lk-stage-inner" gap={10} align="center">
        <img
          src={LANDING_ASSETS.logoFullWhite}
          alt="LAIKONA NAILS by Karla"
          width={980}
          height={414}
          className="lk-loader-logo"
        />
        <VStack className="lk-orb" aria-hidden="true" />
      </VStack>
      <Text className="rb-sr-only">{label}…</Text>
    </VStack>
  );
}
