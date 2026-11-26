'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Check } from 'lucide-react';
import { SurfaceCard } from '@/components/ui';

const WIZARD_STEPS = [
  { id: 'salon', label: 'Tu salón', short: '1. Tu salón' },
  { id: 'spei', label: 'Anticipo SPEI', short: '2. Anticipo SPEI' },
  { id: 'shifts', label: 'Tus turnos', short: '3. Tus turnos' },
  { id: 'ready', label: '¡Lista para compartir!', short: '4. ¡Lista!' },
] as const;

interface OnboardingProgressCardProps {
  stepIndex: number;
  maxReachedStep: number;
  onSelectStep: (idx: number) => void;
}

export function OnboardingProgressCard({
  stepIndex,
  maxReachedStep,
  onSelectStep,
}: OnboardingProgressCardProps) {
  return (
    <SurfaceCard padded>
      <VStack gap={3}>
        <ProgressBar
          label="Avance de guía inicial"
          isLabelHidden
          value={stepIndex + 1}
          max={WIZARD_STEPS.length}
          variant={stepIndex === 3 ? 'success' : 'accent'}
        />

        <HStack as="nav" aria-label="Pasos de la guía inicial" gap={1.5} wrap="wrap">
          {WIZARD_STEPS.map((step, idx) => {
            const isCurrent = idx === stepIndex;
            const isCompleted = idx < stepIndex || stepIndex === 3;
            const canJump = idx <= maxReachedStep;

            return (
              <Button
                key={step.id}
                type="button"
                label={step.short}
                size="sm"
                variant={isCurrent ? 'primary' : 'secondary'}
                isDisabled={!canJump}
                icon={
                  isCompleted && !isCurrent ? (
                    <Check size={13} aria-hidden="true" className="fx-pop" />
                  ) : undefined
                }
                onClick={() => {
                  if (canJump) onSelectStep(idx);
                }}
              />
            );
          })}
        </HStack>
      </VStack>
    </SurfaceCard>
  );
}
