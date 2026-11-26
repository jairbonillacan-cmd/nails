'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Ban, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { BookingWithRelations, RecurringBlock, StaffMember } from '@/lib/types';
import { shiftDateKey } from './scheduleGridGeometry';

interface ScheduleDayHeaderProps {
  dateKey: string;
  formattedDate: string;
  showQuietHours: boolean;
  dayBookings: BookingWithRelations[];
  activeStaff: StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  fixedTimesByStaff: ReadonlyMap<string, string[]>;
  activeBlocksByStaff: ReadonlyMap<string, RecurringBlock[]>;
  onChangeDate: (nextDateKey: string) => void;
  onToggleQuietHours: () => void;
  onOpenNewForStaff: (staffId: string, preferredDateKey?: string) => void;
}

export function ScheduleDayHeader({
  dateKey,
  formattedDate,
  showQuietHours,
  dayBookings,
  activeStaff,
  allStaffColorIndex,
  fixedTimesByStaff,
  activeBlocksByStaff,
  onChangeDate,
  onToggleQuietHours,
  onOpenNewForStaff,
}: ScheduleDayHeaderProps) {
  return (
    <VStack gap={4}>
      <SurfaceCard padded>
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <HStack gap={2} align="center" wrap="wrap">
            <Button
              label="Día anterior"
              isIconOnly
              size="sm"
              variant="secondary"
              icon={<ChevronLeft size={15} aria-hidden="true" />}
              onClick={() => onChangeDate(shiftDateKey(dateKey, -1))}
            />
            <Heading level={2} className="lk-serif ad-h2">
              {formattedDate}
            </Heading>
            <Button
              label="Día siguiente"
              isIconOnly
              size="sm"
              variant="secondary"
              icon={<ChevronRight size={15} aria-hidden="true" />}
              onClick={() => onChangeDate(shiftDateKey(dateKey, 1))}
            />
          </HStack>

          <HStack gap={2} align="center" wrap="wrap">
            <Button
              type="button"
              size="sm"
              variant={showQuietHours ? 'primary' : 'secondary'}
              label={showQuietHours ? 'Ocultar horas vacías' : 'Ver todas las horas'}
              onClick={onToggleQuietHours}
            />
            <StatusTag
              label={`${dayBookings.length} ${dayBookings.length === 1 ? 'cita' : 'citas'}`}
              tone={dayBookings.length > 0 ? 'accent' : 'neutral'}
              hasTabularNumbers
            />
          </HStack>
        </HStack>
      </SurfaceCard>

      <Grid
        className="fx-stagger"
        columns={{ minWidth: 210, max: Math.max(1, activeStaff.length) }}
        gap={3}
      >
        {activeStaff.map((st) => {
          const staffDayCount = dayBookings.filter((b) => b.staffId === st.id).length;
          const fixedTimes = fixedTimesByStaff.get(st.id) ?? [];
          const staffDayBlocks = activeBlocksByStaff.get(st.id) ?? [];
          const colorIdx = allStaffColorIndex.get(st.id) ?? 0;

          return (
            <SurfaceCard key={st.id} tone="subtle" padded>
              <VStack gap={1.5}>
                <HStack justify="between" align="center" gap={2}>
                  <VStack gap={0.5} className="rb-grow">
                    <HStack gap={1.5} align="center">
                      <Text className="ad-dot" data-idx={String(colorIdx)} aria-hidden="true">
                        {'\u200B'}
                      </Text>
                      <Heading level={3} className="lk-serif ad-h3">
                        {st.name}
                      </Heading>
                      <StatusTag label={String(staffDayCount)} tone="neutral" hasTabularNumbers />
                    </HStack>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {fixedTimes.length > 0 ? `Turnos: ${fixedTimes.join(' · ')}` : st.roleTitle}
                    </Text>
                  </VStack>
                  <Button
                    label={`Agendar con ${st.name}`}
                    isIconOnly
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={14} aria-hidden="true" />}
                    onClick={() => onOpenNewForStaff(st.id, dateKey)}
                  />
                </HStack>
                {staffDayBlocks.length > 0 ? (
                  <HStack gap={1} wrap="wrap">
                    {staffDayBlocks.map((blk) => (
                      <Token
                        key={blk.id}
                        size="sm"
                        color="orange"
                        icon={<Ban size={11} aria-hidden="true" />}
                        label={`${blk.startTime}–${blk.endTime} ${blk.reason}`}
                      />
                    ))}
                  </HStack>
                ) : null}
              </VStack>
            </SurfaceCard>
          );
        })}
      </Grid>
    </VStack>
  );
}
