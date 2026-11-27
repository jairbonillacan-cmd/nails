'use client';

import { Skeleton, type SkeletonRadius } from '@astryxdesign/core/Skeleton';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { BrandLoader } from '@/components/brand/BrandLoader';
import { MorphLoader } from '@/components/brand/MorphLoader';

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
  withHeader?: boolean;
}

interface AdminShellSkeletonProps {
  ariaLabel?: string;
}

const LIST_PLACEHOLDERS = [0, 1, 2, 3] as const;

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
  kpiCount = 4,
  withSplit = true,
  ariaLabel = 'Cargando contenido',
  className,
  withHeader = true,
}: PageSkeletonProps) {
  const rootClass = className ? `ad-page ${className}` : 'ad-page';
  const clampedKpis = Math.max(0, Math.min(6, kpiCount));

  return (
    <VStack
      className={rootClass}
      gap={5}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel}
      style={{ minWidth: 0, width: '100%' }}
    >
      {withHeader ? (
      <HStack
        justify="between"
        align="end"
        wrap="wrap"
        gap={3}
        className="ad-page-head"
      >
        <VStack gap={2} style={{ minWidth: 0, flex: '1 1 16rem' }}>
          <HStack align="center" gap={2}>
            <MorphLoader size="sm" tone="cherry" />
          </HStack>
          <SkeletonBlock width="min(100%, 14rem)" height="2.25rem" radius={2} index={0} />
          <SkeletonBlock width="min(100%, 24rem)" height="0.9375rem" radius={1} index={1} />
        </VStack>
        <HStack gap={2} aria-hidden="true">
          <SkeletonBlock width="7.5rem" height="2.25rem" radius="rounded" index={2} />
        </HStack>
      </HStack>
      ) : null}

      {clampedKpis > 0 ? (
        <Grid
          columns={{ minWidth: 200, max: Math.min(clampedKpis, 4) }}
          gap={3}
          aria-hidden="true"
        >
          {Array.from({ length: clampedKpis }, (_, idx) => (
            <VStack key={idx} gap={2} padding={5} className="ad-sk-kpi">
              <SkeletonBlock width="52%" height="0.875rem" radius={1} index={idx} />
              <SkeletonBlock width="48%" height="2rem" radius={2} index={idx + 1} />
              <SkeletonBlock width="64%" height="0.75rem" radius={1} index={idx + 2} />
            </VStack>
          ))}
        </Grid>
      ) : null}

      {withSplit ? (
        <VStack className="ad-main" gap={4} aria-hidden="true">
          <VStack gap={0} className="ad-sk-card">
            <HStack justify="between" align="center" padding={5} gap={2}>
              <SkeletonBlock width="38%" height="1.125rem" radius={2} index={2} />
              <SkeletonBlock width="6.5rem" height="2rem" radius="rounded" index={3} />
            </HStack>
            {LIST_PLACEHOLDERS.map((row) => (
              <HStack key={row} gap={3} align="center" className="ad-sk-row">
                <SkeletonBlock width="2.5rem" height="2.5rem" radius="rounded" index={row + 2} />
                <VStack gap={1.5} className="rb-grow">
                  <SkeletonBlock width="58%" height="0.9375rem" radius={1} index={row + 3} />
                  <SkeletonBlock width="38%" height="0.75rem" radius={1} index={row + 4} />
                </VStack>
                <SkeletonBlock width="4.75rem" height="1.5rem" radius="rounded" index={row + 5} />
              </HStack>
            ))}
          </VStack>

          <VStack gap={4} style={{ minWidth: 0 }}>
            <VStack gap={3} padding={5} className="ad-sk-card">
              <SkeletonBlock width="52%" height="1.125rem" radius={2} index={5} />
              <SkeletonBlock width="100%" height="0.875rem" radius={1} index={6} />
              <SkeletonBlock width="84%" height="0.875rem" radius={1} index={7} />
              <SkeletonBlock width="100%" height="2.75rem" radius={2} index={8} />
            </VStack>
          </VStack>
        </VStack>
      ) : (
        <VStack gap={4} aria-hidden="true">
          <VStack gap={0} className="ad-sk-card">
            <HStack justify="between" align="center" padding={5} gap={2} wrap="wrap">
              <SkeletonBlock width="36%" height="1.125rem" radius={2} index={2} />
              <HStack gap={2}>
                <SkeletonBlock width="5.5rem" height="2rem" radius="rounded" index={3} />
                <SkeletonBlock width="5.5rem" height="2rem" radius="rounded" index={4} />
              </HStack>
            </HStack>
            {LIST_PLACEHOLDERS.map((row) => (
              <HStack key={row} gap={3} align="center" className="ad-sk-row">
                <SkeletonBlock width="2.5rem" height="2.5rem" radius="rounded" index={row + 2} />
                <VStack gap={1.5} className="rb-grow">
                  <SkeletonBlock width="52%" height="0.9375rem" radius={1} index={row + 3} />
                  <SkeletonBlock width="34%" height="0.75rem" radius={1} index={row + 4} />
                </VStack>
                <SkeletonBlock width="5rem" height="1.5rem" radius="rounded" index={row + 5} />
              </HStack>
            ))}
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}

export function AdminShellSkeleton({
  ariaLabel = 'Abriendo tu panel de LAIKONA NAILS',
}: AdminShellSkeletonProps) {
  return <BrandLoader label={ariaLabel} />;
}