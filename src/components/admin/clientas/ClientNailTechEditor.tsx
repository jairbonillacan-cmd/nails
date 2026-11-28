'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Sparkles } from 'lucide-react';
import { SurfaceCard } from '@/components/ui';
import {
  NAIL_ALERTS,
  NAIL_BASES,
  NAIL_LENGTHS,
  NAIL_SHAPES,
  type NailAlert,
  type NailBase,
  type NailLength,
  type NailShape,
  type NailTechProfile,
} from './nailTechProfile';

function toggleSingleChoice<T extends string>(current: T | null, next: T): T | null {
  return current === next ? null : next;
}

function toggleAlertChoice(current: readonly NailAlert[], alert: NailAlert): NailAlert[] {
  if (current.includes(alert)) {
    return current.filter((item) => item !== alert);
  }
  return [...current, alert];
}

interface ClientNailTechEditorProps {
  value: NailTechProfile;
  canEdit: boolean;
  onChange: (next: NailTechProfile) => void;
}

export function ClientNailTechEditor({
  value,
  canEdit,
  onChange,
}: ClientNailTechEditorProps) {
  const handleShapeToggle = (shape: NailShape) => {
    onChange({
      ...value,
      shape: toggleSingleChoice(value.shape, shape),
    });
  };

  const handleLengthToggle = (length: NailLength) => {
    onChange({
      ...value,
      length: toggleSingleChoice(value.length, length),
    });
  };

  const handleBaseToggle = (base: NailBase) => {
    onChange({
      ...value,
      base: toggleSingleChoice(value.base, base),
    });
  };

  const handleAlertToggle = (alert: NailAlert) => {
    onChange({
      ...value,
      alerts: toggleAlertChoice(value.alerts, alert),
    });
  };

  return (
    <SurfaceCard
      title="Ficha técnica de uñas"
      headingLevel={3}
      icon={<Sparkles size={15} aria-hidden="true" />}
      tone="subtle"
      padded
    >
      <VStack gap={3}>
        <VStack gap={1.5}>
          <Text type="supporting" weight="semibold">
            Forma
          </Text>
          <HStack gap={1.5} wrap="wrap">
            {NAIL_SHAPES.map((shape) => {
              const selected = value.shape === shape;
              return (
                <button
                  key={shape}
                  type="button"
                  className="ad-tech-chip"
                  aria-pressed={selected}
                  data-selected={selected ? 'true' : 'false'}
                  disabled={!canEdit}
                  onClick={() => handleShapeToggle(shape)}
                >
                  {shape}
                </button>
              );
            })}
          </HStack>
        </VStack>

        <VStack gap={1.5}>
          <Text type="supporting" weight="semibold">
            Largo
          </Text>
          <HStack gap={1.5} wrap="wrap">
            {NAIL_LENGTHS.map((length) => {
              const selected = value.length === length;
              return (
                <button
                  key={length}
                  type="button"
                  className="ad-tech-chip"
                  aria-pressed={selected}
                  data-selected={selected ? 'true' : 'false'}
                  disabled={!canEdit}
                  onClick={() => handleLengthToggle(length)}
                >
                  {length}
                </button>
              );
            })}
          </HStack>
        </VStack>

        <VStack gap={1.5}>
          <Text type="supporting" weight="semibold">
            Base favorita
          </Text>
          <HStack gap={1.5} wrap="wrap">
            {NAIL_BASES.map((base) => {
              const selected = value.base === base;
              return (
                <button
                  key={base}
                  type="button"
                  className="ad-tech-chip"
                  aria-pressed={selected}
                  data-selected={selected ? 'true' : 'false'}
                  disabled={!canEdit}
                  onClick={() => handleBaseToggle(base)}
                >
                  {base}
                </button>
              );
            })}
          </HStack>
        </VStack>

        <VStack gap={1.5}>
          <Text type="supporting" weight="semibold">
            Alertas y sensibilidad
          </Text>
          <HStack gap={1.5} wrap="wrap">
            {NAIL_ALERTS.map((alert) => {
              const selected = value.alerts.includes(alert);
              return (
                <button
                  key={alert}
                  type="button"
                  className="ad-tech-chip"
                  aria-pressed={selected}
                  data-selected={selected ? 'true' : 'false'}
                  data-tone="warning"
                  disabled={!canEdit}
                  onClick={() => handleAlertToggle(alert)}
                >
                  {alert}
                </button>
              );
            })}
          </HStack>
        </VStack>
      </VStack>
    </SurfaceCard>
  );
}
