'use client';

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';

type MetricTileTone = 'default' | 'warning' | 'success' | 'accent';

interface MetricTileDelta {
  text: string;
  tone?: MetricTileTone;
  detail?: string;
}

interface MetricTileProps {
  label: string;
  description?: string;
  value: string;
  unitPrefix?: string;
  unitSuffix?: string;
  sub?: string;
  delta?: MetricTileDelta;
  sparkline?: readonly number[];
  tone?: MetricTileTone;
  interactive?: boolean;
  className?: string;
}

export type MetricTileItem = MetricTileProps & { id: string };

interface MetricGridProps {
  ariaLabel: string;
  items: readonly MetricTileItem[];
  cols?: 2 | 3 | 4;
  footerLink?: ReactNode;
  className?: string;
}

const TONE_VALUE_COLOR: Record<MetricTileTone, string> = {
  default: 'var(--color-text-primary)',
  warning: 'var(--color-text-warning)',
  success: 'var(--color-text-success)',
  accent: 'var(--color-text-accent)',
};

function MetricSparkline({ points }: { points: readonly number[] }) {
  if (points.length < 2) return null;
  const width = 64;
  const height = 24;
  const padX = 3;
  const padY = 4;
  const minVal = Math.min(...points);
  const maxVal = Math.max(...points);
  const span = maxVal - minVal;
  const stepX = (width - padX * 2) / (points.length - 1);

  const coords = points.map((val, idx) => {
    const x = padX + idx * stepX;
    const normalized = span === 0 ? 0.5 : (val - minVal) / span;
    const y = height - padY - normalized * (height - padY * 2);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const pathData = coords.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`).join(' ');
  const last = coords[coords.length - 1];

  return (
    <svg
      className="ad-kpi-spark"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
    >
      <path d={pathData} className="ad-kpi-spark-line" />
      {last ? <circle cx={last.x} cy={last.y} r="2.6" className="ad-kpi-spark-dot" /> : null}
    </svg>
  );
}

function MetricTile({
  label,
  description,
  value,
  unitPrefix,
  unitSuffix,
  sub,
  delta,
  sparkline,
  tone = 'default',
  interactive = false,
  className,
}: MetricTileProps) {
  const baseClass = interactive
    ? 'ad-card ad-kpi-card fx-card-lift'
    : 'ad-card ad-kpi-card';
  const tileClass = className ? `${baseClass} ${className}` : baseClass;

  return (
    <VStack
      as="article"
      gap={3}
      justify="between"
      padding={5}
      className={tileClass}
      style={{
        minWidth: 0,
        background: 'var(--ad-surface, var(--color-background-surface))',
        border: '0.0625rem solid var(--ad-border, var(--color-border))',
        borderRadius: 'var(--ad-card-radius, var(--radius-container))',
      }}
    >
      <VStack gap={0.5} style={{ minWidth: 0 }}>
        <Text
          color="primary"
          weight="semibold"
          className="ad-kpi-label"
        >
          {label}
        </Text>
        {description ? (
          <Text type="supporting" color="secondary" className="ad-kpi-desc">
            {description}
          </Text>
        ) : null}
      </VStack>

      <HStack justify="between" align="end" gap={2} style={{ minWidth: 0 }}>
        <HStack align="end" gap={1.5} wrap="wrap" style={{ minWidth: 0 }}>
          {unitPrefix ? (
            <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-unit">
              {unitPrefix}
            </Text>
          ) : null}
          <Text
            className="ad-kpi-val fx-tabular"
            data-tone={tone}
            hasTabularNumbers
            style={{
              color: TONE_VALUE_COLOR[tone],
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </Text>
          {unitSuffix ? (
            <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-unit" hasTabularNumbers>
              {unitSuffix}
            </Text>
          ) : null}
        </HStack>
        {sparkline && sparkline.length >= 2 ? <MetricSparkline points={sparkline} /> : null}
      </HStack>

      {delta ? (
        <HStack gap={1.5} align="center" wrap="wrap" className="ad-kpi-foot">
          <Text
            type="supporting"
            weight="semibold"
            hasTabularNumbers
            style={{ color: TONE_VALUE_COLOR[delta.tone ?? 'accent'] }}
          >
            {delta.text}
          </Text>
          {delta.detail ? (
            <Text type="supporting" color="secondary">
              {delta.detail}
            </Text>
          ) : null}
        </HStack>
      ) : sub ? (
        <Text type="supporting" color="secondary" className="ad-kpi-sub">
          {sub}
        </Text>
      ) : null}
    </VStack>
  );
}

export function MetricGrid({
  ariaLabel,
  items,
  cols,
  footerLink,
  className,
}: MetricGridProps) {
  const effectiveCols = cols ?? 4;
  const gridModifier =
    effectiveCols === 4
      ? 'ad-metric-grid-4'
      : effectiveCols === 3
        ? 'ad-metric-grid-3'
        : 'ad-metric-grid-2';

  return (
    <VStack
      as="section"
      aria-label={ariaLabel}
      gap={2}
      className={`ad-metric-grid ${gridModifier}${className ? ` ${className}` : ''}`}
      style={{ minWidth: 0 }}
    >
      <Grid
        columns={{ minWidth: 200, max: effectiveCols }}
        gap={3}
        className="fx-stagger"
        style={{ minWidth: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        {items.map((item) => (
          <MetricTile
            key={item.id}
            label={item.label}
            description={item.description}
            value={item.value}
            unitPrefix={item.unitPrefix}
            unitSuffix={item.unitSuffix}
            sub={item.sub}
            delta={item.delta}
            sparkline={item.sparkline}
            tone={item.tone}
            interactive={item.interactive}
            className={item.className}
          />
        ))}
      </Grid>
      {footerLink ? <HStack justify="end">{footerLink}</HStack> : null}
    </VStack>
  );
}
