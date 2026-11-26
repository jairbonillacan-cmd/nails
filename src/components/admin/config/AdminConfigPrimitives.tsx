'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

export interface AdminConfigKpiItem {
  id: string;
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'warning' | 'success';
}

interface AdminConfigPageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export function AdminConfigPageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
}: AdminConfigPageHeaderProps) {
  return (
    <HStack
      as="header"
      justify="between"
      align="end"
      gap={4}
      wrap="wrap"
      className="ad-page-head fx-fade-up"
    >
      <VStack gap={1.5} className="ad-head-copy">
        {eyebrow || meta ? (
          <HStack gap={2} align="center" wrap="wrap">
            {eyebrow ? (
              <Text type="supporting" color="secondary" weight="semibold" className="ad-date">
                {eyebrow}
              </Text>
            ) : null}
            {meta}
          </HStack>
        ) : null}
        <Heading level={1} className="ad-page-title">
          {title}
        </Heading>
        <Text color="secondary" className="ad-page-sub">
          {subtitle}
        </Text>
      </VStack>
      {actions ? (
        <HStack gap={2} align="center" wrap="wrap">
          {actions}
        </HStack>
      ) : null}
    </HStack>
  );
}

interface AdminConfigKpiStripProps {
  ariaLabel: string;
  items: readonly AdminConfigKpiItem[];
  cols?: 2 | 3 | 4;
}

export function AdminConfigKpiStrip({
  ariaLabel,
  items,
  cols,
}: AdminConfigKpiStripProps) {
  return (
    <section
      aria-label={ariaLabel}
      className="ad-kpi-grid fx-stagger"
      data-cols={cols ? String(cols) : undefined}
    >
      {items.map((item) => (
        <VStack key={item.id} as="article" className="ad-card ad-kpi-card" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            {item.label}
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={item.tone ?? 'default'}
            hasTabularNumbers
          >
            {item.value}
          </Text>
          {item.sub ? (
            <Text type="supporting" color="secondary" className="ad-kpi-sub">
              {item.sub}
            </Text>
          ) : null}
        </VStack>
      ))}
    </section>
  );
}

interface AdminConfigSectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'default' | 'subtle' | 'accent' | 'warning';
  padded?: boolean;
  overflowVisible?: boolean;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function AdminConfigSection({
  id,
  title,
  subtitle,
  icon,
  badge,
  actions,
  tone = 'default',
  padded = false,
  overflowVisible = false,
  footer,
  className,
  children,
}: AdminConfigSectionProps) {
  const hasHeader = Boolean(title || subtitle || actions || badge);
  const surfaceClass = className ? `ad-surface ${className}` : 'ad-surface';

  return (
    <VStack
      as="section"
      aria-labelledby={id && title ? id : undefined}
      className={surfaceClass}
      data-tone={tone !== 'default' ? tone : undefined}
      data-padded={padded ? 'true' : undefined}
      data-overflow={overflowVisible ? 'true' : undefined}
      gap={0}
    >
      {hasHeader ? (
        <HStack
          justify="between"
          align="center"
          gap={3}
          wrap="wrap"
          className="ad-section-head"
        >
          <VStack gap={0.5} className="rb-grow">
            <HStack gap={2} align="center" wrap="wrap">
              {icon}
              {title ? (
                <Heading level={2} id={id} className="lk-serif ad-h2">
                  {title}
                </Heading>
              ) : null}
              {badge}
            </HStack>
            {subtitle ? (
              <Text type="supporting" color="secondary">
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
        <HStack justify="between" align="center" gap={3} wrap="wrap" className="ad-card-foot">
          {footer}
        </HStack>
      ) : null}
    </VStack>
  );
}

interface AdminConfigChipProps {
  label: string;
  tone?: 'neutral' | 'warning' | 'accent' | 'success' | 'solid';
  icon?: React.ReactNode;
  hasTabularNumbers?: boolean;
  className?: string;
}

export function AdminConfigChip({
  label,
  tone = 'neutral',
  icon,
  hasTabularNumbers = false,
  className,
}: AdminConfigChipProps) {
  const baseClass =
    tone === 'solid' ? 'ad-chip ad-chip-solid' : 'ad-chip';
  const finalClass = className ? `${baseClass} ${className}` : baseClass;

  return (
    <Text
      color="inherit"
      className={finalClass}
      data-tone={tone === 'solid' ? undefined : tone}
      hasTabularNumbers={hasTabularNumbers}
    >
      {icon}
      {label}
    </Text>
  );
}

interface AdminConfigEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function AdminConfigEmpty({
  icon,
  title,
  description,
  action,
}: AdminConfigEmptyProps) {
  return (
    <VStack className="ad-empty fx-fade-up" align="center" gap={2}>
      {icon}
      <Text weight="semibold" color="primary">
        {title}
      </Text>
      <Text type="supporting" color="secondary" style={{ maxWidth: '28rem' }}>
        {description}
      </Text>
      {action ? <HStack gap={2}>{action}</HStack> : null}
    </VStack>
  );
}

interface AdminConfigSkeletonProps {
  kpiCount?: number;
  withSplit?: boolean;
}

export function AdminConfigSkeleton({
  kpiCount = 3,
  withSplit = true,
}: AdminConfigSkeletonProps) {
  return (
    <VStack
      className="ad-page"
      role="status"
      aria-live="polite"
      aria-label="Cargando configuración"
    >
      <VStack gap={2} className="ad-page-head">
        <Text className="ad-skeleton" data-size="title" aria-hidden="true">
          {'\u200B'}
        </Text>
        <Text className="ad-skeleton" data-size="line" data-width="mid" aria-hidden="true">
          {'\u200B'}
        </Text>
      </VStack>

      {kpiCount > 0 ? (
        <section
          className="ad-kpi-grid"
          data-cols={kpiCount <= 4 ? String(kpiCount) : '4'}
          aria-hidden="true"
        >
          {Array.from({ length: kpiCount }, (_, idx) => (
            <Text key={idx} className="ad-skeleton" data-size="kpi">
              {'\u200B'}
            </Text>
          ))}
        </section>
      ) : null}

      {withSplit ? (
        <VStack className="ad-split" gap={5} aria-hidden="true">
          <VStack gap={3}>
            <Text className="ad-skeleton" data-size="card">
              {'\u200B'}
            </Text>
            <Text className="ad-skeleton" data-size="row">
              {'\u200B'}
            </Text>
            <Text className="ad-skeleton" data-size="row">
              {'\u200B'}
            </Text>
          </VStack>
          <Text className="ad-skeleton" data-size="hero">
            {'\u200B'}
          </Text>
        </VStack>
      ) : (
        <VStack gap={3} aria-hidden="true">
          <Text className="ad-skeleton" data-size="hero">
            {'\u200B'}
          </Text>
          <Text className="ad-skeleton" data-size="card">
            {'\u200B'}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
