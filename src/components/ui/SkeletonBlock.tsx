'use client';

import { Skeleton, type SkeletonRadius } from '@astryxdesign/core/Skeleton';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

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

interface AdminShellSkeletonProps {
  isDark?: boolean;
  ariaLabel?: string;
}

const LIST_PLACEHOLDERS = [0, 1, 2, 3] as const;
const NAV_GROUP_ONE = [0, 1, 2, 3] as const;
const NAV_GROUP_TWO = [0, 1, 2] as const;

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
      aria-busy="true"
      aria-label={ariaLabel}
      style={{ minWidth: 0, width: '100%' }}
    >
      <HStack
        justify="between"
        align="end"
        wrap="wrap"
        gap={3}
        className="ad-page-head"
      >
        <VStack gap={2} style={{ minWidth: 0, flex: '1 1 16rem' }}>
          <HStack align="center" gap={2}>
            <Text color="inherit" className="sk-eyebrow">
              {ariaLabel}…
            </Text>
          </HStack>
          <SkeletonBlock width="min(100%, 15rem)" height="2rem" radius={2} index={0} />
          <SkeletonBlock width="min(100%, 24rem)" height="0.9375rem" radius={1} index={1} />
        </VStack>
        <HStack gap={2} aria-hidden="true">
          <SkeletonBlock width="7.5rem" height="2.5rem" radius={2} index={2} />
        </HStack>
      </HStack>

      {clampedKpis > 0 ? (
        <Grid
          columns={{ minWidth: 160, max: Math.min(clampedKpis, 4) }}
          gap={3}
          aria-hidden="true"
        >
          {Array.from({ length: clampedKpis }, (_, idx) => (
            <VStack key={idx} gap={2} padding={4} className="ad-sk-kpi">
              <SkeletonBlock width="52%" height="0.75rem" radius={1} index={idx} />
              <SkeletonBlock width="42%" height="1.75rem" radius={2} index={idx + 1} />
              <SkeletonBlock width="68%" height="0.75rem" radius={1} index={idx + 2} />
            </VStack>
          ))}
        </Grid>
      ) : null}

      {withSplit ? (
        <Grid columns={{ minWidth: 280, max: 2 }} gap={5} aria-hidden="true">
          <VStack gap={0} className="ad-sk-card">
            <HStack justify="between" align="center" padding={4} gap={2}>
              <SkeletonBlock width="42%" height="1.25rem" radius={2} index={2} />
              <SkeletonBlock width="5.5rem" height="1.75rem" radius="rounded" index={3} />
            </HStack>
            {LIST_PLACEHOLDERS.map((row) => (
              <HStack key={row} gap={3} align="center" className="ad-sk-row">
                <SkeletonBlock width="2.5rem" height="2.5rem" radius="rounded" index={row + 2} />
                <VStack gap={1.5} className="rb-grow">
                  <SkeletonBlock width="58%" height="0.9375rem" radius={1} index={row + 3} />
                  <SkeletonBlock width="38%" height="0.75rem" radius={1} index={row + 4} />
                </VStack>
                <SkeletonBlock width="4.75rem" height="1.625rem" radius="rounded" index={row + 5} />
              </HStack>
            ))}
          </VStack>

          <VStack gap={4} style={{ minWidth: 0 }}>
            <VStack className="ad-cherry-card" gap={3}>
              <VStack className="sk-bar" data-size="xs" data-w="25" data-on="cherry" />
              <VStack className="sk-bar" data-size="md" data-w="80" data-on="cherry" />
              <VStack className="ad-skeleton" data-size="row" data-on="cherry" />
              <HStack gap={2} wrap="wrap">
                <VStack className="sk-bar" data-size="pill" data-on="cherry" />
                <VStack className="sk-bar" data-size="pill" data-on="cherry" />
              </HStack>
            </VStack>

            <VStack gap={3} padding={4} className="ad-sk-card">
              <SkeletonBlock width="52%" height="1.125rem" radius={2} index={5} />
              <SkeletonBlock width="100%" height="0.875rem" radius={1} index={6} />
              <SkeletonBlock width="84%" height="0.875rem" radius={1} index={7} />
              <SkeletonBlock width="100%" height="3rem" radius={2} index={8} />
            </VStack>
          </VStack>
        </Grid>
      ) : (
        <VStack gap={4} aria-hidden="true">
          <VStack gap={0} className="ad-sk-card">
            <HStack justify="between" align="center" padding={4} gap={2} wrap="wrap">
              <SkeletonBlock width="36%" height="1.25rem" radius={2} index={2} />
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
                <SkeletonBlock width="5rem" height="1.75rem" radius="rounded" index={row + 5} />
              </HStack>
            ))}
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}

export function AdminShellSkeleton({
  isDark = false,
  ariaLabel = 'Abriendo tu panel de LAIKONA NAILS',
}: AdminShellSkeletonProps) {
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;

  return (
    <VStack className="ad-shell" gap={0} role="status" aria-busy="true" aria-label={ariaLabel}>
      <Text className="rb-sr-only">{ariaLabel}…</Text>

      <HStack className="ad-mobile-top" justify="between" align="center" gap={2} aria-hidden="true">
        <SkeletonBlock width="2.75rem" height="2.75rem" radius={2} index={0} />
        <img src={brandLogo} alt="" width={110} height={32} className="ad-logo" />
        <SkeletonBlock width="2.75rem" height="2.75rem" radius={2} index={1} />
      </HStack>

      <HStack className="ad-frame" gap={0} align="stretch">
        <VStack className="ad-side" justify="between" gap={5} aria-hidden="true">
          <VStack gap={5}>
            <HStack className="ad-side-top" justify="between" align="center" gap={2}>
              <img src={brandLogo} alt="" width={116} height={34} className="ad-logo" />
              <SkeletonBlock width="1.75rem" height="1.75rem" radius={2} index={0} />
            </HStack>

            <SkeletonBlock width="100%" height="2.5rem" radius={2} index={1} />

            <VStack gap={2}>
              <SkeletonBlock width="42%" height="0.75rem" radius={1} index={1} />
              {NAV_GROUP_ONE.map((idx) => (
                <SkeletonBlock key={idx} width="100%" height="2.25rem" radius={2} index={idx + 2} />
              ))}
            </VStack>

            <VStack gap={2}>
              <SkeletonBlock width="46%" height="0.75rem" radius={1} index={4} />
              {NAV_GROUP_TWO.map((idx) => (
                <SkeletonBlock key={idx} width="100%" height="2.25rem" radius={2} index={idx + 5} />
              ))}
            </VStack>
          </VStack>

          <HStack gap={2} align="center" padding={2} className="ad-sk-card">
            <SkeletonBlock width="2.25rem" height="2.25rem" radius="rounded" index={7} />
            <VStack gap={1} className="rb-grow">
              <SkeletonBlock width="70%" height="0.8125rem" radius={1} index={7} />
              <SkeletonBlock width="48%" height="0.6875rem" radius={1} index={8} />
            </VStack>
          </HStack>
        </VStack>

        <VStack className="ad-main-wrap" gap={0}>
          <VStack className="ad-sheet" gap={5}>
            <VStack gap={5} width="100%" className="ad-content-inner">
              <PageSkeleton kpiCount={4} withSplit ariaLabel={ariaLabel} />
            </VStack>
          </VStack>
        </VStack>
      </HStack>
    </VStack>
  );
}
