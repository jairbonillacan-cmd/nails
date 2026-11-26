'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Clock } from 'lucide-react';

interface HoldExpiredBannerProps {
  message: string | null;
  isReholding: boolean;
  onRehold: () => void;
  onPickAnotherTime: () => void;
}

export function HoldExpiredBanner({ message, isReholding, onRehold, onPickAnotherTime }: HoldExpiredBannerProps) {
  return (
    <VStack className="fx-fade-up">
      <Banner
        status="warning"
        role="alert"
        title="Tu apartado temporal terminó"
        description={message || 'No perdiste nada de lo que escribiste. Revisa si tu horario sigue libre o escoge otro.'}
        icon={<Clock size={18} aria-hidden="true" />}
      >
        <HStack gap={2} wrap="wrap" paddingBlockStart={2}>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="fx-press"
            label={isReholding ? 'Revisando…' : 'Apartarlo otra vez'}
            isLoading={isReholding}
            isDisabled={isReholding}
            onClick={onRehold}
          />
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="fx-press"
            label="Elegir otro horario"
            isDisabled={isReholding}
            onClick={onPickAnotherTime}
          />
        </HStack>
      </Banner>
    </VStack>
  );
}
