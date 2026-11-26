'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Link } from '@astryxdesign/core/Link';
import { Token } from '@astryxdesign/core/Token';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Check, ExternalLink, ImageIcon, Wallet } from 'lucide-react';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  isSafeProofHref,
  proofMethodMeta,
  type PendingDepositRow,
} from './cajaTypes';

interface CajaDepositsTabProps {
  pendingDeposits: readonly PendingDepositRow[];
  defaultDepositLabel: string;
  depositBankName: string;
  depositClabe: string;
  instagramHandle: string;
  tz: string;
  currency: 'MXN' | 'USD';
  approvingId: string | null;
  onApproveDeposit: (bookingId: string, bookingCode: string) => Promise<boolean>;
}

export function CajaDepositsTab({
  pendingDeposits,
  defaultDepositLabel,
  depositBankName,
  depositClabe,
  instagramHandle,
  tz,
  currency,
  approvingId,
  onApproveDeposit,
}: CajaDepositsTabProps) {
  const [previewDeposit, setPreviewDeposit] = useState<PendingDepositRow | null>(null);

  return (
    <VStack gap={4} className="fx-step-in">
      <VStack className="ad-surface" gap={0}>
        <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
          <VStack gap={0.5} className="rb-grow">
            <Heading level={2} className="lk-serif ad-h2">
              Anticipos por validar ({defaultDepositLabel})
            </Heading>
            <Text type="supporting" color="secondary">
              Revisa los comprobantes SPEI a {depositBankName} ({depositClabe}) recibidos en la
              página o por Instagram ({instagramHandle}).
            </Text>
          </VStack>
          <Button
            label="Ver agenda"
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href="/admin/citas"
          />
        </HStack>

        {pendingDeposits.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyState
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
              const isApproving = approvingId === dep.bookingId;

              return (
                <HStack
                  key={dep.bookingId}
                  className="ad-row-item"
                  justify="between"
                  align="center"
                  wrap="wrap"
                  gap={3}
                >
                  <HStack gap={3} align="center" className="rb-grow">
                    {proofUrl ? (
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
                    )}

                    <VStack gap={0.5} className="rb-grow">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{dep.clientName}</Text>
                        <Token size="sm" color={meta.color} label={meta.label} />
                      </HStack>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {dep.serviceName} ({dep.bookingCode}) ·{' '}
                        {formatDateShortInTimezone(dep.startAt, tz)}{' '}
                        {formatTimeInTimezone(dep.startAt, tz, true)} con {dep.staffName}
                      </Text>
                      <HStack gap={2} wrap="wrap" align="center">
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {dep.clientPhone}
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
                    </VStack>
                  </HStack>

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
                        label="Ver foto"
                        variant="secondary"
                        size="sm"
                        icon={<ImageIcon size={14} aria-hidden="true" />}
                        onClick={() => setPreviewDeposit(dep)}
                      />
                    ) : null}
                    <Button
                      type="button"
                      label="Confirmar anticipo"
                      variant="primary"
                      size="sm"
                      icon={<Check size={14} aria-hidden="true" />}
                      isLoading={isApproving}
                      isDisabled={isApproving}
                      onClick={() => void onApproveDeposit(dep.bookingId, dep.bookingCode)}
                    />
                    <Button
                      label="Ver cita"
                      variant="ghost"
                      size="sm"
                      href={`/admin/citas?q=${encodeURIComponent(dep.bookingCode)}`}
                    />
                  </HStack>
                </HStack>
              );
            })}
          </VStack>
        )}
      </VStack>

      <Dialog
        isOpen={Boolean(previewDeposit)}
        onOpenChange={(open) => {
          if (!open && !approvingId) setPreviewDeposit(null);
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
                if (!open && !approvingId) setPreviewDeposit(null);
              }}
            />

            <VStack gap={2} className="ad-proof-meta">
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary">
                  Servicio y manicurista
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
                <Badge
                  variant="info"
                  label={formatCurrency(previewDeposit.depositAmountCents, currency)}
                />
              </HStack>
            </VStack>

            {isSafeProofHref(previewDeposit.paymentProofUrl) ? (
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
            ) : (
              <VStack gap={1.5} className="ad-proof-note">
                <Text weight="semibold" size="sm">
                  {previewDeposit.proofDeliveryMethod === 'instagram_dm'
                    ? 'Enviado por Instagram DM'
                    : 'Comprobante aún pendiente'}
                </Text>
                <Text type="supporting" color="secondary">
                  Revisa los mensajes de {previewDeposit.clientInstagram || previewDeposit.clientName}{' '}
                  para confirmar la transferencia.
                </Text>
              </VStack>
            )}

            <HStack justify="end" gap={2} wrap="wrap">
              <Button
                type="button"
                label="Cerrar"
                variant="secondary"
                size="sm"
                isDisabled={approvingId === previewDeposit.bookingId}
                onClick={() => setPreviewDeposit(null)}
              />
              <Button
                type="button"
                label="Confirmar anticipo"
                variant="primary"
                size="sm"
                icon={<Check size={14} aria-hidden="true" />}
                isLoading={approvingId === previewDeposit.bookingId}
                isDisabled={approvingId === previewDeposit.bookingId}
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
