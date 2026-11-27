'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { createSubmitGate, type FormSubmitResult } from '@/lib/forms/form-submit';

export interface FormDialogControls {
  readonly isSubmitting: boolean;
  readonly submit: (task: () => Promise<FormSubmitResult>) => void;
  readonly close: () => void;
}

interface FormDialogSubmitFooter {
  readonly formId: string;
  readonly submitLabel: string;
  readonly submitIcon?: ReactNode;
  readonly isSubmitDisabled?: boolean;
  readonly cancelLabel?: string;
}

interface FormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  width?: string;
  submitFooter?: FormDialogSubmitFooter;
  children: (controls: FormDialogControls) => ReactNode;
}

export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  width = 'min(32rem, 96vw)',
  submitFooter,
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
      maxHeight="min(90dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      <Layout
        header={
          <DialogHeader
            title={title}
            subtitle={subtitle}
            hasDivider
            onOpenChange={requestOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack
              gap={4}
              className={isSubmitting ? 'fx-busy' : undefined}
              aria-busy={isSubmitting || undefined}
            >
              {error ? (
                <Banner
                  status="error"
                  role="alert"
                  title={error}
                  isDismissable
                  onDismiss={() => setError(null)}
                />
              ) : null}
              {isOpen ? children(controls) : null}
            </VStack>
          </LayoutContent>
        }
        footer={
          isOpen && submitFooter ? (
            <LayoutFooter hasDivider>
              <HStack gap={2} justify="end" wrap="wrap">
                <Button
                  type="button"
                  label={submitFooter.cancelLabel ?? 'Cancelar'}
                  variant="secondary"
                  isDisabled={isSubmitting}
                  onClick={controls.close}
                />
                <Button
                  type="submit"
                  form={submitFooter.formId}
                  label={submitFooter.submitLabel}
                  variant="primary"
                  icon={submitFooter.submitIcon}
                  isLoading={isSubmitting}
                  isDisabled={Boolean(submitFooter.isSubmitDisabled) || isSubmitting}
                />
              </HStack>
            </LayoutFooter>
          ) : undefined
        }
      />
    </Dialog>
  );
}
