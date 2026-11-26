'use client';

import type { ReactNode } from 'react';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { SurfaceCard } from './SurfaceCard';

interface EmptyStateCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3 | 4;
  isCompact?: boolean;
  framed?: boolean;
  className?: string;
}

export function EmptyStateCard({
  title,
  description,
  icon,
  actions,
  headingLevel = 3,
  isCompact = false,
  framed = true,
  className,
}: EmptyStateCardProps) {
  const content = (
    <EmptyState
      title={title}
      description={description}
      icon={icon}
      actions={actions}
      headingLevel={headingLevel}
      isCompact={isCompact}
      className={framed ? undefined : className}
    />
  );

  if (!framed) {
    return content;
  }

  return (
    <SurfaceCard tone="subtle" padded className={className}>
      {content}
    </SurfaceCard>
  );
}
