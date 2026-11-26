'use client';

import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  const rootClass = className
    ? `ad-page-head fx-fade-up ${className}`
    : 'ad-page-head fx-fade-up';

  return (
    <HStack
      as="header"
      justify="between"
      align="end"
      gap={4}
      wrap="wrap"
      className={rootClass}
      style={{ minWidth: 0, width: '100%' }}
    >
      <VStack
        gap={1.5}
        className="ad-head-copy"
        style={{ minWidth: 0, flex: '1 1 18rem' }}
      >
        {eyebrow || meta ? (
          <HStack gap={2} align="center" wrap="wrap">
            {eyebrow ? (
              <Text
                type="supporting"
                color="secondary"
                weight="semibold"
                className="ad-date"
              >
                {eyebrow}
              </Text>
            ) : null}
            {meta}
          </HStack>
        ) : null}
        <Heading level={1} className="ad-page-title">
          {title}
        </Heading>
        {subtitle ? (
          <Text color="secondary" textWrap="pretty" className="ad-page-sub">
            {subtitle}
          </Text>
        ) : null}
      </VStack>
      {actions ? (
        <HStack gap={2} align="center" wrap="wrap" style={{ minWidth: 0, maxWidth: '100%' }}>
          {actions}
        </HStack>
      ) : null}
    </HStack>
  );
}
