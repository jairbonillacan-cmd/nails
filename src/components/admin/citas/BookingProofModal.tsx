'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Check, ExternalLink } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface BookingProofModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  bookingCode: string;
  depositAmountCents: number;
  currency: 'MXN' | 'USD';
  paymentProofUrl: string;
  canConfirm: boolean;
  isConfirming: boolean;
  isBusy: boolean;
  onConfirm: () => void;
}

export function BookingProofModal({
  isOpen,
  onOpenChange,
  clientName,
  bookingCode,
  depositAmountCents,
  currency,
  paymentProofUrl,
  canConfirm,
  isConfirming,
  isBusy,
  onConfirm,
}: BookingProofModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="info"
      width={560}
      padding={5}
    >
      <DialogHeader
        title={`Comprobante · ${clientName}`}
        subtitle={`${bookingCode} · Anticipo ${formatCurrency(depositAmountCents, currency)}`}
        onOpenChange={onOpenChange}
      />
      <VStack gap={3} paddingBlockStart={4}>
        <img
          src={paymentProofUrl}
          alt={`Comprobante ampliado de ${clientName}`}
          className="ad-proof-img"
        />
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <Button
            label="Abrir imagen completa"
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href={paymentProofUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
          {canConfirm ? (
            <Button
              type="button"
              label={isConfirming ? 'Confirmando...' : 'Confirmar cita'}
              variant="primary"
              size="sm"
              icon={<Check size={14} aria-hidden="true" />}
              isLoading={isConfirming}
              isDisabled={isBusy}
              onClick={onConfirm}
            />
          ) : null}
        </HStack>
      </VStack>
    </Dialog>
  );
}
