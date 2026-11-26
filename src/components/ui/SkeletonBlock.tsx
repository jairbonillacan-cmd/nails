'use client';

import type { CSSProperties } from 'react';
import { Skeleton, type SkeletonRadius } from '@astryxdesign/core/Skeleton';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';

interface SkeletonBlockProps {
  width?: number | string;
  height?: number | string;
  radius?: SkeletonRadius;
  index?: number;
  className?: string;
}

interface PageSkeletonProps {
  kpiCount?: number;
  withSplit?: boolean;
  ariaLabel?: string;
  className?: string;
}

const CARD_SHELL_STYLE: CSSProperties = {
  borderRadius: 'var(--radius-container)',
  border: '0.0625rem solid var(--ad-border, var(--color-border))',
  background: 'var(--ad-surface, var(--color-background-surface))',
  minWidth: 0,
};

export function SkeletonBlock({
  width = '100%',
  height = '1rem',
  radius = 3,
  index = 0,
  className,
}: SkeletonBlockProps) {
  return (
    <Skeleton
      width={width}
      height={height}
      radius={radius}
      index={index}
      className={className}
      aria-hidden="true"
    />
  );
}

export function PageSkeleton({
  kpiCount = 3,
  withSplit = true,
  ariaLabel = 'Cargando contenido',
  className,
}: PageSkeletonProps) {
  const rootClass = className ? `ad-page ${className}` : 'ad-page';
  const clampedKpis = Math.max(0, Math.min(6, kpiCount));

  return (
    <VStack
      className={rootClass}
      gap={5}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      style={{ minWidth: 0, width: '100%' }}
    >
      <VStack gap={2} className="ad-page-head" aria-hidden="true">
        <SkeletonBlock width="min(100%, 14rem)" height="2rem" radius={2} index={0} />
        <SkeletonBlock width="min(100%, 24rem)" height="1rem" radius={1} index={1} />
      </VStack>

      {clampedKpis > 0 ? (
        <Grid
          columns={{ minWidth: 160, max: Math.min(clampedKpis, 4) }}
          gap={3}
          aria-hidden="true"
        >
          {Array.from({ length: clampedKpis }, (_, idx) => (
            <VStack key={idx} gap={2} padding={4} style={CARD_SHELL_STYLE}>
              <SkeletonBlock width="55%" height="0.75rem" radius={1} index={idx} />
              <SkeletonBlock width="45%" height="1.75rem" radius={2} index={idx + 1} />
              <SkeletonBlock width="70%" height="0.75rem" radius={1} index={idx + 2} />
            </VStack>
          ))}
        </Grid>
      ) : null}

      {withSplit ? (
        <Grid columns={{ minWidth: 280, max: 2 }} gap={5} aria-hidden="true">
          <VStack gap={3} padding={4} style={CARD_SHELL_STYLE}>
            <SkeletonBlock width="40%" height="1.25rem" radius={2} index={2} />
            <SkeletonBlock width="100%" height="3.5rem" radius={2} index={3} />
            <SkeletonBlock width="100%" height="3.5rem" radius={2} index={4} />
            <SkeletonBlock width="100%" height="3.5rem" radius={2} index={5} />
          </VStack>
          <VStack gap={3} style={{ minWidth: 0 }}>
            <VStack gap={3} padding={4} style={CARD_SHELL_STYLE}>
              <SkeletonBlock width="50%" height="1.25rem" radius={2} index={4} />
              <SkeletonBlock width="100%" height="9rem" radius={2} index={5} />
            </VStack>
            <VStack gap={2} padding={4} style={CARD_SHELL_STYLE}>
              <SkeletonBlock width="60%" height="1rem" radius={1} index={6} />
              <SkeletonBlock width="100%" height="4.5rem" radius={2} index={7} />
            </VStack>
          </VStack>
        </Grid>
      ) : (
        <VStack gap={3} aria-hidden="true">
          <VStack gap={3} padding={4} style={CARD_SHELL_STYLE}>
            <SkeletonBlock width="35%" height="1.25rem" radius={2} index={2} />
            <SkeletonBlock width="100%" height="10rem" radius={2} index={3} />
          </VStack>
          <VStack gap={3} padding={4} style={CARD_SHELL_STYLE}>
            <SkeletonBlock width="45%" height="1.25rem" radius={2} index={4} />
            <SkeletonBlock width="100%" height="5rem" radius={2} index={5} />
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}
