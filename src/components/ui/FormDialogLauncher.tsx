'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Plus } from 'lucide-react';
import { FormDialog, type FormDialogControls } from './FormDialog';

interface FormDialogLauncherProps {
  triggerLabel: string;
  title: string;
  subtitle?: string;
  triggerVariant?: 'primary' | 'secondary';
  triggerSize?: 'sm' | 'md';
  icon?: ReactNode;
  isTriggerFullWidth?: boolean;
  isDisabled?: boolean;
  width?: string;
  children: (controls: FormDialogControls) => ReactNode;
}

export function FormDialogLauncher({
  triggerLabel,
  title,
  subtitle,
  triggerVariant = 'primary',
  triggerSize = 'md',
  icon,
  isTriggerFullWidth = false,
  isDisabled = false,
  width,
  children,
}: FormDialogLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        label={triggerLabel}
        variant={triggerVariant}
        size={triggerSize}
        icon={icon ?? <Plus size={16} aria-hidden="true" />}
        width={isTriggerFullWidth ? '100%' : undefined}
        isDisabled={isDisabled}
        className="fx-press"
        onClick={() => setIsOpen(true)}
      />
      <FormDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={title}
        subtitle={subtitle}
        width={width}
      >
        {children}
      </FormDialog>
    </>
  );
}
