'use client';

import type { CSSProperties, ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';

interface CopyableFieldProps {
  label?: string;
  value: string;
  displayValue?: string;
  copyValue?: string;
  copyLabel?: string;
  copiedLabel?: string;
  feedbackMessage?: string;
  monospace?: boolean;
  layout?: 'inline' | 'stacked';
  iconOnly?: boolean;
  endExtra?: ReactNode;
  className?: string;
}

const SR_ONLY_STYLE: CSSProperties = {
  position: 'absolute',
  width: '0.0625rem',
  height: '0.0625rem',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

const BOX_SURFACE_STYLE: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  borderRadius: 'var(--radius-element)',
  background: 'var(--ad-surface-alt, var(--color-background-surface))',
  border: '0.0625rem solid var(--ad-border, var(--color-border))',
};

export function CopyableField({
  label,
  value,
  displayValue,
  copyValue,
  copyLabel = 'Copiar',
  copiedLabel = 'Copiado',
  feedbackMessage = 'Copiado al portapapeles',
  monospace = false,
  layout = 'inline',
  iconOnly = false,
  endExtra,
  className,
}: CopyableFieldProps) {
  const { copied, feedback, copy } = useCopyToClipboard();
  const shownValue = displayValue ?? value;
  const targetToCopy = copyValue ?? value;
  const activeLabel = copied ? copiedLabel : copyLabel;
  const accessibleLabel = label ? `${activeLabel} ${label}` : activeLabel;

  const handleCopy = () => {
    void copy(
      targetToCopy,
      feedbackMessage,
      'No se pudo copiar automáticamente; selecciona el texto.',
    );
  };

  const copyIcon = copied ? (
    <Check size={15} aria-hidden="true" />
  ) : (
    <Copy size={15} aria-hidden="true" />
  );

  const actionButton = iconOnly ? (
    <IconButton
      type="button"
      variant={copied ? 'primary' : 'secondary'}
      size="md"
      label={accessibleLabel}
      tooltip={activeLabel}
      icon={copyIcon}
      onClick={handleCopy}
      style={{ minWidth: '2.75rem', minHeight: '2.75rem' }}
    />
  ) : (
    <Button
      type="button"
      variant={copied ? 'primary' : 'secondary'}
      size="md"
      label={activeLabel}
      aria-label={accessibleLabel}
      icon={copyIcon}
      onClick={handleCopy}
      style={{ minHeight: '2.75rem' }}
    />
  );

  return (
    <VStack gap={1.5} className={className} style={{ width: '100%', minWidth: 0, position: 'relative' }}>
      {layout === 'stacked' ? (
        <VStack gap={2} style={{ width: '100%', minWidth: 0 }}>
          <HStack justify={label ? 'between' : 'end'} align="center" gap={2} wrap="wrap">
            {label ? (
              <Text type="supporting" color="secondary" weight="medium">
                {label}
              </Text>
            ) : null}
            <HStack gap={1.5} align="center" wrap="wrap">
              {endExtra}
              {actionButton}
            </HStack>
          </HStack>
          <VStack padding={3} style={{ ...BOX_SURFACE_STYLE, overflowX: 'auto' }}>
            <Text
              type={monospace ? 'code' : 'body'}
              hasTabularNumbers={monospace}
              style={{
                whiteSpace: monospace ? 'pre-wrap' : 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {shownValue}
            </Text>
          </VStack>
        </VStack>
      ) : (
        <HStack
          justify="between"
          align="center"
          gap={2}
          wrap="wrap"
          paddingInline={3}
          paddingBlock={2}
          style={{ ...BOX_SURFACE_STYLE, minHeight: '2.75rem' }}
        >
          <VStack gap={0.5} style={{ minWidth: 0, flex: '1 1 10rem' }}>
            {label ? (
              <Text type="supporting" color="secondary">
                {label}
              </Text>
            ) : null}
            <Text
              type={monospace ? 'code' : 'body'}
              weight={monospace ? 'semibold' : 'medium'}
              hasTabularNumbers={monospace}
              style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
            >
              {shownValue}
            </Text>
          </VStack>
          <HStack gap={1.5} align="center" wrap="wrap">
            {endExtra}
            {actionButton}
          </HStack>
        </HStack>
      )}
      <Text
        type="supporting"
        color={copied ? 'accent' : 'secondary'}
        role="status"
        aria-live="polite"
        style={feedback ? undefined : SR_ONLY_STYLE}
      >
        {feedback ?? ''}
      </Text>
    </VStack>
  );
}
