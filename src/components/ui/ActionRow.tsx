'use client';

import type { CSSProperties, ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';

interface ActionRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  interactive?: boolean;
  isSelected?: boolean;
  isMuted?: boolean;
  onClick?: () => void;
  className?: string;
}

const CLICKABLE_BODY_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-3)',
  flex: '1 1 14rem',
  minWidth: 0,
  minHeight: '2.75rem',
  padding: 0,
  margin: 0,
  border: 0,
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
};

export function ActionRow({
  leading,
  title,
  subtitle,
  meta,
  status,
  actions,
  interactive = false,
  isSelected = false,
  isMuted = false,
  onClick,
  className,
}: ActionRowProps) {
  const rowClass = className ? `ad-row-item ${className}` : 'ad-row-item';
  const isClickable = Boolean(onClick);

  const textStack = (
    <VStack gap={0.5} style={{ minWidth: 0, flex: '1 1 0%' }}>
      {typeof title === 'string' ? (
        <Text weight="semibold" color="primary" style={{ overflowWrap: 'anywhere' }}>
          {title}
        </Text>
      ) : (
        title
      )}
      {subtitle ? (
        typeof subtitle === 'string' ? (
          <Text type="supporting" color="secondary" textWrap="pretty">
            {subtitle}
          </Text>
        ) : (
          subtitle
        )
      ) : null}
      {meta ? (
        typeof meta === 'string' ? (
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {meta}
          </Text>
        ) : (
          meta
        )
      ) : null}
    </VStack>
  );

  return (
    <HStack
      justify="between"
      align="center"
      gap={3}
      wrap="wrap"
      paddingInline={4}
      paddingBlock={3}
      className={rowClass}
      data-selected={isSelected ? 'true' : undefined}
      data-muted={isMuted ? 'true' : undefined}
      data-interactive={interactive || isClickable ? 'true' : undefined}
      style={{
        minWidth: 0,
        minHeight: '2.75rem',
        opacity: isMuted ? 0.65 : undefined,
      }}
    >
      {isClickable ? (
        <button type="button" onClick={onClick} style={CLICKABLE_BODY_STYLE}>
          {leading}
          {textStack}
        </button>
      ) : (
        <HStack align="center" gap={3} style={{ flex: '1 1 14rem', minWidth: 0 }}>
          {leading}
          {textStack}
        </HStack>
      )}
      {status || actions ? (
        <HStack gap={2} align="center" wrap="wrap" style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}>
          {status}
          {actions}
        </HStack>
      ) : null}
    </HStack>
  );
}
