'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { formatHoldClock } from './BookingChrome';

export { HOLD_EXTEND_PROMPT_SEC, shouldPromptHoldExtension } from './bookingHelpers';

interface HoldExtendDialogProps {
  isOpen: boolean;
  holdRemainingSec: number;
  extraMinutes: number;
  isExtending: boolean;
  onExtend: () => void;
  onDecline: () => void;
}

export function HoldExtendDialog({
  isOpen,
  holdRemainingSec,
  extraMinutes,
  isExtending,
  onExtend,
  onDecline,
}: HoldExtendDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(next) => {
        if (!next) onDecline();
      }}
      purpose="info"
      width="min(26rem, 94vw)"
      padding={5}
    >
      <VStack gap={4} className="lk-portal fx-sheet-in">
        <DialogHeader
          title="¿Necesitas más tiempo?"
          subtitle={`Tu horario se libera en ${formatHoldClock(holdRemainingSec)}. Te lo guardamos ${extraMinutes} minutos más, sin problema.`}
          onOpenChange={(next) => {
            if (!next) onDecline();
          }}
        />
        <HStack gap={2} wrap="wrap" justify="end">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            label="Ya casi termino"
            isDisabled={isExtending}
            onClick={onDecline}
          />
          <Button
            type="button"
            variant="primary"
            size="lg"
            className="fx-press"
            label={isExtending ? 'Guardando…' : `Sí, ${extraMinutes} min más`}
            isLoading={isExtending}
            isDisabled={isExtending}
            onClick={onExtend}
          />
        </HStack>
        <Text type="supporting" color="secondary">
          Puedes pedir más tiempo las veces que lo necesites.
        </Text>
      </VStack>
    </Dialog>
  );
}
