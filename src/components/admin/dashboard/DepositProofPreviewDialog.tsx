'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { ExternalLink } from 'lucide-react';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import { StatusTag } from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import { isDisplayableProofUrl } from './dashboardMetrics';

export type PendingDepositItem = AdminOverviewPayload['pendingDeposits'][number];

interface DepositProofPreviewDialogProps {
  deposit: PendingDepositItem | null;
  currency: 'MXN' | 'USD';
  timezone: string;
  depositFallbackCents: number;
  confirmingBookingId: string | null;
  onClose: () => void;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<boolean>;
}

export function DepositProofPreviewDialog({
  deposit,
  currency,
  timezone,
  depositFallbackCents,
  confirmingBookingId,
  onClose,
  onConfirmDeposit,
}: DepositProofPreviewDialogProps) {
  const isConfirming = Boolean(deposit && confirmingBookingId === deposit.bookingId);

  return (
    <Dialog
      isOpen={Boolean(deposit)}
      onOpenChange={(open) => {
        if (!open && !confirmingBookingId) onClose();
      }}
      width={520}
      padding={5}
    >
      {deposit ? (
        <VStack
          gap={4}
          className={isConfirming ? 'fx-busy' : undefined}
          aria-busy={isConfirming || undefined}
        >
          <DialogHeader
            title="Comprobante de anticipo"
            subtitle={`${deposit.clientName} · ${deposit.bookingCode}`}
            onOpenChange={(open) => {
              if (!open && !confirmingBookingId) onClose();
            }}
          />

          <VStack gap={2} className="ad-proof-meta">
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text type="supporting" color="secondary">
                Servicio y manicurista
              </Text>
              <Text weight="semibold" size="sm">
                {deposit.serviceName} · {deposit.staffName}
              </Text>
            </HStack>
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text type="supporting" color="secondary">
                Fecha de cita
              </Text>
              <Text weight="semibold" size="sm" hasTabularNumbers>
                {formatDateShortInTimezone(deposit.startAt, timezone)} ·{' '}
                {formatTimeInTimezone(deposit.startAt, timezone, true)}
              </Text>
            </HStack>
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text type="supporting" color="secondary">
                Anticipo esperado
              </Text>
              <StatusTag
                tone="info"
                hasTabularNumbers
                label={formatCurrency(deposit.depositAmountCents || depositFallbackCents, currency)}
              />
            </HStack>
          </VStack>

          {isDisplayableProofUrl(deposit.paymentProofUrl) ? (
            <VStack gap={2}>
              <AspectRatio ratio={4 / 3} fit="contain">
                <img
                  src={deposit.paymentProofUrl}
                  alt={`Comprobante de anticipo de ${deposit.clientName}`}
                  className="ad-proof-img"
                />
              </AspectRatio>
              <Button
                label="Abrir imagen completa"
                variant="ghost"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={deposit.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
            </VStack>
          ) : (
            <VStack gap={1.5} className="ad-proof-note">
              <Text weight="semibold" size="sm">
                {deposit.proofDeliveryMethod === 'instagram_dm'
                  ? 'Enviado por Instagram DM'
                  : 'Referencia de comprobante registrada'}
              </Text>
              <Text type="supporting" color="secondary">
                {deposit.proofDeliveryMethod === 'instagram_dm'
                  ? `Revisa el mensaje de ${deposit.clientInstagram ?? deposit.clientName} en Instagram para validar la transferencia.`
                  : `Referencia: ${deposit.paymentProofUrl ?? 'Comprobante adjunto'}`}
              </Text>
            </VStack>
          )}

          <HStack justify="end" gap={2} wrap="wrap">
            <Button
              label="Ir a Anticipos en Caja"
              variant="secondary"
              size="sm"
              isDisabled={isConfirming}
              href="/admin/caja?tab=anticipos"
            />
            <Button
              type="button"
              label={isConfirming ? 'Confirmando...' : 'Confirmar cita'}
              variant="primary"
              size="sm"
              isLoading={isConfirming}
              isDisabled={isConfirming}
              onClick={async () => {
                const ok = await onConfirmDeposit(deposit.bookingId, deposit.clientName);
                if (ok) {
                  onClose();
                }
              }}
            />
          </HStack>
        </VStack>
      ) : null}
    </Dialog>
  );
}
