'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Coffee, Pause, Play, Plus, Trash2 } from 'lucide-react';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import type { RecurringBlock, StaffMember } from '@/lib/types';
import { BlockTimeForm } from './BlockTimeForm';
import { formatRecurringSummary } from './scheduleConstants';

interface RecurringBlocksSectionProps {
  staffId: string;
  staffName: string;
  allStaff: StaffMember[];
  serverTodayKey: string;
  recurringBlocks: RecurringBlock[];
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  onMessage: (msg: { status: 'success' | 'error'; text: string } | null) => void;
}

export function RecurringBlocksSection({
  staffId,
  staffName,
  allStaff,
  serverTodayKey,
  recurringBlocks,
  onRefresh,
  onSavedNotice,
  onMessage,
}: RecurringBlocksSectionProps) {
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [optimisticActiveById, setOptimisticActiveById] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<RecurringBlock | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogKey, setAddDialogKey] = useState(0);

  const handleToggleRecurringBlock = async (block: RecurringBlock) => {
    if (busyBlockId) return;
    const nextIsActive = !block.isActive;
    setBusyBlockId(block.id);
    setOptimisticActiveById((prev) => ({ ...prev, [block.id]: nextIsActive }));
    onMessage(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          kind: 'recurring_block_toggle',
          id: block.id,
          isActive: nextIsActive,
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
    } catch {
      onMessage({ status: 'error', text: 'Sin conexión. No se pudo actualizar este descanso.' });
    } finally {
      setBusyBlockId(null);
      setOptimisticActiveById((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([key]) => key !== block.id)),
      );
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
        {
          method: 'DELETE',
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (res.ok) {
        await onRefresh();
        onSavedNotice('Descanso eliminado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({
          status: 'error',
          text: errJson?.error || 'No se pudo eliminar este descanso.',
        });
      }
    } catch {
      onMessage({ status: 'error', text: 'Sin conexión. No se pudo eliminar este descanso.' });
    } finally {
      setPendingDelete(null);
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
          <Button
            type="button"
            label="Agregar descanso"
            variant="secondary"
            size="sm"
            icon={<Plus size={14} aria-hidden="true" />}
            onClick={() => {
              setAddDialogKey((prev) => prev + 1);
              setAddDialogOpen(true);
            }}
          />
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
              const effectiveIsActive = optimisticActiveById[block.id] ?? block.isActive;
              return (
                <li
                  key={block.id}
                  className={isBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
                  data-muted={!effectiveIsActive ? 'true' : undefined}
                  aria-busy={isBusy || undefined}
                >
                  <VStack gap={1} className="rb-grow">
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text weight="semibold">{block.reason}</Text>
                      <StatusTag
                        tone={effectiveIsActive ? 'success' : 'neutral'}
                        label={effectiveIsActive ? 'Activo' : 'Pausado'}
                      />
                    </HStack>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatRecurringSummary(block)}
                    </Text>
                  </VStack>

                  <HStack gap={1.5} align="center">
                    <Button
                      type="button"
                      label={isBusy ? 'Guardando...' : effectiveIsActive ? 'Pausar' : 'Activar'}
                      variant="secondary"
                      size="sm"
                      icon={
                        effectiveIsActive ? (
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

      <BlockTimeForm
        key={`recurring-add-${staffId}-${addDialogKey}`}
        isOpen={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        visibleStaff={allStaff}
        allStaff={allStaff}
        lockedStaffId={staffId}
        todayKey={serverTodayKey}
        allowedModes={['partial']}
        showStaffSelector={false}
        prefill={{
          mode: 'partial',
          staffId,
          dateKey: serverTodayKey,
          startTimeHHMM: '12:30',
          endTimeHHMM: '13:15',
          repeat: true,
          frequency: 'weekly',
          weekdays: [1, 2, 3, 4, 5, 6],
        }}
        onSaved={async (notice) => {
          await onRefresh();
          onSavedNotice(notice);
        }}
      />

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
