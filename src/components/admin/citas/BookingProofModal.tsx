'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Check, ExternalLink, XCircle } from 'lucide-react';
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
  isRejecting?: boolean;
  isBusy: boolean;
  onConfirm: () => void;
  onReject?: () => void;
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
  isRejecting = false,
  isBusy,
  onConfirm,
  onReject,
}: BookingProofModalProps) {
  const handleOpenChange = (open: boolean) => {
    if (!open && !isBusy && !isRejecting) {
      onOpenChange(false);
    } else if (open) {
      onOpenChange(true);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      purpose="info"
      width={560}
      maxHeight="min(90dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      <Layout
        header={
          <DialogHeader
            title={`Comprobante · ${clientName}`}
            subtitle={`${bookingCode} · Anticipo ${formatCurrency(depositAmountCents, currency)}`}
            hasDivider
            onOpenChange={handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack
              gap={3}
              align="center"
              className={isBusy || isRejecting ? 'fx-busy' : undefined}
              aria-busy={isBusy || isRejecting || undefined}
            >
              <img
                src={paymentProofUrl}
                alt={`Comprobante ampliado de ${clientName}`}
                className="ad-proof-img"
                style={{ maxHeight: '58dvh', objectFit: 'contain' }}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
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
              <HStack gap={2} align="center" wrap="wrap">
                {canConfirm && onReject ? (
                  <Button
                    type="button"
                    label={isRejecting ? 'Rechazando…' : 'Rechazar'}
                    variant="secondary"
                    size="sm"
                    icon={<XCircle size={14} aria-hidden="true" />}
                    isLoading={isRejecting}
                    isDisabled={isBusy || isRejecting}
                    onClick={onReject}
                  />
                ) : null}
                {canConfirm ? (
                  <Button
                    type="button"
                    label={isConfirming ? 'Confirmando…' : 'Confirmar cita'}
                    variant="primary"
                    size="sm"
                    icon={<Check size={14} aria-hidden="true" />}
                    isLoading={isConfirming}
                    isDisabled={isBusy || isRejecting}
                    onClick={onConfirm}
                  />
                ) : null}
              </HStack>
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
