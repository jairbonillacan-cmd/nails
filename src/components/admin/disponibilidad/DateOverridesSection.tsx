'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Archive, CalendarOff, CalendarPlus, Trash2 } from 'lucide-react';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { formatTimeHHMM12h } from '@/lib/format';
import type { DateOverride, StaffMember } from '@/lib/types';
import { DateOverrideFormCard } from './DateOverrideFormCard';

const overrideDateFormatter = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const HOLIDAY_YEAR_OPTIONS = [
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
];

interface DateOverridesSectionProps {
  staffId: string;
  staffName: string;
  allStaff: StaffMember[];
  serverTodayKey: string;
  activeOverrides: DateOverride[];
  archivedOverrides: DateOverride[];
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  onMessage: (msg: { status: 'success' | 'error'; text: string } | null) => void;
}

export function DateOverridesSection({
  staffId,
  staffName,
  allStaff,
  serverTodayKey,
  activeOverrides,
  archivedOverrides,
  onRefresh,
  onSavedNotice,
  onMessage,
}: DateOverridesSectionProps) {
  const [holidayYear, setHolidayYear] = useState('2026');
  const [preloadingHolidays, setPreloadingHolidays] = useState(false);
  const [busyOverrideId, setBusyOverrideId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DateOverride | null>(null);

  const handleConfirmDeleteOverride = async () => {
    if (!pendingDelete || busyOverrideId) return;
    const target = pendingDelete;
    setBusyOverrideId(target.id);
    onMessage(null);
    try {
      const res = await fetch(`/api/admin/availability?id=${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await onRefresh();
        onSavedNotice(`Fecha ${target.overrideDate} eliminada`);
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({ status: 'error', text: errJson?.error || 'No se pudo eliminar esa fecha.' });
      }
    } catch {
      onMessage({ status: 'error', text: 'Sin conexión. No se pudo eliminar esa fecha.' });
    } finally {
      setPendingDelete(null);
      setBusyOverrideId(null);
    }
  };

  const handlePreloadMxHolidays = async () => {
    if (preloadingHolidays) return;
    setPreloadingHolidays(true);
    onMessage(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'preload_mx_holidays',
          year: Number(holidayYear) || 2026,
          staffId,
          publicNote: 'Cerrado por día festivo en México',
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          created?: DateOverride[];
          skippedDates?: string[];
          year?: number;
        };
        const createdCount = json.created?.length ?? 0;
        const skippedCount = json.skippedDates?.length ?? 0;
        await onRefresh();
        onMessage({
          status: 'success',
          text: `Festivos de México ${json.year ?? holidayYear}: ${createdCount} día(s) marcados como cerrados${skippedCount > 0 ? ` (${skippedCount} ya estaban marcados)` : ''}.`,
        });
        onSavedNotice(`Festivos ${json.year ?? holidayYear} marcados`);
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({
          status: 'error',
          text: errJson?.error || 'No se pudieron marcar los días festivos.',
        });
      }
    } catch {
      onMessage({ status: 'error', text: 'Sin conexión. No se pudieron marcar los días festivos.' });
    } finally {
      setPreloadingHolidays(false);
    }
  };

  const renderClosedDateRow = (o: DateOverride) => {
    const redirectStaff = o.redirectStaffId
      ? allStaff.find((s) => s.id === o.redirectStaffId)
      : null;
    const isBusy = busyOverrideId === o.id;

    return (
      <li
        key={o.id}
        className={isBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
        aria-busy={isBusy || undefined}
      >
        <VStack gap={1} className="rb-grow">
          <HStack gap={2} align="center" wrap="wrap">
            <Text weight="semibold" className="fx-tabular rb-first-upper" hasTabularNumbers>
              {overrideDateFormatter.format(new Date(`${o.overrideDate}T12:00:00Z`))}
            </Text>
            <StatusTag
              tone={o.isUnavailable ? 'warning' : 'accent'}
              label={
                o.isUnavailable
                  ? 'Cerrado'
                  : `${formatTimeHHMM12h(o.startTime ?? '')} – ${formatTimeHHMM12h(o.endTime ?? '')}`
              }
              hasTabularNumbers
            />
          </HStack>
          <Text type="supporting" color="secondary">
            {o.reason || (o.isUnavailable ? 'Día cerrado' : 'Horario especial')}
          </Text>
          {o.publicNote || redirectStaff ? (
            <HStack gap={1.5} wrap="wrap">
              {o.publicNote ? <StatusTag tone="neutral" label={`Aviso: ${o.publicNote}`} /> : null}
              {redirectStaff ? (
                <StatusTag tone="success" label={`Sugiere a ${redirectStaff.name}`} />
              ) : null}
            </HStack>
          ) : null}
        </VStack>
        <Button
          type="button"
          label={isBusy ? 'Quitando...' : 'Quitar'}
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} aria-hidden="true" />}
          isLoading={isBusy}
          isDisabled={isBusy || Boolean(busyOverrideId)}
          onClick={() => setPendingDelete(o)}
        />
      </li>
    );
  };

  return (
    <VStack gap={5}>
      <SurfaceCard tone="accent" padded className={preloadingHolidays ? 'fx-busy' : undefined}>
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <VStack gap={0.5} className="rb-grow">
            <HStack gap={1.5} align="center">
              <CalendarPlus size={16} aria-hidden="true" />
              <Text weight="semibold">Días festivos de México</Text>
            </HStack>
            <Text type="supporting" color="secondary">
              Marca automáticamente como cerrados Año Nuevo, 1 de Mayo, 16 de Septiembre, Navidad y
              demás festivos oficiales para {staffName}.
            </Text>
          </VStack>
          <HStack gap={2} align="center" wrap="wrap">
            <Selector
              label="Año de festivos"
              isLabelHidden
              size="sm"
              value={holidayYear}
              isDisabled={preloadingHolidays}
              onChange={(v) => v && setHolidayYear(v)}
              options={HOLIDAY_YEAR_OPTIONS}
            />
            <Button
              type="button"
              label={preloadingHolidays ? 'Marcando festivos...' : 'Marcar festivos de México'}
              variant="primary"
              size="sm"
              icon={<CalendarPlus size={14} aria-hidden="true" />}
              isLoading={preloadingHolidays}
              isDisabled={preloadingHolidays}
              onClick={() => void handlePreloadMxHolidays()}
            />
          </HStack>
        </HStack>
      </SurfaceCard>

      <VStack gap={5}>
        <VStack gap={4}>
          <SurfaceCard
            id="active-vacations-heading"
            icon={<CalendarOff size={16} aria-hidden="true" />}
            title="Vacaciones y días cerrados"
            subtitle={`Fechas especiales o vacaciones de ${staffName}.`}
            count={activeOverrides.length}
            actions={
              <DateOverrideFormCard
                staffId={staffId}
                allStaff={allStaff}
                serverTodayKey={serverTodayKey}
                onRefresh={onRefresh}
                onSavedNotice={onSavedNotice}
              />
            }
          >
            {activeOverrides.length === 0 ? (
              <EmptyStateCard
                framed={false}
                isCompact
                icon={<CalendarOff size={22} aria-hidden="true" />}
                title="Sin vacaciones ni cierres próximos"
                description="Cuando marques un día cerrado, vacaciones o festivos aparecerán aquí."
              />
            ) : (
              <VStack as="ul" className="ad-row-list" gap={0}>
                {activeOverrides.map(renderClosedDateRow)}
              </VStack>
            )}
          </SurfaceCard>

          {archivedOverrides.length > 0 ? (
            <Collapsible
              className="ad-disclosure"
              defaultIsOpen={false}
              trigger={
                <HStack gap={2} align="center">
                  <Archive size={15} aria-hidden="true" />
                  <Text weight="semibold" size="sm">
                    Fechas pasadas
                  </Text>
                  <StatusTag
                    label={String(archivedOverrides.length)}
                    tone="neutral"
                    hasTabularNumbers
                  />
                </HStack>
              }
            >
              <VStack as="ul" className="ad-row-list" gap={0} paddingBlockStart={3}>
                {archivedOverrides.map(renderClosedDateRow)}
              </VStack>
            </Collapsible>
          ) : null}
        </VStack>

      </VStack>

      <ConfirmActionDialog
        isOpen={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !busyOverrideId) setPendingDelete(null);
        }}
        title={
          pendingDelete
            ? `¿Quitar fecha especial (${pendingDelete.overrideDate})?`
            : '¿Quitar fecha especial?'
        }
        description="Ese día volverá a usar los turnos normales de la semana."
        confirmLabel="Sí, quitar fecha"
        variant="destructive"
        isLoading={Boolean(busyOverrideId)}
        onConfirm={handleConfirmDeleteOverride}
      />
    </VStack>
  );
}
