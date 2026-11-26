'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { CalendarPlus, PackageCheck, Sparkles } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { BookingPaymentSummary } from '@/lib/payments/splits';
import type { BookingWithRelations, LoyaltyStamp, PaymentSplit } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { PAYMENT_METHOD_LABELS } from './PaymentSplitsEditor';

export interface CompletedCheckoutState {
  summary: BookingPaymentSummary;
  splitsCount: number;
  stampAwarded: LoyaltyStamp | null;
  redeemedReward: boolean;
  redeemedPackageName: string | null;
}

interface CheckoutBalanceCardProps {
  heroRemainingCents: number;
  effectiveTotalCents: number;
  priorPaidCents: number;
  draftTipCents: number;
  payButtonTotalLabel: string;
  selectedPackageName: string | null;
  hasExtraItem: boolean;
  existingSplits: PaymentSplit[];
  isSplitMode: boolean;
  combinedSummary: BookingPaymentSummary;
  currency: 'MXN' | 'USD';
}

export function CheckoutBalanceCard({
  heroRemainingCents,
  effectiveTotalCents,
  priorPaidCents,
  draftTipCents,
  payButtonTotalLabel,
  selectedPackageName,
  hasExtraItem,
  existingSplits,
  isSplitMode,
  combinedSummary,
  currency,
}: CheckoutBalanceCardProps) {
  return (
    <SurfaceCard tone={heroRemainingCents > 0 ? 'accent' : 'subtle'} padded>
      <VStack gap={1.5}>
        <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
          Falta cobrar: {formatCurrency(heroRemainingCents, currency)}
        </Text>
        <Text type="supporting" color="secondary" hasTabularNumbers>
          {selectedPackageName
            ? `Servicio cubierto con "${selectedPackageName}" (-1 sesión)`
            : priorPaidCents > 0
              ? `Total ${formatCurrency(effectiveTotalCents, currency)} − Anticipo ${formatCurrency(priorPaidCents, currency)}`
              : `Total del servicio${hasExtraItem ? ' + producto' : ''}: ${formatCurrency(effectiveTotalCents, currency)}`}
        </Text>
        {draftTipCents > 0 ? (
          <Text size="sm" weight="semibold" hasTabularNumbers>
            + Propina {formatCurrency(draftTipCents, currency)} · Total a recibir:{' '}
            {payButtonTotalLabel}
          </Text>
        ) : null}
        {existingSplits.length > 0 ? (
          <HStack gap={1.5} wrap="wrap" paddingBlockStart={1}>
            {existingSplits.map((split) => (
              <Token
                key={split.id}
                size="sm"
                color="green"
                label={`${PAYMENT_METHOD_LABELS[split.method]} ${formatCurrency(split.amountCents, currency)}`}
              />
            ))}
          </HStack>
        ) : null}
        {isSplitMode && !selectedPackageName ? (
          <HStack justify="between" align="center" paddingBlockStart={1}>
            <Text type="supporting" color="secondary">
              Suma de métodos
            </Text>
            <StatusTag
              label={
                combinedSummary.isFullyPaid
                  ? combinedSummary.changeCents > 0
                    ? `Cambio ${formatCurrency(combinedSummary.changeCents, currency)}`
                    : 'Cuenta cubierta'
                  : `Faltan ${formatCurrency(combinedSummary.remainingCents, currency)}`
              }
              tone={combinedSummary.isFullyPaid ? 'success' : 'warning'}
              hasTabularNumbers
            />
          </HStack>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}

interface CheckoutReceiptViewProps {
  booking: BookingWithRelations;
  completedState: CompletedCheckoutState;
  currency: 'MXN' | 'USD';
  onScheduleRetouch: (booking: BookingWithRelations) => void;
}

export function CheckoutReceiptView({
  booking,
  completedState,
  currency,
  onScheduleRetouch,
}: CheckoutReceiptViewProps) {
  return (
    <VStack gap={4} className="fx-drawer-in">
      <Banner
        status="success"
        role="status"
        title="¡Cobro registrado!"
        description={`Cobrado ${formatCurrency(completedState.summary.paidCents, currency)}${
          completedState.summary.totalTipsCents > 0
            ? ` · Propina ${formatCurrency(completedState.summary.totalTipsCents, currency)}`
            : ''
        }. La cita quedó marcada como completada.`}
      />

      {completedState.stampAwarded ? (
        <SurfaceCard tone="accent" padded className="fx-pop">
          <HStack justify="between" align="center" gap={2} wrap="wrap">
            <HStack gap={2} align="center">
              <Sparkles size={15} aria-hidden="true" />
              <Text weight="semibold">Sello sumado a su tarjeta</Text>
            </HStack>
            <StatusTag label="+1 sello" tone="success" />
          </HStack>
        </SurfaceCard>
      ) : null}

      {completedState.redeemedPackageName ? (
        <SurfaceCard tone="accent" padded className="fx-pop">
          <HStack justify="between" align="center" gap={2} wrap="wrap">
            <HStack gap={2} align="center">
              <PackageCheck size={15} aria-hidden="true" />
              <Text weight="semibold">
                Sesión descontada: {completedState.redeemedPackageName}
              </Text>
            </HStack>
            <StatusTag label="-1 sesión" tone="success" />
          </HStack>
        </SurfaceCard>
      ) : null}

      {completedState.redeemedReward ? (
        <SurfaceCard tone="subtle" padded className="fx-pop">
          <HStack justify="between" align="center" gap={2} wrap="wrap">
            <Text weight="semibold">Premio de tarjeta de sellos aplicado</Text>
            <StatusTag label="Canjeado" tone="info" />
          </HStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard tone="accent" padded>
        <VStack gap={3}>
          <Text weight="semibold" size="base">
            ¿Agendamos su próximo retoque?
          </Text>
          <Text type="supporting" color="secondary">
            Deja lista la cita de {booking.client.fullName} con {booking.staff.name} en 3 semanas
            sin volver a escribir sus datos.
          </Text>
          <Button
            type="button"
            label="Agendar su retoque en 3 semanas"
            variant="primary"
            size="md"
            width="100%"
            icon={<CalendarPlus size={16} aria-hidden="true" />}
            onClick={() => onScheduleRetouch(booking)}
          />
        </VStack>
      </SurfaceCard>
    </VStack>
  );
}
