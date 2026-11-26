'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { TextArea } from '@astryxdesign/core/TextArea';
import { MessageCircle } from 'lucide-react';
import { ConfirmActionDialog } from '@/components/ui/ConfirmActionDialog';
import { CANCELLATION_REASON_OPTIONS } from '@/lib/notifications/cascade';

interface CitaCancelDialogProps {
  minCancelHours: number;
  cancelWindowAllowed: boolean;
  policyHelpWhatsappUrl: string;
  couponCode: string | null;
  busy: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  isOpen: boolean;
  reasonChoice: string | null;
  reason: string;
  onOpenChange: (open: boolean) => void;
  onSelectChip: (option: string) => void;
  onChangeReason: (value: string) => void;
  onConfirmCancel: () => Promise<void> | void;
}

export function CitaCancelDialog({
  minCancelHours,
  cancelWindowAllowed,
  policyHelpWhatsappUrl,
  couponCode,
  busy,
  errorMessage,
  errorCode,
  isOpen,
  reasonChoice,
  reason,
  onOpenChange,
  onSelectChip,
  onChangeReason,
  onConfirmCancel,
}: CitaCancelDialogProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isPolicyError = errorCode === 'POLICY_WINDOW';

  const handleGuardOpenChange = (open: boolean) => {
    if (busy && !open) return;
    if (!open) setConfirmOpen(false);
    onOpenChange(open);
  };

  const handleExecuteCancel = async () => {
    await onConfirmCancel();
    setConfirmOpen(false);
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={handleGuardOpenChange}
        purpose="form"
        width="min(30rem, 94vw)"
        maxHeight="85dvh"
        padding={5}
      >
        <VStack className="lk-portal fx-sheet-in">
          <DialogHeader
            title="¿Cancelar esta cita?"
            subtitle={`Política: mínimo ${minCancelHours} h antes de tu horario.`}
            onOpenChange={handleGuardOpenChange}
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
                    onClick={() => onOpenChange(false)}
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
                      role="alert"
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
                        aria-pressed={reasonChoice === option}
                        variant={reasonChoice === option ? 'primary' : 'secondary'}
                        onClick={() => onSelectChip(option)}
                      />
                    ))}
                  </HStack>
                </VStack>
                <TextArea
                  label="Motivo de cancelación"
                  placeholder="Opcional: agrega detalles adicionales"
                  value={reason}
                  onChange={onChangeReason}
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
                    onClick={() => onOpenChange(false)}
                  />
                  <Button
                    type="button"
                    label={busy ? 'Cancelando...' : 'Sí, cancelar cita'}
                    variant="destructive"
                    className="fx-press"
                    isLoading={busy}
                    isDisabled={busy}
                    onClick={() => setConfirmOpen(true)}
                  />
                </HStack>
              </>
            )}
          </VStack>
        </VStack>
      </Dialog>

      <ConfirmActionDialog
        isOpen={confirmOpen}
        onOpenChange={(open) => {
          if (busy && !open) return;
          setConfirmOpen(open);
        }}
        title="¿Confirmas cancelar tu cita?"
        description={
          couponCode
            ? `Tu espacio se liberará al instante y tu código ${couponCode} volverá a estar disponible.`
            : 'Tu espacio se liberará al instante para otras clientas. Esta acción no se puede deshacer.'
        }
        confirmLabel={busy ? 'Cancelando...' : 'Confirmar cancelación'}
        cancelLabel="Conservar cita"
        variant="destructive"
        isLoading={busy}
        onConfirm={handleExecuteCancel}
      />
    </>
  );
}
