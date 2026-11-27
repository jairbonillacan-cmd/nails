'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { Token } from '@astryxdesign/core/Token';
import { Check, ExternalLink, ImageIcon, Wallet } from 'lucide-react';
import { agendaHref } from '@/lib/admin-links';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import {
  ActionRow,
  DepositProofReviewDialog,
  EmptyStateCard,
  FilterPillBar,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import {
  formatCajaDepositsBreakdown,
  formatInstagramDisplay,
  formatInstagramUrl,
  hasCajaDepositProof,
  isImageProofHref,
  isSafeProofHref,
  proofMethodMeta,
  type PendingDepositRow,
} from './cajaTypes';

type DepositProofFilter = 'all' | 'review' | 'missing';

interface CajaDepositsTabProps {
  pendingDeposits: readonly PendingDepositRow[];
  defaultDepositLabel: string;
  tz: string;
  currency: 'MXN' | 'USD';
  approvingId: string | null;
  rejectingId?: string | null;
  onApproveDeposit: (bookingId: string, bookingCode: string) => Promise<boolean>;
  onRejectDeposit?: (bookingId: string, bookingCode: string) => Promise<boolean>;
  onRejectDepositDirect?: (
    bookingId: string,
    bookingCode: string,
    reason?: string,
  ) => Promise<boolean>;
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
  onRejectDepositDirect,
}: CajaDepositsTabProps) {
  const [proofFilter, setProofFilter] = useState<DepositProofFilter>('all');
  const [previewDeposit, setPreviewDeposit] = useState<PendingDepositRow | null>(null);

  const sortedDeposits = pendingDeposits.toSorted(
    (a, b) => Number(hasCajaDepositProof(b)) - Number(hasCajaDepositProof(a)),
  );
  const awaitingReviewCount = sortedDeposits.filter((dep) => hasCajaDepositProof(dep)).length;
  const missingProofCount = sortedDeposits.length - awaitingReviewCount;
  const effectiveFilter: DepositProofFilter =
    proofFilter === 'review' && awaitingReviewCount === 0
      ? 'all'
      : proofFilter === 'missing' && missingProofCount === 0
        ? 'all'
        : proofFilter;
  const filteredDeposits =
    effectiveFilter === 'review'
      ? sortedDeposits.filter((dep) => hasCajaDepositProof(dep))
      : effectiveFilter === 'missing'
        ? sortedDeposits.filter((dep) => !hasCajaDepositProof(dep))
        : sortedDeposits;
  const proofFilterOptions: FilterPillOption<DepositProofFilter>[] = [
    { value: 'all', label: 'Todos', count: sortedDeposits.length },
    { value: 'review', label: 'Por revisar', count: awaitingReviewCount },
    { value: 'missing', label: 'Sin comprobante', count: missingProofCount },
  ];

  const modalRejectHandler = onRejectDepositDirect ?? onRejectDeposit;

  return (
    <VStack gap={4}>
      <SurfaceCard
        title={`Anticipos pendientes (${defaultDepositLabel})`}
        subtitle={
          sortedDeposits.length > 0
            ? formatCajaDepositsBreakdown(awaitingReviewCount, missingProofCount)
            : 'Comprobantes de transferencia que llegaron por tu página o por Instagram.'
        }
        count={sortedDeposits.length > 0 ? sortedDeposits.length : undefined}
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
        {sortedDeposits.length === 0 ? (
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
          <>
            {awaitingReviewCount > 0 && missingProofCount > 0 ? (
              <HStack className="ad-toolbar" paddingInline={4} paddingBlock={3}>
                <FilterPillBar
                  ariaLabel="Filtrar anticipos por estado de comprobante"
                  mode="pills"
                  size="sm"
                  value={effectiveFilter}
                  options={proofFilterOptions}
                  onChange={setProofFilter}
                />
              </HStack>
            ) : null}
            <VStack className="ad-row-list" gap={0}>
              {filteredDeposits.map((dep) => {
                const meta = proofMethodMeta(dep.proofDeliveryMethod);
                const proofUrl = isSafeProofHref(dep.paymentProofUrl)
                  ? dep.paymentProofUrl
                  : null;
                const hasImageProof = isImageProofHref(
                  dep.paymentProofUrl,
                  dep.proofDeliveryMethod,
                );
                const isUploaded = hasCajaDepositProof(dep);
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
                    subtitle={`${dep.serviceName} (${dep.bookingCode}) · ${formatDateShortInTimezone(dep.startAt, tz)} ${formatTimeInTimezone(dep.startAt, tz)} con ${dep.staffName}`}
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
                        <Button
                          type="button"
                          label={
                            hasImageProof && proofUrl
                              ? 'Ver foto'
                              : proofUrl
                                ? 'Ver enlace'
                                : 'Revisar anticipo'
                          }
                          variant="secondary"
                          size="sm"
                          className="ad-caja-touch-btn"
                          icon={
                            hasImageProof && proofUrl ? (
                              <ImageIcon size={14} aria-hidden="true" />
                            ) : proofUrl ? (
                              <ExternalLink size={14} aria-hidden="true" />
                            ) : (
                              <Wallet size={14} aria-hidden="true" />
                            )
                          }
                          onClick={() => setPreviewDeposit(dep)}
                        />
                        {isUploaded && onRejectDeposit ? (
                          <Button
                            type="button"
                            label={isRejecting ? 'Rechazando…' : 'Rechazar'}
                            variant="ghost"
                            size="sm"
                            className="ad-caja-touch-btn"
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
                          className="ad-caja-touch-btn"
                          icon={<Check size={14} aria-hidden="true" />}
                          isLoading={isApproving}
                          isDisabled={isRowBusy}
                          onClick={() => void onApproveDeposit(dep.bookingId, dep.bookingCode)}
                        />
                        <Button
                          label="Ver cita"
                          variant="ghost"
                          size="sm"
                          className="ad-caja-touch-btn"
                          href={agendaHref({ q: dep.bookingCode })}
                        />
                      </HStack>
                    }
                  />
                );
              })}
            </VStack>
          </>
        )}
      </SurfaceCard>

      <DepositProofReviewDialog
        deposit={previewDeposit}
        currency={currency}
        timezone={tz}
        isApproving={Boolean(previewDeposit && approvingId === previewDeposit.bookingId)}
        isRejecting={Boolean(previewDeposit && rejectingId === previewDeposit.bookingId)}
        secondaryLink={
          previewDeposit
            ? { label: 'Ver cita', href: agendaHref({ q: previewDeposit.bookingCode }) }
            : undefined
        }
        onClose={() => setPreviewDeposit(null)}
        onApprove={(dep) => onApproveDeposit(dep.bookingId, dep.bookingCode)}
        onReject={
          modalRejectHandler
            ? (dep, reason) => modalRejectHandler(dep.bookingId, dep.bookingCode, reason)
            : undefined
        }
      />
    </VStack>
  );
}
