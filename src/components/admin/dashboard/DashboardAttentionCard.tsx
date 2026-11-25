'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import {
  Check,
  Clock,
  ExternalLink,
  MessageCircle,
  Package,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type { AdminOverviewPayload } from '../AdminProvider';
import { isDisplayableProofUrl, type DashboardMetrics } from './dashboardMetrics';

type PendingDepositItem = AdminOverviewPayload['pendingDeposits'][number];

interface DashboardAttentionCardProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
  confirmingBookingId: string | null;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<void>;
  maxVisible?: number;
}

interface AttentionTask {
  id: string;
  tone: 'warning' | 'accent' | 'info' | 'neutral';
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  secondary?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  primary: {
    label: string;
    href?: string;
    isExternal?: boolean;
    isLoading?: boolean;
    onClick?: () => void;
  };
}

const WAITLIST_WINDOW_LABELS: Record<string, string> = {
  morning: 'mañana',
  afternoon: 'tarde',
  evening: 'noche',
  any: 'cualquier horario',
};

export function DashboardAttentionCard({
  data,
  metrics,
  confirmingBookingId,
  onConfirmDeposit,
  maxVisible = 5,
}: DashboardAttentionCardProps) {
  const [previewDeposit, setPreviewDeposit] = useState<PendingDepositItem | null>(null);
  const currency = data.settings.currency;
  const tz = metrics.tz;
  const depositFallbackCents = data.settings.depositAmountCents ?? 20000;

  const allTasks: AttentionTask[] = [];

  for (const dep of data.pendingDeposits) {
    const amountCents = dep.depositAmountCents || depositFallbackCents;
    const dateLabel = formatDateShortInTimezone(dep.startAt, tz);
    const timeLabel = formatTimeInTimezone(dep.startAt, tz, true);
    const isUploaded = dep.proofDeliveryMethod !== 'none' || Boolean(dep.paymentProofUrl);
    const isLoading = confirmingBookingId === dep.bookingId;

    allTasks.push({
      id: `dep-${dep.bookingId}`,
      tone: 'warning',
      icon: <Wallet size={19} aria-hidden="true" />,
      title: isUploaded
        ? `${dep.clientName} subió su anticipo de ${formatCurrency(amountCents, currency)}`
        : `Anticipo pendiente de ${dep.clientName} · ${formatCurrency(amountCents, currency)}`,
      subtitle: `${dep.serviceName} · ${dateLabel} ${timeLabel} con ${dep.staffName} · ${dep.bookingCode}`,
      secondary: isUploaded
        ? {
            label: 'Ver comprobante',
            onClick: () => setPreviewDeposit(dep),
          }
        : {
            label: 'Ver en Caja',
            href: '/admin/caja?tab=anticipos',
          },
      primary: {
        label: isLoading ? 'Confirmando...' : 'Confirmar cita',
        isLoading,
        onClick: () => void onConfirmDeposit(dep.bookingId, dep.clientName),
      },
    });
  }

  for (const item of data.uncollectedBookings) {
    const dateLabel = formatDateShortInTimezone(item.startAt, tz);
    const endTime = formatTimeInTimezone(item.endAt, tz, true);
    allTasks.push({
      id: `pay-${item.bookingId}`,
      tone: 'accent',
      icon: <ReceiptText size={19} aria-hidden="true" />,
      title: `Cita terminada sin cobrar · ${formatCurrency(item.remainingCents, currency)}`,
      subtitle: `${item.clientName} · ${item.serviceName} con ${item.staffName} · ${dateLabel} ${endTime}`,
      secondary: {
        label: 'Ver en Caja',
        href: '/admin/caja?tab=sin-cobrar',
      },
      primary: {
        label: `Cobrar ${formatCurrency(item.remainingCents, currency)}`,
        href: `/admin/citas?collect=${item.bookingId}`,
      },
    });
  }

  for (const entry of metrics.waitingList) {
    const srv = data.services.find((service) => service.id === entry.serviceId);
    const serviceLabel = srv?.name ?? 'tu cita';
    const waLink = buildWhatsAppLink(
      entry.clientPhoneE164,
      `Hola ${entry.clientName}, se liberó un espacio en ${data.settings.name} para ${serviceLabel} el ${entry.desiredDate}. ¿Te lo apartamos?`,
    );
    const windowLabel = WAITLIST_WINDOW_LABELS[entry.preferredWindow] ?? entry.preferredWindow;
    allTasks.push({
      id: `wait-${entry.id}`,
      tone: 'info',
      icon: <Clock size={19} aria-hidden="true" />,
      title: `${entry.clientName} en lista de espera`,
      subtitle: `${serviceLabel} · ${entry.desiredDate} (${windowLabel})`,
      secondary: {
        label: 'Ver agenda',
        href: '/admin/citas',
      },
      primary: {
        label: 'Avisar',
        href: waLink,
        isExternal: true,
      },
    });
  }

  for (const item of metrics.lowStock) {
    allTasks.push({
      id: `stock-${item.id}`,
      tone: 'neutral',
      icon: <Package size={19} aria-hidden="true" />,
      title: `Quedan ${item.stockQuantity} ${item.unit} de ${item.name}`,
      subtitle: `Por debajo de tu mínimo de ${item.minStockAlert} ${item.unit} en inventario`,
      primary: {
        label: 'Ir a inventario',
        href: '/admin/inventario',
      },
    });
  }

  const visibleTasks = allTasks.slice(0, maxVisible);
  const hiddenCount = Math.max(0, allTasks.length - visibleTasks.length);

  return (
    <>
      <VStack as="section" className="ad-card ad-enter" aria-labelledby="ad-att" gap={0}>
        <HStack
          justify="between"
          align="center"
          gap={3}
          wrap="wrap"
          className="ad-card-head"
        >
          <HStack gap={2} align="center">
            <Heading level={2} id="ad-att" className="lk-serif ad-h2">
              Necesita tu atención
            </Heading>
            {allTasks.length > 0 ? (
              <Text
                color="inherit"
                weight="bold"
                className="ad-chip ad-chip-solid"
                hasTabularNumbers
              >
                {allTasks.length}
              </Text>
            ) : null}
          </HStack>
          <Text type="supporting" color="secondary" className="ad-hide-s">
            Lo resuelves aquí sin cambiar de pantalla
          </Text>
        </HStack>

        {visibleTasks.length === 0 ? (
          <HStack className="ad-task ad-enter" align="center" gap={3}>
            <VStack className="ad-done-circle" align="center" justify="center" aria-hidden="true">
              <Check size={18} />
            </VStack>
            <VStack gap={0.5} className="rb-grow">
              <Text weight="semibold">Todo al día</Text>
              <Text type="supporting" color="secondary">
                No hay anticipos, cobros ni avisos pendientes.
              </Text>
            </VStack>
          </HStack>
        ) : (
          <VStack gap={0}>
            {visibleTasks.map((task) => (
              <HStack key={task.id} className="ad-task" align="center" gap={3} wrap="wrap">
                <VStack
                  className="ad-task-icon"
                  data-tone={task.tone}
                  align="center"
                  justify="center"
                  aria-hidden="true"
                >
                  {task.icon}
                </VStack>
                <VStack gap={0.5} className="ad-task-body">
                  <Text weight="semibold" className="ad-task-title">
                    {task.title}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {task.subtitle}
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap" className="ad-task-actions">
                  {task.secondary ? (
                    <Button
                      type={task.secondary.href ? undefined : 'button'}
                      label={task.secondary.label}
                      variant="secondary"
                      size="sm"
                      href={task.secondary.href}
                      onClick={task.secondary.onClick}
                    />
                  ) : null}
                  <Button
                    type={task.primary.href ? undefined : 'button'}
                    label={task.primary.label}
                    variant="primary"
                    size="sm"
                    icon={
                      task.primary.isExternal ? (
                        <MessageCircle size={14} aria-hidden="true" />
                      ) : undefined
                    }
                    isDisabled={task.primary.isLoading}
                    href={task.primary.href}
                    target={task.primary.isExternal ? '_blank' : undefined}
                    rel={task.primary.isExternal ? 'noopener noreferrer' : undefined}
                    onClick={task.primary.onClick}
                  />
                </HStack>
              </HStack>
            ))}

            {hiddenCount > 0 ? (
              <HStack justify="between" align="center" gap={2} className="ad-card-foot">
                <Text type="supporting" color="secondary">
                  Hay {hiddenCount} pendiente{hiddenCount === 1 ? '' : 's'} más en tu panel.
                </Text>
                <Button label="Revisar en Caja" variant="ghost" size="sm" href="/admin/caja" />
              </HStack>
            ) : null}
          </VStack>
        )}
      </VStack>

      <Dialog
        isOpen={Boolean(previewDeposit)}
        onOpenChange={(open) => {
          if (!open) setPreviewDeposit(null);
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
                if (!open) setPreviewDeposit(null);
              }}
            />

            <VStack gap={2} className="ad-proof-meta">
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary">
                  Servicio y especialista
                </Text>
                <Text weight="semibold" size="sm">
                  {previewDeposit.serviceName} · {previewDeposit.staffName}
                </Text>
              </HStack>
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text type="supporting" color="secondary">
                  Fecha de cita
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
                  label={formatCurrency(
                    previewDeposit.depositAmountCents || depositFallbackCents,
                    currency,
                  )}
                />
              </HStack>
            </VStack>

            {isDisplayableProofUrl(previewDeposit.paymentProofUrl) ? (
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
                    : 'Referencia de comprobante registrada'}
                </Text>
                <Text type="supporting" color="secondary">
                  {previewDeposit.proofDeliveryMethod === 'instagram_dm'
                    ? `Revisa el mensaje de ${previewDeposit.clientInstagram ?? previewDeposit.clientName} en Instagram para validar la transferencia.`
                    : `Referencia: ${previewDeposit.paymentProofUrl ?? 'Comprobante adjunto'}`}
                </Text>
              </VStack>
            )}

            <HStack justify="end" gap={2} wrap="wrap">
              <Button
                label="Ir a Anticipos en Caja"
                variant="secondary"
                size="sm"
                href="/admin/caja?tab=anticipos"
              />
              <Button
                type="button"
                label={
                  confirmingBookingId === previewDeposit.bookingId
                    ? 'Confirmando...'
                    : 'Confirmar cita'
                }
                variant="primary"
                size="sm"
                isDisabled={confirmingBookingId === previewDeposit.bookingId}
                onClick={async () => {
                  const target = previewDeposit;
                  await onConfirmDeposit(target.bookingId, target.clientName);
                  setPreviewDeposit(null);
                }}
              />
            </HStack>
          </VStack>
        ) : null}
      </Dialog>
    </>
  );
}
