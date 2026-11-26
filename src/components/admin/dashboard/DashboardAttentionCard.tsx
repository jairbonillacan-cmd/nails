'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import {
  Check,
  Clock,
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
import { ActionRow, EmptyStateCard, SurfaceCard } from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import { isDisplayableProofUrl, type DashboardMetrics } from './dashboardMetrics';
import {
  DepositProofPreviewDialog,
  type PendingDepositItem,
} from './DepositProofPreviewDialog';

interface DashboardAttentionCardProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
  confirmingBookingId: string | null;
  savedMessage?: string | null;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<boolean>;
  maxVisible?: number;
}

interface AttentionTask {
  id: string;
  tone: 'warning' | 'accent' | 'info' | 'neutral';
  icon: React.ReactNode;
  thumbnail?: {
    src: string;
    alt: string;
    ariaLabel: string;
    onClick: () => void;
  };
  title: string;
  subtitle: string;
  isBusy?: boolean;
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
  savedMessage,
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
    const proofImageUrl = isDisplayableProofUrl(dep.paymentProofUrl)
      ? dep.paymentProofUrl
      : null;
    const isUploaded = dep.proofDeliveryMethod !== 'none' || Boolean(dep.paymentProofUrl);
    const isLoading = confirmingBookingId === dep.bookingId;

    allTasks.push({
      id: `dep-${dep.bookingId}`,
      tone: 'warning',
      icon: <Wallet size={19} aria-hidden="true" />,
      thumbnail: proofImageUrl
        ? {
            src: proofImageUrl,
            alt: `Comprobante de anticipo de ${dep.clientName}`,
            ariaLabel: `Ver comprobante de ${dep.clientName}`,
            onClick: () => setPreviewDeposit(dep),
          }
        : undefined,
      title: isUploaded
        ? `${dep.clientName} subió su anticipo de ${formatCurrency(amountCents, currency)}`
        : `Anticipo pendiente de ${dep.clientName} · ${formatCurrency(amountCents, currency)}`,
      subtitle: `${dep.serviceName} · ${dateLabel} ${timeLabel} con ${dep.staffName} · ${dep.bookingCode}`,
      isBusy: isLoading,
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
        label: 'Avisar por WhatsApp',
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

  const whatsappUsage = data.whatsappUsage;
  if (
    whatsappUsage &&
    (whatsappUsage.alertLevel === 'warning_80' || whatsappUsage.alertLevel === 'limit_100')
  ) {
    const remaining = Math.max(0, whatsappUsage.quotaLimit - whatsappUsage.sentCount);
    const isAtLimit = whatsappUsage.alertLevel === 'limit_100';
    allTasks.push({
      id: 'whatsapp-quota-alert',
      tone: 'warning',
      icon: <MessageCircle size={19} aria-hidden="true" />,
      title: isAtLimit
        ? `Límite mensual de WhatsApp alcanzado (${whatsappUsage.sentCount} de ${whatsappUsage.quotaLimit})`
        : `WhatsApp al ${whatsappUsage.percentUsed}% de tu límite del mes`,
      subtitle: isAtLimit
        ? 'Los avisos automáticos siguen saliendo por correo y enlace directo hasta el próximo mes.'
        : `${whatsappUsage.sentCount} de ${whatsappUsage.quotaLimit} mensajes usados · Te quedan ${remaining} avisos automáticos este mes.`,
      primary: {
        label: 'Revisar en Conexiones',
        href: '/admin/integraciones',
      },
    });
  }

  const visibleTasks = allTasks.slice(0, maxVisible);
  const hiddenCount = Math.max(0, allTasks.length - visibleTasks.length);

  const headerActions = confirmingBookingId ? (
    <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
      Confirmando...
    </Text>
  ) : savedMessage ? (
    <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
      <Check size={12} aria-hidden="true" />
      {savedMessage}
    </Text>
  ) : (
    <Text type="supporting" color="secondary" className="ad-hide-s">
      Resuélvelo aquí mismo en un toque
    </Text>
  );

  return (
    <>
      <SurfaceCard
        id="ad-att"
        title="Pendientes de hoy"
        count={allTasks.length > 0 ? allTasks.length : undefined}
        actions={headerActions}
        className="ad-card ad-enter"
        footer={
          hiddenCount > 0 ? (
            <>
              <Text type="supporting" color="secondary">
                Hay {hiddenCount} pendiente{hiddenCount === 1 ? '' : 's'} más en tu panel.
              </Text>
              <Button label="Revisar en Caja" variant="ghost" size="sm" href="/admin/caja" />
            </>
          ) : undefined
        }
      >
        {visibleTasks.length === 0 ? (
          <VStack padding={4}>
            <EmptyStateCard
              framed={false}
              isCompact
              icon={
                <VStack
                  className="ad-done-circle fx-pop"
                  align="center"
                  justify="center"
                  aria-hidden="true"
                >
                  <Check size={18} />
                </VStack>
              }
              title="Todo al día"
              description="No tienes anticipos, cobros ni avisos pendientes."
            />
          </VStack>
        ) : (
          <VStack gap={0}>
            {visibleTasks.map((task) => (
              <ActionRow
                key={task.id}
                className={task.isBusy ? 'ad-task fx-busy' : 'ad-task'}
                leading={
                  task.thumbnail ? (
                    <button
                      type="button"
                      className="ad-proof-thumb"
                      aria-label={task.thumbnail.ariaLabel}
                      title="Toca para ampliar el comprobante"
                      disabled={Boolean(task.isBusy)}
                      onClick={task.thumbnail.onClick}
                    >
                      <img src={task.thumbnail.src} alt={task.thumbnail.alt} />
                    </button>
                  ) : (
                    <VStack
                      className="ad-task-icon"
                      data-tone={task.tone}
                      align="center"
                      justify="center"
                      aria-hidden="true"
                    >
                      {task.icon}
                    </VStack>
                  )
                }
                title={task.title}
                subtitle={task.subtitle}
                actions={
                  <HStack gap={2} wrap="wrap">
                    {task.secondary ? (
                      <Button
                        type={task.secondary.href ? undefined : 'button'}
                        label={task.secondary.label}
                        variant="secondary"
                        size="sm"
                        isDisabled={Boolean(task.isBusy)}
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
                      isLoading={Boolean(task.primary.isLoading)}
                      isDisabled={Boolean(task.primary.isLoading)}
                      href={task.primary.href}
                      target={task.primary.isExternal ? '_blank' : undefined}
                      rel={task.primary.isExternal ? 'noopener noreferrer' : undefined}
                      onClick={task.primary.onClick}
                    />
                  </HStack>
                }
              />
            ))}
          </VStack>
        )}
      </SurfaceCard>

      <DepositProofPreviewDialog
        deposit={previewDeposit}
        currency={currency}
        timezone={tz}
        depositFallbackCents={depositFallbackCents}
        confirmingBookingId={confirmingBookingId}
        onClose={() => setPreviewDeposit(null)}
        onConfirmDeposit={onConfirmDeposit}
      />
    </>
  );
}
