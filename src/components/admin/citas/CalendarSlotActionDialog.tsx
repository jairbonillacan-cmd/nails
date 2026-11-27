'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Ban, CalendarPlus, ChevronRight, Clock } from 'lucide-react';
import { StatusTag } from '@/components/ui/StatusTag';
import { formatDateShortInTimezone, formatTimeHHMM12h } from '@/lib/format';
import type { CalendarEmptySlotSelection } from './VisualScheduleGrid';

interface CalendarSlotActionDialogProps {
  slot: CalendarEmptySlotSelection | null;
  timezone: string;
  onClose: () => void;
  onChooseManualBooking: (slot: CalendarEmptySlotSelection) => void;
  onChooseBlockTime: (slot: CalendarEmptySlotSelection) => void;
}

export function CalendarSlotActionDialog({
  slot,
  timezone,
  onClose,
  onChooseManualBooking,
  onChooseBlockTime,
}: CalendarSlotActionDialogProps) {
  const dateLabel = slot
    ? formatDateShortInTimezone(`${slot.dateKey}T18:00:00Z`, timezone)
    : '';
  const timeLabel = slot ? formatTimeHHMM12h(slot.startTimeHHMM) : '';
  const subtitle = slot
    ? `${dateLabel} · ${timeLabel}${slot.staffName ? ` · ${slot.staffName}` : ''}`
    : undefined;

  return (
    <Dialog
      isOpen={Boolean(slot)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      purpose="info"
      width={440}
      maxHeight="min(90dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      <Layout
        header={
          <DialogHeader
            title="¿Qué quieres hacer en este horario?"
            subtitle={subtitle}
            hasDivider
            onOpenChange={(open) => {
              if (!open) onClose();
            }}
          />
        }
        content={
          <LayoutContent>
            {slot ? (
              <VStack gap={3}>
                <HStack gap={2} align="center" wrap="wrap">
                  <StatusTag
                    tone="accent"
                    icon={<Clock size={12} aria-hidden="true" />}
                    label={`${dateLabel} · ${timeLabel}`}
                    hasTabularNumbers
                  />
                  {slot.staffName ? (
                    <StatusTag tone="neutral" label={slot.staffName} />
                  ) : null}
                </HStack>

                <ClickableCard
                  label="Reserva manual — Agendar una cita en este horario"
                  padding={4}
                  onClick={() => onChooseManualBooking(slot)}
                >
                  <HStack justify="between" align="center" gap={3}>
                    <HStack gap={3} align="center" style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <VStack
                        className="ad-task-icon"
                        data-tone="accent"
                        align="center"
                        justify="center"
                        aria-hidden="true"
                      >
                        <CalendarPlus size={18} />
                      </VStack>
                      <VStack gap={0.5} style={{ minWidth: 0 }}>
                        <Text weight="semibold">Reserva manual</Text>
                        <Text type="supporting" color="secondary">
                          Agenda una cita con servicio, clienta y profesional en esta hora.
                        </Text>
                      </VStack>
                    </HStack>
                    <ChevronRight size={16} aria-hidden="true" />
                  </HStack>
                </ClickableCard>

                <ClickableCard
                  label="Bloquear horario — Cerrar horas, días o programar un bloqueo repetitivo"
                  padding={4}
                  onClick={() => onChooseBlockTime(slot)}
                >
                  <HStack justify="between" align="center" gap={3}>
                    <HStack gap={3} align="center" style={{ minWidth: 0, flex: '1 1 auto' }}>
                      <VStack
                        className="ad-task-icon"
                        data-tone="warning"
                        align="center"
                        justify="center"
                        aria-hidden="true"
                      >
                        <Ban size={18} />
                      </VStack>
                      <VStack gap={0.5} style={{ minWidth: 0 }}>
                        <Text weight="semibold">Bloquear horario</Text>
                        <Text type="supporting" color="secondary">
                          Marca comida, vacaciones, curso o un bloqueo que se repita.
                        </Text>
                      </VStack>
                    </HStack>
                    <ChevronRight size={16} aria-hidden="true" />
                  </HStack>
                </ClickableCard>
              </VStack>
            ) : null}
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack justify="end">
              <Button type="button" label="Cancelar" variant="secondary" size="sm" onClick={onClose} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
