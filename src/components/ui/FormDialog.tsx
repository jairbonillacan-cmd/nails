'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { createSubmitGate, type FormSubmitResult } from '@/lib/forms/form-submit';

export interface FormDialogControls {
  readonly isSubmitting: boolean;
  readonly submit: (task: () => Promise<FormSubmitResult>) => void;
  readonly close: () => void;
}

interface FormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  width?: string;
  children: (controls: FormDialogControls) => ReactNode;
}

export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  width = 'min(32rem, 96vw)',
  children,
}: FormDialogProps) {
  const [gate] = useState(createSubmitGate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastIsOpen, setLastIsOpen] = useState(isOpen);

  if (lastIsOpen !== isOpen) {
    setLastIsOpen(isOpen);
    setError(null);
  }

  const requestOpenChange = (next: boolean) => {
    if (!next && gate.isLocked()) return;
    onOpenChange(next);
  };

  const submit = (task: () => Promise<FormSubmitResult>) => {
    if (gate.isLocked()) return;
    setIsSubmitting(true);
    setError(null);
    void gate.run(task).then((result) => {
      if (result === null) return;
      setIsSubmitting(false);
      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.error);
      }
    });
  };

  const controls: FormDialogControls = {
    isSubmitting,
    submit,
    close: () => requestOpenChange(false),
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={requestOpenChange}
      purpose="form"
      width={width}
      maxHeight="92dvh"
      padding={5}
    >
      <VStack gap={4} className="fx-sheet-in">
        <DialogHeader title={title} subtitle={subtitle} onOpenChange={requestOpenChange} />
        {error ? (
          <Banner
            status="error"
            role="alert"
            title={error}
            isDismissable
            onDismiss={() => setError(null)}
          />
        ) : null}
        {isOpen ? (
          <VStack
            gap={0}
            className={isSubmitting ? 'fx-busy' : undefined}
            aria-busy={isSubmitting || undefined}
          >
            {children(controls)}
          </VStack>
        ) : null}
      </VStack>
    </Dialog>
  );
}
