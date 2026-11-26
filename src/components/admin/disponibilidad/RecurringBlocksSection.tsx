'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Coffee, Pause, Play, Plus, Trash2 } from 'lucide-react';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import type { RecurringBlock } from '@/lib/types';
import type { FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import { DAYS, FIXED_TIME_OPTIONS, formatRecurringSummary } from './scheduleConstants';

interface RecurringBlocksSectionProps {
  staffId: string;
  staffName: string;
  recurringBlocks: RecurringBlock[];
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  onMessage: (msg: { status: 'success' | 'error'; text: string } | null) => void;
}

function RecurringBreakFormBody({
  staffId,
  onRefresh,
  onSavedNotice,
  controls,
}: {
  staffId: string;
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  controls: FormDialogControls;
}) {
  const [recFrequency, setRecFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [recWeekdays, setRecWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recDayOfMonth, setRecDayOfMonth] = useState<number>(15);
  const [recStartTime, setRecStartTime] = useState('12:30');
  const [recEndTime, setRecEndTime] = useState('13:15');
  const [recReason, setRecReason] = useState('');
  const [recUntilDate, setRecUntilDate] = useState('');
  const { isSubmitting } = controls;

  const toggleRecWeekday = (dow: number, checked: boolean) => {
    setRecWeekdays((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, dow]))
        : prev.filter((d) => d !== dow);
      return next.toSorted((a, b) => a - b);
    });
  };

  const saveBreak = async (): Promise<FormSubmitResult> => {
    if (recFrequency === 'weekly' && recWeekdays.length === 0) {
      return formSubmitError('Elige al menos un día de la semana.');
    }
    if (recStartTime >= recEndTime) {
      return formSubmitError('La hora de inicio debe ser antes que la hora de fin.');
    }
    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'recurring_block',
        staffId,
        reason: recReason.trim() || 'Descanso',
        frequency: recFrequency,
        weekdays: recFrequency === 'weekly' ? recWeekdays : [],
        dayOfMonth:
          recFrequency === 'monthly'
            ? Math.max(1, Math.min(31, Math.round(recDayOfMonth || 1)))
            : null,
        startTime: recStartTime,
        endTime: recEndTime,
        untilDate: recUntilDate.trim() || null,
        isActive: true,
      }),
    });
    if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo guardar el descanso.');
    await onRefresh();
    onSavedNotice('Descanso guardado');
    return FORM_SUBMIT_OK;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId) return;
    controls.submit(saveBreak);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={3}>
        <FilterPillBar<'weekly' | 'monthly'>
          ariaLabel="Con qué frecuencia se repite"
          mode="segmented"
          size="sm"
          layout="fill"
          value={recFrequency}
          onChange={setRecFrequency}
          options={[
            { value: 'weekly', label: 'Cada semana' },
            { value: 'monthly', label: 'Cada mes' },
          ]}
        />

        {recFrequency === 'weekly' ? (
          <VStack gap={1.5} role="group" aria-label="Qué días">
            <Text type="label" weight="semibold" aria-hidden="true">
              Qué días
            </Text>
            <Grid columns={{ minWidth: 72, max: 4 }} gap={1.5}>
              {DAYS.map(({ dow, short }) => (
                <CheckboxInput
                  key={dow}
                  size="sm"
                  label={short}
                  value={recWeekdays.includes(dow)}
                  onChange={(checked) => toggleRecWeekday(dow, checked)}
                />
              ))}
            </Grid>
          </VStack>
        ) : (
          <NumberInput
            label="Qué día del mes"
            description="Del 1 al 31."
            value={recDayOfMonth}
            min={1}
            max={31}
            isIntegerOnly
            onChange={(val) => setRecDayOfMonth(val || 1)}
          />
        )}

        <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
          <Selector
            label="Desde"
            value={recStartTime}
            onChange={(v) => v && setRecStartTime(v)}
            options={FIXED_TIME_OPTIONS}
          />
          <Selector
            label="Hasta"
            value={recEndTime}
            onChange={(v) => v && setRecEndTime(v)}
            options={FIXED_TIME_OPTIONS}
          />
        </Grid>

        <TextInput
          label="Nombre"
          placeholder="Ej. Comida"
          value={recReason}
          onChange={setRecReason}
          isOptional
        />

        <DateInput
          label="Termina el"
          description="Déjalo vacío si se repite siempre."
          value={(recUntilDate || undefined) as ISODateString | undefined}
          onChange={(v) => setRecUntilDate(v ?? '')}
          isOptional
        />

        <HStack gap={2} justify="end" wrap="wrap">
          <Button
            type="button"
            label="Cancelar"
            variant="secondary"
            isDisabled={isSubmitting}
            onClick={controls.close}
          />
          <Button
            type="submit"
            label="Guardar descanso"
            variant="primary"
            icon={<Plus size={14} aria-hidden="true" />}
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          />
        </HStack>
      </VStack>
    </form>
  );
}

export function RecurringBlocksSection({
  staffId,
  staffName,
  recurringBlocks,
  onRefresh,
  onSavedNotice,
  onMessage,
}: RecurringBlocksSectionProps) {
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecurringBlock | null>(null);

  const handleToggleRecurringBlock = async (block: RecurringBlock) => {
    if (busyBlockId) return;
    setBusyBlockId(block.id);
    onMessage(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'recurring_block_toggle',
          id: block.id,
          isActive: !block.isActive,
        }),
      });
      if (res.ok) {
        await onRefresh();
        onSavedNotice(block.isActive ? 'Descanso pausado' : 'Descanso reactivado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar este descanso.',
        });
      }
    } finally {
      setBusyBlockId(null);
    }
  };

  const handleConfirmDeleteBlock = async () => {
    if (!pendingDelete || busyBlockId) return;
    const target = pendingDelete;
    setBusyBlockId(target.id);
    onMessage(null);
    try {
      const res = await fetch(
        `/api/admin/availability?blockId=${encodeURIComponent(target.id)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        setPendingDelete(null);
        await onRefresh();
        onSavedNotice('Descanso eliminado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({
          status: 'error',
          text: errJson?.error || 'No se pudo eliminar este descanso.',
        });
      }
    } finally {
      setBusyBlockId(null);
    }
  };

  return (
    <VStack gap={5}>
      <SurfaceCard
        id="recurring-breaks-heading"
        icon={<Coffee size={16} aria-hidden="true" />}
        title="Descansos fijos"
        subtitle={`Horarios que se repiten cada semana o cada mes para ${staffName}.`}
        count={recurringBlocks.length}
        actions={
          <FormDialogLauncher
            triggerLabel="Agregar descanso"
            title="Descanso que se repite"
            subtitle="Tu hora de comida o limpieza, sin bloquear día por día."
            triggerVariant="secondary"
            triggerSize="sm"
          >
            {(controls) => (
              <RecurringBreakFormBody
                staffId={staffId}
                onRefresh={onRefresh}
                onSavedNotice={onSavedNotice}
                controls={controls}
              />
            )}
          </FormDialogLauncher>
        }
      >
        {recurringBlocks.length === 0 ? (
          <EmptyStateCard
            framed={false}
            isCompact
            icon={<Coffee size={22} aria-hidden="true" />}
            title="Sin descansos fijos"
            description="Agrega tu hora de comida o limpieza para que nadie reserve encima."
          />
        ) : (
          <VStack as="ul" className="ad-row-list" gap={0}>
            {recurringBlocks.map((block) => {
              const isBusy = busyBlockId === block.id;
              return (
                <li
                  key={block.id}
                  className={isBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
                  data-muted={!block.isActive ? 'true' : undefined}
                  aria-busy={isBusy || undefined}
                >
                  <VStack gap={1} className="rb-grow">
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text weight="semibold">{block.reason}</Text>
                      <StatusTag
                        tone={block.isActive ? 'success' : 'neutral'}
                        label={block.isActive ? 'Activo' : 'Pausado'}
                      />
                    </HStack>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatRecurringSummary(block)}
                    </Text>
                  </VStack>

                  <HStack gap={1.5} align="center">
                    <Button
                      type="button"
                      label={isBusy ? 'Guardando...' : block.isActive ? 'Pausar' : 'Activar'}
                      variant="secondary"
                      size="sm"
                      icon={
                        block.isActive ? (
                          <Pause size={13} aria-hidden="true" />
                        ) : (
                          <Play size={13} aria-hidden="true" />
                        )
                      }
                      isLoading={isBusy}
                      isDisabled={isBusy || Boolean(busyBlockId)}
                      onClick={() => void handleToggleRecurringBlock(block)}
                    />
                    <Button
                      type="button"
                      label="Quitar"
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      isDisabled={isBusy || Boolean(busyBlockId)}
                      onClick={() => setPendingDelete(block)}
                    />
                  </HStack>
                </li>
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <ConfirmActionDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !busyBlockId) setPendingDelete(null);
        }}
        title={
          pendingDelete ? `¿Eliminar el descanso "${pendingDelete.reason}"?` : '¿Eliminar descanso?'
        }
        description="Se dejará de bloquear este horario recurrente en la disponibilidad futura."
        confirmLabel="Sí, eliminar descanso"
        variant="destructive"
        isLoading={Boolean(busyBlockId)}
        onConfirm={handleConfirmDeleteBlock}
      />
    </VStack>
  );
}
