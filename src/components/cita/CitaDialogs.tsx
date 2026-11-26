'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextArea } from '@astryxdesign/core/TextArea';
import { MessageCircle } from 'lucide-react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  CANCELLATION_REASON_OPTIONS,
  RESCHEDULE_REASON_OPTIONS,
} from '@/lib/notifications/cascade';
import { formatDateShortInTimezone } from '@/lib/format';

const SKELETON_DAY_KEYS = [0, 1, 2, 3] as const;
const SKELETON_SLOT_KEYS = [0, 1, 2, 3] as const;

interface CitaDialogsProps {
  timezone: string;
  minCancelHours: number;
  minRescheduleHours: number;
  rescheduleWindowAllowed: boolean;
  cancelWindowAllowed: boolean;
  policyHelpWhatsappUrl: string;
  couponCode: string | null;
  busy: boolean;
  submittingSlotStartAt: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  conflictSlots?: AvailableSlot[];
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
  minRescheduleHours,
  rescheduleWindowAllowed,
  cancelWindowAllowed,
  policyHelpWhatsappUrl,
  couponCode,
  busy,
  submittingSlotStartAt,
  errorMessage = null,
  errorCode = null,
  conflictSlots = [],
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
  const isPolicyError = errorCode === 'POLICY_WINDOW';

  return (
    <>
      <Dialog
        isOpen={rescheduleOpen}
        onOpenChange={(open) => {
          if (busy && !open) return;
          onRescheduleOpenChange(open);
        }}
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
            onOpenChange={(open) => {
              if (busy && !open) return;
              onRescheduleOpenChange(open);
            }}
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
                    onClick={() => onRescheduleOpenChange(false)}
                  />
                  <Button
                    label="Escribir por WhatsApp"
                    variant="primary"
                    className="fx-press"
                    icon={<MessageCircle size={15} aria-hidden="true" />}
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
                          icon={<MessageCircle size={15} aria-hidden="true" />}
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
                        aria-pressed={rescheduleReasonChoice === option}
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
                    isDisabled={busy}
                    isOptional
                    rows={2}
                  />
                </VStack>

                {busy ? (
                  <HStack
                    className="fx-save-pill"
                    data-state="saving"
                    role="status"
                    aria-live="polite"
                  >
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
                                <VStack
                                  key={slotIdx}
                                  className="sk-bar"
                                  data-size="tab"
                                  data-w="100"
                                />
                              ))}
                            </Grid>
                          </VStack>
                        </Card>
                      ))}
                    </Grid>
                  </VStack>
                ) : rescheduleDays.length === 0 ? (
                  <VStack gap={3} padding={3} className="rb-card">
                    <Text color="secondary" textWrap="pretty">
                      No hay horarios próximos libres en los siguientes 14 días con la misma artista. Escríbenos por WhatsApp para ayudarte a encontrar lugar.
                    </Text>
                    <HStack>
                      <Button
                        label="Escribir por WhatsApp"
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        icon={<MessageCircle size={15} aria-hidden="true" />}
                        href={policyHelpWhatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </HStack>
                  </VStack>
                ) : (
                  <VStack
                    className="fx-busy"
                    data-busy={busy ? 'true' : 'false'}
                    aria-busy={busy}
                  >
                    <Grid columns={{ minWidth: 190, max: 2 }} gap={3} className="fx-stagger">
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

      <Dialog
        isOpen={cancelOpen}
        onOpenChange={(open) => {
          if (busy && !open) return;
          onCancelOpenChange(open);
        }}
        purpose="form"
        width="min(30rem, 94vw)"
        maxHeight="85dvh"
        padding={5}
      >
        <VStack className="lk-portal fx-sheet-in">
          <DialogHeader
            title="¿Cancelar esta cita?"
            subtitle={`Política: mínimo ${minCancelHours} h antes de tu horario.`}
            onOpenChange={(open) => {
              if (busy && !open) return;
              onCancelOpenChange(open);
            }}
          />
          <VStack gap={3} paddingBlockStart={4}>
            {!cancelWindowAllowed ? (
              <VStack gap={3} className="fx-fade-up">
                <Banner
                  status="warning"
                  title={`Faltan menos de ${minCancelHours} h; escríbenos por WhatsApp para ayudarte`}
                  description={`El límite para cancelar en línea es de ${minCancelHours} horas antes. Escríbenos directo y con gusto te atendemos.`}
                />
                <HStack justify="end" gap={2} wrap="wrap">
                  <Button
                    type="button"
                    label="Cerrar"
                    variant="secondary"
                    className="fx-press"
                    onClick={() => onCancelOpenChange(false)}
                  />
                  <Button
                    label="Escribir por WhatsApp"
                    variant="primary"
                    className="fx-press"
                    icon={<MessageCircle size={15} aria-hidden="true" />}
                    href={policyHelpWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                </HStack>
              </VStack>
            ) : (
              <>
                {errorMessage ? (
                  <VStack gap={2} className="fx-fade-up">
                    <Banner
                      status={isPolicyError ? 'warning' : 'error'}
                      title={
                        isPolicyError
                          ? `Faltan menos de ${minCancelHours} h; escríbenos por WhatsApp para ayudarte`
                          : 'No se pudo cancelar'
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
                          icon={<MessageCircle size={15} aria-hidden="true" />}
                          href={policyHelpWhatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      </HStack>
                    ) : null}
                  </VStack>
                ) : null}

                {couponCode ? (
                  <Banner
                    status="info"
                    title={`Tu código ${couponCode} se liberará automáticamente`}
                    description="Al cancelar, el uso o saldo de tu cupón o Gift Card vuelve a estar disponible para tu próxima reserva."
                  />
                ) : null}

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
                        size="md"
                        className="fx-press"
                        isDisabled={busy}
                        aria-pressed={cancelReasonChoice === option}
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
                  isDisabled={busy}
                  isOptional
                />
                <HStack justify="end" gap={2} wrap="wrap">
                  <Button
                    type="button"
                    label="Conservar cita"
                    variant="secondary"
                    className="fx-press"
                    isDisabled={busy}
                    onClick={() => onCancelOpenChange(false)}
                  />
                  <Button
                    type="button"
                    label={busy ? 'Cancelando...' : 'Sí, cancelar cita'}
                    variant="destructive"
                    className="fx-press"
                    isLoading={busy}
                    isDisabled={busy}
                    onClick={onConfirmCancel}
                  />
                </HStack>
              </>
            )}
          </VStack>
        </VStack>
      </Dialog>
    </>
  );
}
