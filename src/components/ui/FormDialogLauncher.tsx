'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Plus } from 'lucide-react';

interface FormDialogLauncherProps {
  triggerLabel: string;
  title: string;
  subtitle?: string;
  triggerVariant?: 'primary' | 'secondary';
  icon?: ReactNode;
  isTriggerFullWidth?: boolean;
  isDisabled?: boolean;
  width?: string;
  children: (close: () => void) => ReactNode;
}

export function FormDialogLauncher({
  triggerLabel,
  title,
  subtitle,
  triggerVariant = 'primary',
  icon,
  isTriggerFullWidth = false,
  isDisabled = false,
  width = 'min(32rem, 96vw)',
  children,
}: FormDialogLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);

  return (
    <>
      <Button
        type="button"
        label={triggerLabel}
        variant={triggerVariant}
        size="md"
        icon={icon ?? <Plus size={16} aria-hidden="true" />}
        width={isTriggerFullWidth ? '100%' : undefined}
        isDisabled={isDisabled}
        className="fx-press"
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        purpose="form"
        width={width}
        maxHeight="92dvh"
        padding={5}
      >
        <VStack gap={4} className="fx-sheet-in">
          <DialogHeader title={title} subtitle={subtitle} onOpenChange={setIsOpen} />
          {isOpen ? children(close) : null}
        </VStack>
      </Dialog>
    </>
  );
}
