'use client';

import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Check } from 'lucide-react';
import type { AccentPreset } from '@/lib/theme-presets';

interface ColorSwatchPickerProps {
  presets: readonly AccentPreset[];
  selectedLight: string;
  selectedDark: string;
  onSelect: (preset: AccentPreset) => void;
}

export function ColorSwatchPicker({
  presets,
  selectedLight,
  selectedDark,
  onSelect,
}: ColorSwatchPickerProps) {
  const normalizedLight = selectedLight.trim().toLowerCase();
  const normalizedDark = selectedDark.trim().toLowerCase();

  return (
    <VStack gap={2}>
      <Text type="label" color="secondary" weight="semibold">
        Paletas editoriales preajustadas
      </Text>
      <HStack gap={2} wrap="wrap" role="group" aria-label="Paletas de color de marca">
        {presets.map((preset) => {
          const isSelected =
            normalizedLight === preset.light.toLowerCase() &&
            normalizedDark === preset.dark.toLowerCase();
          return (
            <button
              key={preset.label}
              type="button"
              className="ad-pill fx-press"
              data-on={isSelected ? 'true' : 'false'}
              aria-pressed={isSelected}
              onClick={() => onSelect(preset)}
            >
              <HStack gap={0.5} align="center" aria-hidden="true">
                <Text
                  className="ad-swatch"
                  style={{ backgroundColor: preset.light }}
                >
                  {'\u200B'}
                </Text>
                <Text
                  className="ad-swatch"
                  style={{ backgroundColor: preset.dark, marginInlineStart: '-0.45rem' }}
                >
                  {'\u200B'}
                </Text>
              </HStack>
              <Text color="inherit" size="sm" weight="semibold">
                {preset.label}
              </Text>
              {isSelected ? <Check size={13} aria-hidden="true" className="fx-pop" /> : null}
            </button>
          );
        })}
      </HStack>
    </VStack>
  );
}
