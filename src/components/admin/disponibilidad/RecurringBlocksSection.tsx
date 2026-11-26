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
import { Coffee, Pause, Play, Plus, Trash2 } from 'lucide-react';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import type { RecurringBlock } from '@/lib/types';
import { DAYS, FIXED_TIME_OPTIONS, formatRecurringSummary } from './scheduleConstants';

interface RecurringBlocksSectionProps {
  staffId: string;
  staffName: string;
  recurringBlocks: RecurringBlock[];
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  onMessage: (msg: { status: 'success' | 'error'; text: string } | null) => void;
}

export function RecurringBlocksSection({
  staffId,
  staffName,
  recurringBlocks,
  onRefresh,
  onSavedNotice,
  onMessage,
}: RecurringBlocksSectionProps) {
  const [recFrequency, setRecFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [recWeekdays, setRecWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recDayOfMonth, setRecDayOfMonth] = useState<number>(15);
  const [recStartTime, setRecStartTime] = useState('12:30');
  const [recEndTime, setRecEndTime] = useState('13:15');
  const [recReason, setRecReason] = useState('');
  const [recUntilDate, setRecUntilDate] = useState('');
  const [savingRecurring, setSavingRecurring] = useState(false);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecurringBlock | null>(null);

  const toggleRecWeekday = (dow: number, checked: boolean) => {
    setRecWeekdays((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, dow]))
        : prev.filter((d) => d !== dow);
      return next.toSorted((a, b) => a - b);
    });
  };

  const createRecurringBreak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId || savingRecurring) return;
    if (recFrequency === 'weekly' && recWeekdays.length === 0) {
      onMessage({
        status: 'error',
        text: 'Elige al menos un día de la semana para este descanso.',
      });
      return;
    }
    if (recStartTime >= recEndTime) {
      onMessage({
        status: 'error',
        text: 'La hora de inicio debe ser antes que la hora de fin.',
      });
      return;
    }
    setSavingRecurring(true);
    onMessage(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'recurring_block',
          staffId,
          reason: recReason.trim() || 'Descanso fijo',
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
      if (res.ok) {
        await onRefresh();
        setRecReason('');
        setRecUntilDate('');
        onSavedNotice('Descanso fijo guardado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({
          status: 'error',
          text: errJson?.error || 'No se pudo guardar el descanso fijo.',
        });
      }
    } catch {
      onMessage({ status: 'error', text: 'Error de conexión al guardar el descanso.' });
    } finally {
      setSavingRecurring(false);
    }
  };

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
    <VStack className="ad-split" gap={5}>
      <SurfaceCard
        id="recurring-breaks-heading"
        icon={<Coffee size={16} aria-hidden="true" />}
        title="Descansos fijos"
        subtitle={`Horarios que se repiten cada semana o cada mes para ${staffName}.`}
        count={recurringBlocks.length}
      >
        {recurringBlocks.length === 0 ? (
          <EmptyStateCard
            framed={false}
            isCompact
            icon={<Coffee size={22} aria-hidden="true" />}
            title="Sin descansos fijos"
            description="Agrega aquí tu hora de comida, esterilización o clases para que nadie reserve encima."
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

      <SurfaceCard
        id="create-recurring-break-heading"
        title="Agregar descanso fijo"
        subtitle="Ideal para tu hora de comida o limpieza semanal sin bloquear día por día."
      >
        <form onSubmit={createRecurringBreak}>
          <VStack
            gap={3}
            padding={5}
            className={savingRecurring ? 'fx-busy' : undefined}
            aria-busy={savingRecurring || undefined}
          >
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
              <VStack gap={1.5}>
                <Text type="label" weight="semibold">
                  Días de la semana
                </Text>
                <Grid columns={{ minWidth: 80, max: 4 }} gap={1.5}>
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
                label="Día del mes (1 al 31)"
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
              label="Nombre del descanso"
              placeholder="Ej. Comida y limpieza de herramienta"
              value={recReason}
              onChange={setRecReason}
              isRequired
            />

            <TextInput
              label="Termina el (opcional, AAAA-MM-DD)"
              placeholder="Déjalo vacío para que siempre se repita"
              value={recUntilDate}
              autoCapitalize="none"
              hasAutoCorrect={false}
              hasSpellCheck={false}
              onChange={setRecUntilDate}
            />

            <Button
              type="submit"
              label={savingRecurring ? 'Guardando...' : 'Agregar descanso fijo'}
              variant="primary"
              width="100%"
              icon={<Plus size={14} aria-hidden="true" />}
              isLoading={savingRecurring}
              isDisabled={savingRecurring}
            />
          </VStack>
        </form>
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
