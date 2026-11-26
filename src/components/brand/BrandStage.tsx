'use client';

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { LaikonaLogoMark } from '@/components/landing/LaikonaLogoMark';
import { BrandLight } from './BrandLight';

interface BrandStageProps {
  eyebrow: string;
  title: string;
  body?: string;
  actions?: ReactNode;
  role?: 'status';
}

export function BrandStage({ eyebrow, title, body, actions, role }: BrandStageProps) {
  return (
    <VStack
      as="main"
      className="lk-root lk-stage"
      gap={0}
      role={role}
      aria-busy={role === 'status' ? true : undefined}
    >
      <BrandLight intensity={0.7} speed={0.6} />
      <VStack className="lk-stage-inner" gap={6} align="center">
        <LaikonaLogoMark className="lk-stage-logo" />
        <VStack gap={3} align="center">
          <Text color="inherit" className="lk-stage-eyebrow">
            {eyebrow}
          </Text>
          <Heading level={1} color="inherit" className="lk-serif lk-stage-title" justify="center">
            {title}
          </Heading>
          {body ? (
            <Text color="inherit" className="lk-stage-body" justify="center" textWrap="pretty">
              {body}
            </Text>
          ) : null}
        </VStack>
        {actions ? (
          <HStack gap={2} justify="center" wrap="wrap">
            {actions}
          </HStack>
        ) : null}
      </VStack>
    </VStack>
  );
}
