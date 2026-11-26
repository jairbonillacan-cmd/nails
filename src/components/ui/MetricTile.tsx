'use client';

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';

type MetricTileTone = 'default' | 'warning' | 'success' | 'accent';

interface MetricTileProps {
  label: string;
  value: string;
  sub?: string;
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

function MetricTile({
  label,
  value,
  sub,
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
      gap={1}
      padding={4}
      className={tileClass}
      style={{
        minWidth: 0,
        background: 'var(--ad-surface, var(--color-background-surface))',
        border: '0.0625rem solid var(--ad-border, var(--color-border))',
        borderRadius: 'var(--radius-container)',
      }}
    >
      <Text
        type="supporting"
        color="secondary"
        weight="medium"
        className="ad-kpi-label"
      >
        {label}
      </Text>
      <Text
        className="lk-serif ad-kpi-val fx-tabular"
        data-tone={tone}
        hasTabularNumbers
        style={{
          color: TONE_VALUE_COLOR[tone],
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Text>
      {sub ? (
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
  return (
    <VStack
      as="section"
      aria-label={ariaLabel}
      gap={2}
      className={className}
      style={{ minWidth: 0 }}
    >
      <Grid
        columns={{ minWidth: 160, max: cols ?? 4 }}
        gap={3}
        className="fx-stagger"
        style={{ minWidth: 0, fontVariantNumeric: 'tabular-nums' }}
      >
        {items.map((item) => (
          <MetricTile
            key={item.id}
            label={item.label}
            value={item.value}
            sub={item.sub}
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
