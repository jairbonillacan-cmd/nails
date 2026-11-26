'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner } from '@astryxdesign/core/Banner';
import { KeyRound, ShieldCheck } from 'lucide-react';

interface OwnerPinDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  isSubmitting?: boolean;
  error?: string | null;
  onConfirm: (pin: string) => Promise<void> | void;
}

export function OwnerPinDialog({
  isOpen,
  onOpenChange,
  title = 'Autorización de dueña requerida',
  description = 'Esta acción requiere el PIN de dueña (4 a 6 dígitos) configurado en Mi página.',
  actionLabel = 'Autorizar y continuar',
  isSubmitting = false,
  error = null,
  onConfirm,
}: OwnerPinDialogProps) {
  const [pin, setPin] = useState('');

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setPin('');
    }
    onOpenChange(open);
  };

  const isPinReady = pin.length >= 4 && pin.length <= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPinReady || isSubmitting) return;
    await onConfirm(pin);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      purpose="form"
      width={420}
      padding={5}
    >
      <DialogHeader
        title={title}
        subtitle={description}
        onOpenChange={handleOpenChange}
      />
      <form onSubmit={(e) => void handleSubmit(e)}>
        <VStack gap={4} paddingBlockStart={4} className="fx-sheet-in">
          {error ? (
            <Banner status="error" role="alert" title={error} />
          ) : null}

          <VStack gap={2} align="center" className="ad-subpanel">
            <HStack gap={1.5} align="center">
              <ShieldCheck size={15} aria-hidden="true" />
              <Text type="supporting" weight="semibold">
                PIN de dueña (4 a 6 dígitos)
              </Text>
            </HStack>

            <TextInput
              type="password"
              label="PIN de dueña"
              isLabelHidden
              placeholder="••••"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="done"
              containerClassName="ad-pin-input"
              hasAutoFocus
              isRequired
              value={pin}
              onChange={(val) => setPin(val.replace(/\D/g, '').slice(0, 6))}
            />

            <Text type="supporting" color="secondary" hasTabularNumbers>
              {pin.length} / 6 dígitos ingresados
            </Text>
          </VStack>

          <HStack gap={2} justify="end">
            <Button
              type="button"
              label="Cancelar"
              variant="secondary"
              isDisabled={isSubmitting}
              onClick={() => handleOpenChange(false)}
            />
            <Button
              type="submit"
              label={actionLabel}
              variant="primary"
              icon={<KeyRound size={14} aria-hidden="true" />}
              isLoading={isSubmitting}
              isDisabled={!isPinReady || isSubmitting}
            />
          </HStack>
        </VStack>
      </form>
    </Dialog>
  );
}
