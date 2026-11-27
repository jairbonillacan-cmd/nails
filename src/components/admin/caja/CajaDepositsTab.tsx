'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Token } from '@astryxdesign/core/Token';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Check, ExternalLink, ImageIcon, Wallet } from 'lucide-react';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { ActionRow, EmptyStateCard, StatusTag, SurfaceCard } from '@/components/ui';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  isImageProofHref,
  isSafeProofHref,
  proofMethodMeta,
  type PendingDepositRow,
} from './cajaTypes';

interface CajaDepositsTabProps {
  pendingDeposits: readonly PendingDepositRow[];
  defaultDepositLabel: string;
  tz: string;
  currency: 'MXN' | 'USD';
  approvingId: string | null;
  rejectingId?: string | null;
  onApproveDeposit: (bookingId: string, bookingCode: string) => Promise<boolean>;
  onRejectDeposit?: (bookingId: string, bookingCode: string) => Promise<boolean>;
}

export function CajaDepositsTab({
  pendingDeposits,
  defaultDepositLabel,
  tz,
  currency,
  approvingId,
  rejectingId = null,
  onApproveDeposit,
  onRejectDeposit,
}: CajaDepositsTabProps) {
  const [previewDeposit, setPreviewDeposit] = useState<PendingDepositRow | null>(null);

  return (
    <VStack gap={4} className="fx-step-in">
      <SurfaceCard
        title={`Anticipos por validar (${defaultDepositLabel})`}
        subtitle="Comprobantes de transferencia que llegaron por tu página o por Instagram."
        count={pendingDeposits.length > 0 ? pendingDeposits.length : undefined}
        actions={
          <Button
            label="Ver agenda"
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href="/admin/citas"
          />
        }
      >
        {pendingDeposits.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              title="Todo al día con los anticipos"
              description="No hay transferencias pendientes por revisar. Todas las citas activas ya están confirmadas."
              actions={
                <Button label="Ir a agenda" variant="secondary" size="sm" href="/admin/citas" />
              }
            />
          </VStack>
        ) : (
          <VStack className="ad-row-list" gap={0}>
            {pendingDeposits.map((dep) => {
              const meta = proofMethodMeta(dep.proofDeliveryMethod);
              const proofUrl = isSafeProofHref(dep.paymentProofUrl)
                ? dep.paymentProofUrl
                : null;
              const hasImageProof = isImageProofHref(
                dep.paymentProofUrl,
                dep.proofDeliveryMethod,
              );
              const isUploaded =
                dep.proofDeliveryMethod !== 'none' || Boolean(dep.paymentProofUrl);
              const isApproving = approvingId === dep.bookingId;
              const isRejecting = rejectingId === dep.bookingId;
              const isRowBusy = isApproving || isRejecting;

              return (
                <ActionRow
                  key={dep.bookingId}
                  leading={
                    hasImageProof && proofUrl ? (
                      <button
                        type="button"
                        className="ad-proof-thumb"
                        aria-label={`Ver foto del comprobante de ${dep.clientName}`}
                        onClick={() => setPreviewDeposit(dep)}
                      >
                        <img
                          src={proofUrl}
                          alt={`Comprobante de anticipo de ${dep.clientName}`}
                        />
                      </button>
                    ) : (
                      <VStack
                        className="ad-task-icon"
                        data-tone="warning"
                        align="center"
                        justify="center"
                        aria-hidden="true"
                      >
                        <Wallet size={17} />
                      </VStack>
                    )
                  }
                  title={
                    <HStack gap={2} align="center" wrap="wrap">
                      <Text weight="semibold">{dep.clientName}</Text>
                      <Token size="sm" color={meta.color} label={meta.label} />
                    </HStack>
                  }
                  subtitle={`${dep.serviceName} (${dep.bookingCode}) · ${formatDateShortInTimezone(dep.startAt, tz)} ${formatTimeInTimezone(dep.startAt, tz, true)} con ${dep.staffName}`}
                  meta={
                    <HStack gap={2} wrap="wrap" align="center">
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatPhoneDisplay(dep.clientPhone)}
                      </Text>
                      {dep.clientInstagram ? (
                        <Link
                          href={formatInstagramUrl(dep.clientInstagram)}
                          isExternalLink
                          type="supporting"
                        >
                          {formatInstagramDisplay(dep.clientInstagram)}
                        </Link>
                      ) : null}
                    </HStack>
                  }
                  actions={
                    <HStack gap={2} align="center" wrap="wrap">
                      <VStack gap={0} align="end">
                        <Text weight="bold" hasTabularNumbers>
                          {formatCurrency(dep.depositAmountCents, currency)}
                        </Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          Total {formatCurrency(dep.totalPriceCents, currency)}
                        </Text>
                      </VStack>
                      {proofUrl ? (
                        <Button
                          type="button"
                          label={hasImageProof ? 'Ver foto' : 'Ver enlace'}
                          variant="secondary"
                          size="sm"
                          icon={
                            hasImageProof ? (
                              <ImageIcon size={14} aria-hidden="true" />
                            ) : (
                              <ExternalLink size={14} aria-hidden="true" />
                            )
                          }
                          onClick={() => setPreviewDeposit(dep)}
                        />
                      ) : null}
                      {isUploaded && onRejectDeposit ? (
                        <Button
                          type="button"
                          label={isRejecting ? 'Rechazando…' : 'Rechazar'}
                          variant="ghost"
                          size="sm"
                          isLoading={isRejecting}
                          isDisabled={isRowBusy}
                          onClick={() => void onRejectDeposit(dep.bookingId, dep.bookingCode)}
                        />
                      ) : null}
                      <Button
                        type="button"
                        label="Confirmar anticipo"
                        variant="primary"
                        size="sm"
                        icon={<Check size={14} aria-hidden="true" />}
                        isLoading={isApproving}
                        isDisabled={isRowBusy}
                        onClick={() => void onApproveDeposit(dep.bookingId, dep.bookingCode)}
                      />
                      <Button
                        label="Ver cita"
                        variant="ghost"
                        size="sm"
                        href={`/admin/citas?q=${encodeURIComponent(dep.bookingCode)}`}
                      />
                    </HStack>
                  }
                />
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      <Dialog
        isOpen={Boolean(previewDeposit)}
        onOpenChange={(open) => {
          if (!open && !approvingId && !rejectingId) setPreviewDeposit(null);
        }}
        width={520}
        padding={5}
      >
        {previewDeposit ? (
          <VStack gap={4}>
            <DialogHeader
              title="Comprobante de anticipo"
              subtitle={`${previewDeposit.clientName} · ${previewDeposit.bookingCode}`}
              onOpenChange={(open) => {
                if (!open && !approvingId && !rejectingId) setPreviewDeposit(null);
              }}
            />

            <VStack gap={2} className="ad-proof-meta">
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary">
                  Servicio y profesional
                </Text>
                <Text weight="semibold" size="sm">
                  {previewDeposit.serviceName} · {previewDeposit.staffName}
                </Text>
              </HStack>
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary">
                  Fecha y hora
                </Text>
                <Text weight="semibold" size="sm" hasTabularNumbers>
                  {formatDateShortInTimezone(previewDeposit.startAt, tz)} ·{' '}
                  {formatTimeInTimezone(previewDeposit.startAt, tz, true)}
                </Text>
              </HStack>
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary">
                  Anticipo esperado
                </Text>
                <StatusTag
                  tone="info"
                  hasTabularNumbers
                  label={formatCurrency(previewDeposit.depositAmountCents, currency)}
                />
              </HStack>
            </VStack>

            {isImageProofHref(
              previewDeposit.paymentProofUrl,
              previewDeposit.proofDeliveryMethod,
            ) && previewDeposit.paymentProofUrl ? (
              <VStack gap={2}>
                <AspectRatio ratio={4 / 3} fit="contain">
                  <img
                    src={previewDeposit.paymentProofUrl}
                    alt={`Comprobante de anticipo de ${previewDeposit.clientName}`}
                    className="ad-proof-img"
                  />
                </AspectRatio>
                <Button
                  label="Abrir imagen completa"
                  variant="ghost"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href={previewDeposit.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </VStack>
            ) : isSafeProofHref(previewDeposit.paymentProofUrl) ? (
              <VStack gap={2} className="ad-proof-note">
                <Text weight="semibold" size="sm">
                  Enlace de comprobante externo
                </Text>
                <Text type="supporting" color="secondary">
                  Abre el recibo para verificar el depósito antes de confirmar.
                </Text>
                <Button
                  label="Abrir enlace del recibo"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href={previewDeposit.paymentProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </VStack>
            ) : (
              <VStack gap={1.5} className="ad-proof-note">
                <Text weight="semibold" size="sm">
                  {previewDeposit.proofDeliveryMethod === 'instagram_dm'
                    ? 'Enviado por mensaje de Instagram'
                    : 'Comprobante aún pendiente'}
                </Text>
                <Text type="supporting" color="secondary">
                  Revisa los mensajes de {previewDeposit.clientInstagram || previewDeposit.clientName}{' '}
                  para confirmar la transferencia.
                </Text>
              </VStack>
            )}

            <HStack justify="end" gap={2} wrap="wrap">
              {onRejectDeposit &&
              (previewDeposit.proofDeliveryMethod !== 'none' ||
                Boolean(previewDeposit.paymentProofUrl)) ? (
                <Button
                  type="button"
                  label={
                    rejectingId === previewDeposit.bookingId
                      ? 'Rechazando…'
                      : 'Rechazar comprobante'
                  }
                  variant="ghost"
                  size="sm"
                  isLoading={rejectingId === previewDeposit.bookingId}
                  isDisabled={
                    approvingId === previewDeposit.bookingId ||
                    rejectingId === previewDeposit.bookingId
                  }
                  onClick={async () => {
                    const ok = await onRejectDeposit(
                      previewDeposit.bookingId,
                      previewDeposit.bookingCode,
                    );
                    if (ok) {
                      setPreviewDeposit(null);
                    }
                  }}
                />
              ) : null}
              <Button
                type="button"
                label="Cerrar"
                variant="secondary"
                size="sm"
                isDisabled={
                  approvingId === previewDeposit.bookingId ||
                  rejectingId === previewDeposit.bookingId
                }
                onClick={() => setPreviewDeposit(null)}
              />
              <Button
                type="button"
                label="Confirmar anticipo"
                variant="primary"
                size="sm"
                icon={<Check size={14} aria-hidden="true" />}
                isLoading={approvingId === previewDeposit.bookingId}
                isDisabled={
                  approvingId === previewDeposit.bookingId ||
                  rejectingId === previewDeposit.bookingId
                }
                onClick={async () => {
                  const ok = await onApproveDeposit(
                    previewDeposit.bookingId,
                    previewDeposit.bookingCode,
                  );
                  if (ok) {
                    setPreviewDeposit(null);
                  }
                }}
              />
            </HStack>
          </VStack>
        ) : null}
      </Dialog>
    </VStack>
  );
}
