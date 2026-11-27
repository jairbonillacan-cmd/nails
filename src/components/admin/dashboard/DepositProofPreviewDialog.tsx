'use client';

import { useState } from 'react';
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
import { ConfirmActionDialog, StatusTag } from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import { isDisplayableProofUrl } from './dashboardMetrics';

export type PendingDepositItem = AdminOverviewPayload['pendingDeposits'][number];

interface DepositProofPreviewDialogProps {
  deposit: PendingDepositItem | null;
  currency: 'MXN' | 'USD';
  timezone: string;
  depositFallbackCents: number;
  confirmingBookingId: string | null;
  rejectingBookingId?: string | null;
  onClose: () => void;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<boolean>;
  onRejectDeposit?: (bookingId: string, clientName: string) => Promise<boolean>;
}

export function DepositProofPreviewDialog({
  deposit,
  currency,
  timezone,
  depositFallbackCents,
  confirmingBookingId,
  rejectingBookingId = null,
  onClose,
  onConfirmDeposit,
  onRejectDeposit,
}: DepositProofPreviewDialogProps) {
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const isConfirming = Boolean(deposit && confirmingBookingId === deposit.bookingId);
  const isRejecting = Boolean(deposit && rejectingBookingId === deposit.bookingId);
  const isBusy = isConfirming || isRejecting;
  const isExternalLink = Boolean(
    deposit &&
      (deposit.proofDeliveryMethod === 'web_link' ||
        deposit.paymentProofUrl?.startsWith('https://')),
  );
  const hasImageProof = Boolean(
    deposit && !isExternalLink && isDisplayableProofUrl(deposit.paymentProofUrl),
  );
  const safeExternalUrl =
    deposit && isExternalLink && isDisplayableProofUrl(deposit.paymentProofUrl)
      ? deposit.paymentProofUrl
      : null;

  const handleClosePreview = () => {
    if (!confirmingBookingId && !rejectingBookingId && !confirmRejectOpen) {
      onClose();
    }
  };

  return (
    <>
      <Dialog
        isOpen={Boolean(deposit)}
        onOpenChange={(open) => {
          if (!open) handleClosePreview();
        }}
        width={520}
        padding={5}
      >
        {deposit ? (
          <VStack
            gap={4}
            className={isBusy ? 'fx-busy' : undefined}
            aria-busy={isBusy || undefined}
          >
            <DialogHeader
              title="Comprobante de anticipo"
              subtitle={`${deposit.clientName} · ${deposit.bookingCode}`}
              onOpenChange={(open) => {
                if (!open) handleClosePreview();
              }}
            />

          <VStack gap={2} className="ad-proof-meta">
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <Text type="supporting" color="secondary">
                Servicio y profesional
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
                {formatTimeInTimezone(deposit.startAt, timezone)}
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

          {hasImageProof && deposit.paymentProofUrl ? (
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
          ) : safeExternalUrl ? (
            <VStack gap={2} className="ad-proof-note">
              <Text weight="semibold" size="sm">
                Enlace de comprobante externo
              </Text>
              <Text type="supporting" color="secondary">
                Abre el enlace en una pestaña nueva para validar el pago antes de confirmar.
              </Text>
              <Button
                label="Abrir enlace del recibo"
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={safeExternalUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
            </VStack>
          ) : (
            <VStack gap={1.5} className="ad-proof-note">
              <Text weight="semibold" size="sm">
                {deposit.proofDeliveryMethod === 'instagram_dm'
                  ? 'Enviado por mensaje de Instagram'
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
            {onRejectDeposit &&
            (deposit.proofDeliveryMethod !== 'none' || Boolean(deposit.paymentProofUrl)) ? (
              <Button
                type="button"
                label={isRejecting ? 'Rechazando...' : 'Rechazar comprobante'}
                variant="ghost"
                size="sm"
                isLoading={isRejecting}
                isDisabled={isBusy}
                onClick={() => setConfirmRejectOpen(true)}
              />
            ) : null}
            <Button
              label="Ir a Anticipos en Caja"
              variant="secondary"
              size="sm"
              isDisabled={isBusy}
              href="/admin/caja?tab=anticipos"
            />
            <Button
              type="button"
              label={isConfirming ? 'Confirmando...' : 'Confirmar cita'}
              variant="primary"
              size="sm"
              isLoading={isConfirming}
              isDisabled={isBusy}
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

    {deposit && onRejectDeposit ? (
      <ConfirmActionDialog
        isOpen={confirmRejectOpen}
        onOpenChange={(open) => {
          if (!isRejecting) setConfirmRejectOpen(open);
        }}
        title="¿Rechazar este comprobante?"
        description={`Avisaremos a ${deposit.clientName} que el anticipo de la cita ${deposit.bookingCode} no pudo validarse para que envíe un nuevo comprobante.`}
        confirmLabel={isRejecting ? 'Rechazando...' : 'Sí, rechazar comprobante'}
        cancelLabel="Volver"
        variant="destructive"
        isLoading={isRejecting}
        onConfirm={async () => {
          const ok = await onRejectDeposit(deposit.bookingId, deposit.clientName);
          if (ok) {
            setConfirmRejectOpen(false);
            onClose();
          }
        }}
      />
    ) : null}
    </>
  );
}
