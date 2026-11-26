'use client';

import type { CSSProperties, ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';

type SurfaceCardTone = 'default' | 'subtle' | 'accent' | 'warning';

interface SurfaceCardProps {
  id?: string;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  count?: number;
  badge?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  tone?: SurfaceCardTone;
  padded?: boolean;
  overflowVisible?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
}

const TONE_SURFACE_STYLES: Record<SurfaceCardTone, CSSProperties> = {
  default: {
    background: 'var(--ad-surface, var(--color-background-surface))',
    border: '0.0625rem solid var(--ad-border, var(--color-border))',
  },
  subtle: {
    background: 'var(--ad-surface-alt, var(--color-background-muted))',
    border: '0.0625rem solid var(--ad-border, var(--color-border))',
  },
  accent: {
    background:
      'var(--ad-cherry-soft, color-mix(in srgb, var(--color-accent) 11%, var(--color-background-surface)))',
    border:
      '0.0625rem solid color-mix(in srgb, var(--color-accent) 24%, var(--color-border))',
  },
  warning: {
    background:
      'color-mix(in srgb, var(--color-warning-muted) 42%, var(--color-background-surface))',
    border: '0.0625rem solid var(--color-border-warning)',
  },
};

export function SurfaceCard({
  id,
  title,
  subtitle,
  icon,
  count,
  badge,
  actions,
  footer,
  tone = 'default',
  padded = false,
  overflowVisible = false,
  headingLevel = 2,
  className,
  children,
}: SurfaceCardProps) {
  const hasCount = typeof count === 'number';
  const hasHeader = Boolean(title || subtitle || actions || badge || hasCount);
  const surfaceClass = className ? `ad-surface ${className}` : 'ad-surface';
  const headingClass = headingLevel === 2 ? 'lk-serif ad-h2' : 'lk-serif ad-h3';

  return (
    <VStack
      as="section"
      aria-labelledby={id && title ? id : undefined}
      className={surfaceClass}
      data-tone={tone !== 'default' ? tone : undefined}
      data-padded={padded ? 'true' : undefined}
      data-overflow={overflowVisible ? 'visible' : undefined}
      padding={padded ? 5 : 0}
      gap={0}
      style={{
        ...TONE_SURFACE_STYLES[tone],
        borderRadius: 'var(--radius-container)',
        minWidth: 0,
        overflow: overflowVisible ? 'visible' : 'hidden',
      }}
    >
      {hasHeader ? (
        <HStack
          justify="between"
          align="center"
          gap={3}
          wrap="wrap"
          className="ad-section-head"
          paddingInline={padded ? 0 : 5}
          paddingBlockStart={padded ? 0 : 4}
          paddingBlockEnd={4}
          style={{
            minWidth: 0,
            borderBottom: '0.0625rem solid var(--ad-border-soft, var(--color-border))',
            marginBlockEnd: padded ? 'var(--spacing-3)' : 0,
          }}
        >
          <VStack gap={0.5} style={{ minWidth: 0, flex: '1 1 12rem' }}>
            <HStack gap={2} align="center" wrap="wrap">
              {icon}
              {title ? (
                <Heading level={headingLevel} id={id} className={headingClass}>
                  {title}
                </Heading>
              ) : null}
              {hasCount ? <Badge variant="neutral" label={String(count)} /> : null}
              {badge}
            </HStack>
            {subtitle ? (
              <Text type="supporting" color="secondary" textWrap="pretty">
                {subtitle}
              </Text>
            ) : null}
          </VStack>
          {actions ? (
            <HStack gap={2} align="center" wrap="wrap">
              {actions}
            </HStack>
          ) : null}
        </HStack>
      ) : null}
      {children}
      {footer ? (
        <HStack
          justify="between"
          align="center"
          gap={3}
          wrap="wrap"
          className="ad-card-foot"
          paddingInline={padded ? 0 : 5}
          paddingBlock={3}
          style={{
            borderTop: '0.0625rem solid var(--ad-border-soft, var(--color-border))',
            marginBlockStart: padded ? 'var(--spacing-3)' : 0,
          }}
        >
          {footer}
        </HStack>
      ) : null}
    </VStack>
  );
}
