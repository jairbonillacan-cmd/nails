'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextArea } from '@astryxdesign/core/TextArea';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  CANCELLATION_REASON_OPTIONS,
  RESCHEDULE_REASON_OPTIONS,
} from '@/lib/notifications/cascade';
import { formatDateShortInTimezone } from '@/lib/format';

interface CitaDialogsProps {
  timezone: string;
  minCancelHours: number;
  busy: boolean;
  rescheduleOpen: boolean;
  rescheduleReasonChoice: string | null;
  rescheduleReason: string;
  rescheduleDays: DayAvailabilitySummary[];
  loadingSlots: boolean;
  cancelOpen: boolean;
  cancelReasonChoice: string | null;
  cancelReason: string;
  onRescheduleOpenChange: (open: boolean) => void;
  onSelectRescheduleChip: (option: string) => void;
  onChangeRescheduleReason: (value: string) => void;
  onConfirmReschedule: (slot: AvailableSlot) => void;
  onCancelOpenChange: (open: boolean) => void;
  onSelectCancelChip: (option: string) => void;
  onChangeCancelReason: (value: string) => void;
  onConfirmCancel: () => void;
}

export function CitaDialogs({
  timezone,
  minCancelHours,
  busy,
  rescheduleOpen,
  rescheduleReasonChoice,
  rescheduleReason,
  rescheduleDays,
  loadingSlots,
  cancelOpen,
  cancelReasonChoice,
  cancelReason,
  onRescheduleOpenChange,
  onSelectRescheduleChip,
  onChangeRescheduleReason,
  onConfirmReschedule,
  onCancelOpenChange,
  onSelectCancelChip,
  onChangeCancelReason,
  onConfirmCancel,
}: CitaDialogsProps) {
  return (
    <>
      <Dialog
        isOpen={rescheduleOpen}
        onOpenChange={onRescheduleOpenChange}
        purpose="form"
        width={560}
        padding={5}
      >
        <VStack className="lk-portal">
          <DialogHeader
            title="Reagendar tu cita"
            subtitle="Elige un nuevo horario libre; tu servicio y extras se mantienen."
            onOpenChange={onRescheduleOpenChange}
          />
          <VStack gap={3} paddingBlockStart={4}>
            <VStack gap={1.5}>
              <Text type="label" weight="semibold">
                Motivo del cambio (opcional)
              </Text>
              <HStack gap={1.5} wrap="wrap">
                {RESCHEDULE_REASON_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    label={option}
                    size="sm"
                    variant={rescheduleReasonChoice === option ? 'primary' : 'secondary'}
                    onClick={() => onSelectRescheduleChip(option)}
                  />
                ))}
              </HStack>
              <TextArea
                label="Detalles adicionales"
                placeholder="Opcional: agrega cualquier nota sobre tu cambio de horario"
                value={rescheduleReason}
                onChange={onChangeRescheduleReason}
                isOptional
                rows={2}
              />
            </VStack>

            {loadingSlots ? (
              <Text color="secondary" role="status" aria-live="polite">
                Cargando horarios disponibles...
              </Text>
            ) : rescheduleDays.length === 0 ? (
              <Text color="secondary">
                No hay horarios próximos libres en los siguientes 14 días.
              </Text>
            ) : (
              <Grid columns={{ minWidth: 210, max: 2 }} gap={3}>
                {rescheduleDays.map((day) => (
                  <Card key={day.date} variant="muted" padding={3}>
                    <VStack gap={2}>
                      <Text weight="semibold" className="rb-first-upper">
                        {formatDateShortInTimezone(`${day.date}T18:00:00Z`, timezone)}
                      </Text>
                      <HStack gap={1.5} wrap="wrap">
                        {day.slots.slice(0, 6).map((slot) => (
                          <Button
                            key={slot.startAt}
                            type="button"
                            label={slot.localTime12}
                            variant="secondary"
                            size="sm"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                            isDisabled={busy}
                            onClick={() => onConfirmReschedule(slot)}
                          />
                        ))}
                      </HStack>
                    </VStack>
                  </Card>
                ))}
              </Grid>
            )}
          </VStack>
        </VStack>
      </Dialog>

      <Dialog
        isOpen={cancelOpen}
        onOpenChange={onCancelOpenChange}
        purpose="form"
        width={480}
        padding={5}
      >
        <VStack className="lk-portal">
          <DialogHeader
            title="¿Cancelar esta cita?"
            subtitle={`Política: mínimo ${minCancelHours} h antes de tu horario.`}
            onOpenChange={onCancelOpenChange}
          />
          <VStack gap={3} paddingBlockStart={4}>
            <VStack gap={1.5}>
              <Text type="label" weight="semibold">
                ¿Cuál es el motivo?
              </Text>
              <HStack gap={1.5} wrap="wrap">
                {CANCELLATION_REASON_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    label={option}
                    size="sm"
                    variant={cancelReasonChoice === option ? 'primary' : 'secondary'}
                    onClick={() => onSelectCancelChip(option)}
                  />
                ))}
              </HStack>
            </VStack>
            <TextArea
              label="Motivo de cancelación"
              placeholder="Opcional: agrega detalles adicionales"
              value={cancelReason}
              onChange={onChangeCancelReason}
              isOptional
            />
            <HStack justify="end" gap={2} wrap="wrap">
              <Button
                type="button"
                label="Conservar cita"
                variant="secondary"
                onClick={() => onCancelOpenChange(false)}
              />
              <Button
                type="button"
                label="Sí, cancelar cita"
                variant="destructive"
                isLoading={busy}
                onClick={onConfirmCancel}
              />
            </HStack>
          </VStack>
        </VStack>
      </Dialog>
    </>
  );
}
