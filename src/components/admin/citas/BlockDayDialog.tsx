'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextInput } from '@astryxdesign/core/TextInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Selector } from '@astryxdesign/core/Selector';
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
  onError: (message: string) => void;
}

export function BlockDayDialog({
  isOpen,
  onOpenChange,
  visibleStaff,
  lockedStaffId,
  initialStaffId,
  initialDate,
  onBlocked,
  onError,
}: BlockDayDialogProps) {
  const [blockStaffId, setBlockStaffId] = useState(initialStaffId);
  const [blockDate, setBlockDate] = useState(initialDate);
  const [blockReason, setBlockReason] = useState('Día libre');
  const [blockingDay, setBlockingDay] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockStaffId || !blockDate || blockingDay) return;
    setBlockingDay(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: blockStaffId,
          overrideDate: blockDate,
          isUnavailable: true,
          startTime: null,
          endTime: null,
          reason: blockReason,
        }),
      });
      if (res.ok) {
        onOpenChange(false);
        await onBlocked(blockDate);
      } else {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        onError(json?.error || 'No se pudo bloquear esa fecha.');
      }
    } catch {
      onError('Error de conexión al bloquear la fecha.');
    } finally {
      setBlockingDay(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!blockingDay) onOpenChange(open);
      }}
      purpose="form"
      width={440}
      padding={5}
    >
      <DialogHeader
        title="Bloquear día"
        subtitle="Cierra un día completo para una manicurista sin salir de la Agenda."
        onOpenChange={(open) => {
          if (!blockingDay) onOpenChange(open);
        }}
      />
      <form onSubmit={handleSubmit}>
        <VStack
          gap={3}
          paddingBlockStart={4}
          className={blockingDay ? 'fx-busy' : undefined}
          aria-busy={blockingDay || undefined}
        >
          <Selector
            label="Manicurista"
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
            label={blockingDay ? 'Bloqueando...' : 'Bloquear día'}
            variant="primary"
            width="100%"
            isLoading={blockingDay}
            isDisabled={blockingDay || !blockStaffId || !blockDate}
          />
        </VStack>
      </form>
    </Dialog>
  );
}
