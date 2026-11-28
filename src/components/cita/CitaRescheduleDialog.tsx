'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextArea } from '@astryxdesign/core/TextArea';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import { formatDateShortInTimezone } from '@/lib/format';
import { RESCHEDULE_REASON_OPTIONS } from '@/lib/notifications/cascade';

const SKELETON_DAY_KEYS = [0, 1, 2, 3] as const;
const SKELETON_SLOT_KEYS = [0, 1, 2, 3] as const;

interface CitaRescheduleDialogProps {
  timezone: string;
  minRescheduleHours: number;
  rescheduleWindowAllowed: boolean;
  policyHelpWhatsappUrl: string;
  busy: boolean;
  submittingSlotStartAt: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  conflictSlots: AvailableSlot[];
  isOpen: boolean;
  reasonChoice: string | null;
  reason: string;
  days: DayAvailabilitySummary[];
  loadingSlots: boolean;
  slotsError?: string | null;
  onOpenChange: (open: boolean) => void;
  onSelectChip: (option: string) => void;
  onChangeReason: (value: string) => void;
  onConfirmReschedule: (slot: AvailableSlot) => void;
  onRetrySlots?: () => void;
}

export function CitaRescheduleDialog({
  timezone,
  minRescheduleHours,
  rescheduleWindowAllowed,
  policyHelpWhatsappUrl,
  busy,
  submittingSlotStartAt,
  errorMessage,
  errorCode,
  conflictSlots,
  isOpen,
  reasonChoice,
  reason,
  days,
  loadingSlots,
  slotsError = null,
  onOpenChange,
  onSelectChip,
  onChangeReason,
  onConfirmReschedule,
  onRetrySlots,
}: CitaRescheduleDialogProps) {
  const isPolicyError = errorCode === 'POLICY_WINDOW';
  const handleGuardOpenChange = (open: boolean) => {
    if (busy && !open) return;
    onOpenChange(open);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={handleGuardOpenChange}
      purpose="form"
      width="min(35rem, 94vw)"
      maxHeight="85dvh"
      padding={5}
    >
      <VStack className="lk-portal fx-sheet-in">
        <DialogHeader
          title="Reagendar tu cita"
          subtitle={
            rescheduleWindowAllowed
              ? 'Elige un nuevo horario libre; tu servicio y extras se mantienen.'
              : `Política: mínimo ${minRescheduleHours} h antes de tu horario.`
          }
          onOpenChange={handleGuardOpenChange}
        />
        <VStack gap={3} paddingBlockStart={4}>
          {!rescheduleWindowAllowed ? (
            <VStack gap={3} className="fx-fade-up">
              <Banner
                status="warning"
                title={`Faltan menos de ${minRescheduleHours} h; escríbenos por WhatsApp para ayudarte`}
                description={`El límite para reagendar en línea es de ${minRescheduleHours} horas antes. Escríbenos directo y revisamos contigo el mejor horario disponible.`}
              />
              <HStack justify="end" gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="Cerrar"
                  variant="secondary"
                  className="fx-press"
                  onClick={() => onOpenChange(false)}
                />
                <Button
                  label="Escribir por WhatsApp"
                  variant="primary"
                  className="fx-press"
                  icon={<BrandIcon name="whatsapp" size={1.125} />}
                  href={policyHelpWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </VStack>
          ) : (
            <>
              {conflictSlots.length > 0 ? (
                <VStack gap={2} className="fx-fade-up">
                  <Banner
                    status="warning"
                    role="alert"
                    title="Ese horario acaba de ser ocupado"
                    description={
                      errorMessage ||
                      'Elige una de estas opciones cercanas disponibles con un toque:'
                    }
                  />
                  <HStack gap={2} wrap="wrap">
                    {conflictSlots.map((slot) => (
                      <Button
                        key={`conflict-${slot.staffId}-${slot.startAt}`}
                        type="button"
                        label={`${formatDateShortInTimezone(slot.startAt, timezone)} · ${slot.localTime12}`}
                        variant="primary"
                        size="md"
                        className="fx-press fx-tabular"
                        isLoading={busy && submittingSlotStartAt === slot.startAt}
                        isDisabled={busy}
                        onClick={() => onConfirmReschedule(slot)}
                      />
                    ))}
                  </HStack>
                </VStack>
              ) : errorMessage ? (
                <VStack gap={2} className="fx-fade-up">
                  <Banner
                    status={isPolicyError ? 'warning' : 'error'}
                    role="alert"
                    title={
                      isPolicyError
                        ? `Faltan menos de ${minRescheduleHours} h; escríbenos por WhatsApp para ayudarte`
                        : 'No se pudo reagendar'
                    }
                    description={errorMessage}
                  />
                  {isPolicyError ? (
                    <HStack>
                      <Button
                        label="Escribir por WhatsApp"
                        variant="primary"
                        size="md"
                        className="fx-press"
                        icon={<BrandIcon name="whatsapp" size={1.125} />}
                        href={policyHelpWhatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </HStack>
                  ) : null}
                </VStack>
              ) : null}

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
                      size="md"
                      className="fx-press"
                      isDisabled={busy}
                      aria-pressed={reasonChoice === option}
                      variant={reasonChoice === option ? 'primary' : 'secondary'}
                      onClick={() => onSelectChip(option)}
                    />
                  ))}
                </HStack>
                <TextArea
                  label="Detalles adicionales"
                  placeholder="Opcional: agrega cualquier nota sobre tu cambio de horario"
                  value={reason}
                  onChange={onChangeReason}
                  isDisabled={busy}
                  isOptional
                  rows={2}
                />
              </VStack>

              {busy ? (
                <HStack className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                  <Text type="supporting" color="inherit" weight="semibold">
                    Actualizando tu cita y tu calendario...
                  </Text>
                </HStack>
              ) : null}

              {loadingSlots ? (
                <VStack gap={2} aria-busy="true">
                  <Text type="supporting" color="secondary" role="status" aria-live="polite">
                    Buscando horarios disponibles...
                  </Text>
                  <Grid columns={{ minWidth: 190, max: 2 }} gap={3} aria-hidden="true">
                    {SKELETON_DAY_KEYS.map((dayIdx) => (
                      <Card key={dayIdx} variant="muted" padding={3}>
                        <VStack gap={2}>
                          <VStack className="sk-bar" data-size="sm" data-w="60" />
                          <Grid columns={{ minWidth: 72, max: 2 }} gap={1.5}>
                            {SKELETON_SLOT_KEYS.map((slotIdx) => (
                              <VStack key={slotIdx} className="sk-bar" data-size="tab" data-w="100" />
                            ))}
                          </Grid>
                        </VStack>
                      </Card>
                    ))}
                  </Grid>
                </VStack>
              ) : slotsError ? (
                <Banner
                  collapsible={false}
                  status="error"
                  role="alert"
                  title="No pudimos cargar los horarios disponibles"
                  description={slotsError}
                >
                  <HStack gap={2} wrap="wrap" paddingBlockStart={2}>
                    {onRetrySlots ? (
                      <Button
                        type="button"
                        label="Reintentar"
                        variant="primary"
                        size="md"
                        className="fx-press"
                        onClick={onRetrySlots}
                      />
                    ) : null}
                    <Button
                      label="Escribir por WhatsApp"
                      variant="secondary"
                      size="md"
                      className="fx-press"
                      icon={<BrandIcon name="whatsapp" size={1.125} />}
                      href={policyHelpWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  </HStack>
                </Banner>
              ) : days.length === 0 ? (
                <EmptyStateCard
                  title="Sin horarios cercanos libres"
                  description="No hay horarios próximos libres en los siguientes 14 días con la misma profesional. Escríbenos por WhatsApp para ayudarte a encontrar lugar."
                  isCompact
                  actions={
                    <Button
                      label="Escribir por WhatsApp"
                      variant="secondary"
                      size="md"
                      className="fx-press"
                      icon={<BrandIcon name="whatsapp" size={1.125} />}
                      href={policyHelpWhatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                />
              ) : (
                <VStack className="fx-busy" data-busy={busy ? 'true' : 'false'} aria-busy={busy}>
                  <Grid columns={{ minWidth: 190, max: 2 }} gap={3} className="fx-stagger">
                    {days.map((day) => (
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
                                size="md"
                                className="fx-press fx-tabular"
                                isLoading={busy && submittingSlotStartAt === slot.startAt}
                                isDisabled={busy}
                                onClick={() => onConfirmReschedule(slot)}
                              />
                            ))}
                          </HStack>
                        </VStack>
                      </Card>
                    ))}
                  </Grid>
                </VStack>
              )}
            </>
          )}
        </VStack>
      </VStack>
    </Dialog>
  );
}
