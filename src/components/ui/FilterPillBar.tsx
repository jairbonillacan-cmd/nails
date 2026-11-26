'use client';

import type { ReactNode } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';

export interface FilterPillOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
  isDisabled?: boolean;
}

interface FilterPillBarProps<T extends string = string> {
  ariaLabel: string;
  value: T;
  options: readonly FilterPillOption<T>[];
  onChange: (value: T) => void;
  mode?: 'segmented' | 'pills';
  size?: 'sm' | 'md' | 'lg';
  layout?: 'hug' | 'fill';
  isDisabled?: boolean;
  className?: string;
}

export function FilterPillBar<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  mode = 'pills',
  size = 'md',
  layout = 'hug',
  isDisabled = false,
  className,
}: FilterPillBarProps<T>) {
  if (mode === 'segmented') {
    const handleSegmentedChange = (nextValue: string) => {
      const matched = options.find((opt) => opt.value === nextValue);
      if (matched) {
        onChange(matched.value);
      }
    };

    return (
      <SegmentedControl
        label={ariaLabel}
        value={value}
        onChange={handleSegmentedChange}
        size={size === 'sm' ? 'md' : size}
        layout={layout}
        isDisabled={isDisabled}
        className={className}
        style={{ maxWidth: '100%' }}
      >
        {options.map((opt) => {
          const itemLabel =
            typeof opt.count === 'number'
              ? `${opt.label} (${opt.count})`
              : opt.label;
          return (
            <SegmentedControlItem
              key={opt.value}
              value={opt.value}
              label={itemLabel}
              icon={opt.icon}
              isDisabled={opt.isDisabled}
            />
          );
        })}
      </SegmentedControl>
    );
  }

  return (
    <HStack
      role="group"
      aria-label={ariaLabel}
      gap={2}
      wrap="wrap"
      align="center"
      className={className}
      style={{ minWidth: 0 }}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        const hasCount = typeof opt.count === 'number';
        const ariaText = hasCount ? `${opt.label} (${opt.count})` : opt.label;

        return (
          <ToggleButton
            key={opt.value}
            label={ariaText}
            isPressed={isActive}
            isDisabled={isDisabled || opt.isDisabled}
            size={size}
            icon={opt.icon}
            onPressedChange={() => {
              if (!isActive) {
                onChange(opt.value);
              }
            }}
          >
            {hasCount ? (
              <HStack gap={1.5} align="center">
                <Text color="inherit" weight={isActive ? 'semibold' : 'medium'}>
                  {opt.label}
                </Text>
                <Badge variant="neutral" label={String(opt.count)} />
              </HStack>
            ) : (
              opt.label
            )}
          </ToggleButton>
        );
      })}
    </HStack>
  );
}
