'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Selector } from '@astryxdesign/core/Selector';
import type { FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialog } from '@/components/ui/FormDialog';
import {
  FORM_SUBMIT_OK,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { StaffMember } from '@/lib/types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

interface BlockDayDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  visibleStaff: StaffMember[];
  lockedStaffId: string | null;
  initialStaffId: string;
  initialDate: string;
  onBlocked: (dateKey: string) => Promise<void>;
}

export function BlockDayDialog({ isOpen, onOpenChange, ...bodyProps }: BlockDayDialogProps) {
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Bloquear día"
      subtitle="Cierra un día completo para una profesional."
      width="min(28rem, 96vw)"
    >
      {(controls) => <BlockDayFormBody {...bodyProps} controls={controls} />}
    </FormDialog>
  );
}

function BlockDayFormBody({
  visibleStaff,
  lockedStaffId,
  initialStaffId,
  initialDate,
  onBlocked,
  controls,
}: Omit<BlockDayDialogProps, 'isOpen' | 'onOpenChange'> & { controls: FormDialogControls }) {
  const [blockStaffId, setBlockStaffId] = useState(initialStaffId);
  const [blockDate, setBlockDate] = useState(initialDate);
  const [blockReason, setBlockReason] = useState('Día libre');
  const { isSubmitting } = controls;

  const blockDay = async (): Promise<FormSubmitResult> => {
    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId: blockStaffId,
        overrideDate: blockDate,
        isUnavailable: true,
        startTime: null,
        endTime: null,
        reason: blockReason.trim() || 'Día libre',
      }),
    });
    if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo bloquear esa fecha.');
    await onBlocked(blockDate);
    return FORM_SUBMIT_OK;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStaffId || !blockDate) return;
    controls.submit(blockDay);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={3}>
        <Selector
          label="Profesional"
          value={blockStaffId}
          isDisabled={Boolean(lockedStaffId)}
          onChange={(v) => v && setBlockStaffId(v)}
          options={visibleStaff.map((s) => ({ value: s.id, label: s.name }))}
        />
        <DateInput
          label="Fecha"
          value={toIsoDateString(blockDate)}
          format="date_weekday"
          onChange={(val) => {
            if (val) setBlockDate(val);
          }}
          isRequired
        />
        <TextInput label="Motivo" value={blockReason} onChange={setBlockReason} />
        <Button
          type="submit"
          label="Bloquear día"
          variant="primary"
          width="100%"
          isLoading={isSubmitting}
          isDisabled={isSubmitting || !blockStaffId || !blockDate}
        />
      </VStack>
    </form>
  );
}
