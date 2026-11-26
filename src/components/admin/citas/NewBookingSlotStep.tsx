'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { SkeletonBlock, SurfaceCard } from '@/components/ui';
import type { AvailableSlot } from '@/lib/availability/engine';
import type { StaffMember } from '@/lib/types';
import { formatDateShortInTimezone } from '@/lib/format';
import { shiftDateKey } from './scheduleGridGeometry';

export interface QuickSlotOption extends AvailableSlot {
  date: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

interface NewBookingSlotStepProps {
  activeStaff: StaffMember[];
  effectiveStaffId: string;
  lockedStaffId: string | null;
  startDate: string;
  todayKey: string;
  timezone: string;
  loadingSlots: boolean;
  slots: QuickSlotOption[];
  selectedSlot: QuickSlotOption | null;
  onChangeStaff: (staffId: string) => void;
  onChangeDate: (dateKey: string) => void;
  onSelectSlot: (slot: QuickSlotOption) => void;
}

export function NewBookingSlotStep({
  activeStaff,
  effectiveStaffId,
  lockedStaffId,
  startDate,
  todayKey,
  timezone,
  loadingSlots,
  slots,
  selectedSlot,
  onChangeStaff,
  onChangeDate,
  onSelectSlot,
}: NewBookingSlotStepProps) {
  const tomorrowKey = shiftDateKey(todayKey, 1);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, QuickSlotOption[]>();
    for (const slot of slots) {
      const list = map.get(slot.date) ?? [];
      list.push(slot);
      map.set(slot.date, list);
    }
    return Array.from(map.entries());
  }, [slots]);

  return (
    <SurfaceCard tone="subtle" padded>
      <VStack gap={3}>
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <Text weight="semibold" size="base">
            3. Día y hora
          </Text>
          <HStack gap={1.5} align="center">
            <StatusDot
              variant={selectedSlot ? 'success' : 'warning'}
              label={selectedSlot ? 'Horario elegido' : 'Sin horarios cercanos'}
            />
            <Text weight="semibold" size="sm" hasTabularNumbers>
              {loadingSlots
                ? 'Buscando turnos...'
                : selectedSlot
                  ? `${formatDateShortInTimezone(
                      selectedSlot.startAt,
                      timezone,
                    )} · ${selectedSlot.localTime12} (${selectedSlot.staffName})`
                  : 'Sin espacios en los próximos 14 días'}
            </Text>
          </HStack>
        </HStack>

        <Grid columns={{ minWidth: 200, max: 2 }} gap={3}>
          <Selector
            label="Profesional"
            value={effectiveStaffId}
            isDisabled={Boolean(lockedStaffId)}
            onChange={(val) => {
              if (!lockedStaffId) {
                onChangeStaff(val || 'any');
              }
            }}
            options={[
              { value: 'any', label: 'Cualquier profesional disponible' },
              ...activeStaff.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <DateInput
            label="Desde la fecha"
            value={toIsoDateString(startDate)}
            min={toIsoDateString(todayKey)}
            format="date_weekday"
            onChange={(val) => {
              if (val) onChangeDate(val);
            }}
          />
        </Grid>

        <HStack gap={1.5} wrap="wrap">
          <Button
            type="button"
            size="sm"
            variant={startDate === todayKey ? 'primary' : 'secondary'}
            label="Hoy"
            onClick={() => onChangeDate(todayKey)}
          />
          <Button
            type="button"
            size="sm"
            variant={startDate === tomorrowKey ? 'primary' : 'secondary'}
            label="Mañana"
            onClick={() => onChangeDate(tomorrowKey)}
          />
        </HStack>

        {loadingSlots ? (
          <HStack gap={1.5} wrap="wrap" aria-hidden="true">
            <SkeletonBlock width="7rem" height="2rem" radius={2} index={0} />
            <SkeletonBlock width="7rem" height="2rem" radius={2} index={1} />
            <SkeletonBlock width="7rem" height="2rem" radius={2} index={2} />
            <SkeletonBlock width="7rem" height="2rem" radius={2} index={3} />
          </HStack>
        ) : slotsByDate.length === 0 ? (
          <Text type="supporting" color="secondary">
            No hay turnos libres desde esta fecha. Prueba eligiendo otra fecha o cualquier
            profesional.
          </Text>
        ) : (
          <VStack gap={3}>
            {slotsByDate.map(([dateKey, daySlots]) => (
              <VStack key={dateKey} gap={1.5}>
                <Text type="supporting" weight="semibold" color="secondary">
                  {dateKey === todayKey
                    ? `Hoy · ${formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}`
                    : dateKey === tomorrowKey
                      ? `Mañana · ${formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}`
                      : formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}
                </Text>
                <HStack gap={1.5} wrap="wrap">
                  {daySlots.map((slot) => {
                    const isChosen =
                      selectedSlot?.startAt === slot.startAt &&
                      selectedSlot?.staffId === slot.staffId;
                    return (
                      <Button
                        key={`${slot.staffId}-${slot.startAt}`}
                        type="button"
                        size="sm"
                        variant={isChosen ? 'primary' : 'secondary'}
                        label={`${slot.localTime12} · ${slot.staffName}`}
                        onClick={() => onSelectSlot(slot)}
                      />
                    );
                  })}
                </HStack>
              </VStack>
            ))}
          </VStack>
        )}
      </VStack>
    </SurfaceCard>
  );
}
