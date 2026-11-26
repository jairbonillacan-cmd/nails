'use client';

import { AlertDialog } from '@astryxdesign/core/AlertDialog';

interface ConfirmActionDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'destructive' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  variant = 'destructive',
  isLoading = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      actionLabel={confirmLabel}
      cancelLabel={cancelLabel}
      actionVariant={variant}
      isActionLoading={isLoading}
      onAction={onConfirm}
    />
  );
}
