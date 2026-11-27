'use client';

import type React from 'react';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import {
  AlertTriangle,
  Check,
  Clock,
  MessageCircle,
  Package,
  ReceiptText,
  Wallet,
} from 'lucide-react';
import {
  ActionRow,
  EmptyStateCard,
  SurfaceCard,
  type DepositProofReviewItem,
} from '@/components/ui';
import { cajaHref } from '@/lib/admin-links';
import { buildActionQueueItems, type ActionQueueItem } from '@/lib/metrics';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminOverviewPayload } from '../AdminProvider';
import {
  isDisplayableProofUrl,
  type DashboardMetrics,
} from './dashboardMetrics';

const DepositProofReviewDialog = dynamic(
  () =>
    import('@/components/ui/DepositProofReviewDialog').then(
      (mod) => mod.DepositProofReviewDialog,
    ),
  { ssr: false },
);

interface DashboardAttentionCardProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
  confirmingBookingId: string | null;
  rejectingBookingId?: string | null;
  onConfirmDeposit: (bookingId: string, clientName: string) => Promise<boolean>;
  onRejectDeposit?: (bookingId: string, clientName: string, reason?: string) => Promise<boolean>;
  maxVisible?: number;
}

function renderQueueIcon(kind: ActionQueueItem['kind']): React.ReactNode {
  if (kind === 'deposit_review' || kind === 'deposit_missing_proof') {
    return <Wallet size={19} aria-hidden="true" />;
  }
  if (kind === 'uncollected_booking') {
    return <ReceiptText size={19} aria-hidden="true" />;
  }
  if (kind === 'waitlist') {
    return <Clock size={19} aria-hidden="true" />;
  }
  if (kind === 'low_stock') {
    return <Package size={19} aria-hidden="true" />;
  }
  if (kind === 'whatsapp_failed_reminders' || kind === 'whatsapp_failed_messages') {
    return <AlertTriangle size={19} aria-hidden="true" />;
  }
  return <MessageCircle size={19} aria-hidden="true" />;
}

export function DashboardAttentionCard({
  data,
  metrics,
  confirmingBookingId,
  rejectingBookingId = null,
  onConfirmDeposit,
  onRejectDeposit,
  maxVisible = 6,
}: DashboardAttentionCardProps) {
  const [previewDeposit, setPreviewDeposit] = useState<DepositProofReviewItem | null>(null);
  const [showAll, setShowAll] = useState(false);
  const currency = data.settings.currency;
  const role = data.session.user.role;
  const tz = metrics.tz;
  const depositFallbackCents = data.settings.depositAmountCents ?? 20000;

  const pendingDepositsById = new Map(
    data.pendingDeposits.map((dep) => [dep.bookingId, dep]),
  );

  const queueItems = buildActionQueueItems({
    salonName: data.settings.name,
    currency,
    timezone: tz,
    depositFallbackCents,
    pendingDeposits: data.pendingDeposits,
    uncollectedBookings: data.uncollectedBookings,
    waitlist: data.waitlist,
    services: data.services,
    inventory: data.inventory,
    whatsappInboxSummary: data.whatsappInboxSummary,
    whatsappUsage: data.whatsappUsage,
    canAccessInventory: roleCanAccess(role, 'inventory'),
    canAccessWhatsApp: roleCanAccess(role, 'whatsapp'),
    canAccessIntegrations: roleCanAccess(role, 'integrations'),
  });

  const visibleItems = showAll ? queueItems : queueItems.slice(0, maxVisible);
  const hiddenCount = Math.max(0, queueItems.length - visibleItems.length);

  return (
    <>
      <SurfaceCard
        id="ad-att"
        title="Qué hacer ahora"
        subtitle="Pendientes priorizados para resolver en un toque"
        count={queueItems.length > 0 ? queueItems.length : undefined}
        className="ad-card ad-enter"
        footer={
          queueItems.length > maxVisible ? (
            <>
              <Text type="supporting" color="secondary">
                {showAll
                  ? `Mostrando los ${queueItems.length} pendientes`
                  : `Hay ${hiddenCount} pendiente${hiddenCount === 1 ? '' : 's'} más en tu panel.`}
              </Text>
              <Button
                type="button"
                label={showAll ? 'Mostrar menos' : `Ver todos (${queueItems.length})`}
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((prev) => !prev)}
              />
            </>
          ) : undefined
        }
      >
        {visibleItems.length === 0 ? (
          <VStack padding={5} className="ad-card-empty-center">
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
          <VStack gap={0} className="ad-task-list">
            {visibleItems.map((item) => {
              const deposit =
                (item.kind === 'deposit_review' || item.kind === 'deposit_missing_proof') &&
                item.bookingId
                  ? (pendingDepositsById.get(item.bookingId) ?? null)
                  : null;
              const isExternalProofLink = Boolean(
                deposit &&
                  (deposit.proofDeliveryMethod === 'web_link' ||
                    deposit.paymentProofUrl?.startsWith('https://')),
              );
              const proofImageUrl =
                deposit && !isExternalProofLink && isDisplayableProofUrl(deposit.paymentProofUrl)
                  ? deposit.paymentProofUrl
                  : null;
              const isConfirming = Boolean(deposit && confirmingBookingId === deposit.bookingId);
              const isRejecting = Boolean(deposit && rejectingBookingId === deposit.bookingId);
              const isBusy = isConfirming || isRejecting;

              return (
                <ActionRow
                  key={item.id}
                  className={isBusy ? 'ad-task fx-busy' : 'ad-task'}
                  leading={
                    deposit && proofImageUrl ? (
                      <button
                        type="button"
                        className="ad-proof-thumb"
                        aria-label={`Ver comprobante de ${deposit.clientName}`}
                        title="Toca para ampliar el comprobante"
                        disabled={isBusy}
                        onClick={() => setPreviewDeposit(deposit)}
                      >
                        <img
                          src={proofImageUrl}
                          alt={`Comprobante de anticipo de ${deposit.clientName}`}
                        />
                      </button>
                    ) : (
                      <VStack
                        className="ad-task-icon"
                        data-tone={item.tone}
                        align="center"
                        justify="center"
                        aria-hidden="true"
                      >
                        {renderQueueIcon(item.kind)}
                      </VStack>
                    )
                  }
                  title={item.title}
                  subtitle={item.subtitle}
                  actions={
                    <HStack gap={2} wrap="wrap">
                      {deposit && item.kind === 'deposit_review' ? (
                        <Button
                          type="button"
                          label={isExternalProofLink ? 'Ver enlace' : 'Ver comprobante'}
                          variant="secondary"
                          size="sm"
                          isDisabled={isBusy}
                          onClick={() => setPreviewDeposit(deposit)}
                        />
                      ) : item.secondaryLabel && item.secondaryHref ? (
                        <Button
                          label={item.secondaryLabel}
                          variant="secondary"
                          size="sm"
                          isDisabled={isBusy}
                          href={item.secondaryHref}
                        />
                      ) : null}

                      {deposit ? (
                        <Button
                          type="button"
                          label={isConfirming ? 'Confirmando…' : item.primaryLabel}
                          variant="primary"
                          size="sm"
                          isLoading={isConfirming}
                          isDisabled={isBusy}
                          onClick={() => void onConfirmDeposit(deposit.bookingId, deposit.clientName)}
                        />
                      ) : (
                        <Button
                          label={item.primaryLabel}
                          variant="primary"
                          size="sm"
                          icon={
                            item.primaryExternal ? (
                              <MessageCircle size={14} aria-hidden="true" />
                            ) : undefined
                          }
                          href={item.primaryHref}
                          target={item.primaryExternal ? '_blank' : undefined}
                          rel={item.primaryExternal ? 'noopener noreferrer' : undefined}
                        />
                      )}
                    </HStack>
                  }
                />
              );
            })}
          </VStack>
        )}
      </SurfaceCard>

      {previewDeposit ? (
        <DepositProofReviewDialog
          deposit={{
            ...previewDeposit,
            depositAmountCents: previewDeposit.depositAmountCents || depositFallbackCents,
          }}
          currency={currency}
          timezone={tz}
          isApproving={confirmingBookingId === previewDeposit.bookingId}
          isRejecting={rejectingBookingId === previewDeposit.bookingId}
          secondaryLink={{
            label: 'Ir a Anticipos en Caja',
            href: cajaHref({ tab: 'anticipos' }),
          }}
          onClose={() => setPreviewDeposit(null)}
          onApprove={(dep) => onConfirmDeposit(dep.bookingId, dep.clientName)}
          onReject={
            onRejectDeposit
              ? (dep, reason) => onRejectDeposit(dep.bookingId, dep.clientName, reason)
              : undefined
          }
        />
      ) : null}
    </>
  );
}
