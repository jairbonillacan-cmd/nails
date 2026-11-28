'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { CalendarPlus, MessageCircle, PackageCheck, Sparkles } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import { buildCheckoutReceiptWhatsAppUrl } from '@/lib/booking/receipt';
import { DEFAULT_TOUCH_UP_DAYS } from '@/lib/booking/recurrence';
import type { BookingPaymentSummary } from '@/lib/payments/splits';
import type {
  BookingWithRelations,
  LoyaltyStamp,
  PaymentSplit,
  SalonSettings,
} from '@/lib/types';
import { formatCurrency, formatPaymentSplitMethodLabel } from '@/lib/format';

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
  depositPaidCents?: number;
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
  depositPaidCents = 0,
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
              ? depositPaidCents > 0 && priorPaidCents === depositPaidCents
                ? `Total ${formatCurrency(effectiveTotalCents, currency)} − Anticipo pagado ${formatCurrency(depositPaidCents, currency)}`
                : `Total ${formatCurrency(effectiveTotalCents, currency)} − Pagado ${formatCurrency(priorPaidCents, currency)}`
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
                label={`${formatPaymentSplitMethodLabel(split.method)} ${formatCurrency(split.amountCents, currency)}`}
              />
            ))}
          </HStack>
        ) : priorPaidCents > 0 ? (
          <HStack gap={1.5} wrap="wrap" paddingBlockStart={1}>
            <Token
              size="sm"
              color="green"
              label={`Anticipo pagado ${formatCurrency(priorPaidCents, currency)}`}
            />
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
  salonSettings: Pick<SalonSettings, 'name' | 'currency' | 'timezone'>;
  stampsCount?: number | null;
  stampsRequired?: number | null;
  touchUpDays?: number;
  onScheduleRetouch: (booking: BookingWithRelations) => void;
}

export function CheckoutReceiptView({
  booking,
  completedState,
  salonSettings,
  stampsCount = null,
  stampsRequired = null,
  touchUpDays = DEFAULT_TOUCH_UP_DAYS,
  onScheduleRetouch,
}: CheckoutReceiptViewProps) {
  const currency = salonSettings.currency;
  const receiptWaUrl = buildCheckoutReceiptWhatsAppUrl({
    settings: salonSettings,
    booking,
    paidCents: completedState.summary.paidCents,
    totalTipsCents: completedState.summary.totalTipsCents,
    stampAwarded: Boolean(completedState.stampAwarded),
    stampsCount,
    stampsRequired,
    redeemedPackageName: completedState.redeemedPackageName,
    redeemedReward: completedState.redeemedReward,
  });

  const stampTagLabel =
    typeof stampsCount === 'number' && typeof stampsRequired === 'number'
      ? `+1 sello · ${stampsCount}/${stampsRequired}`
      : '+1 sello';

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
            <StatusTag label={stampTagLabel} tone="success" hasTabularNumbers />
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

      {receiptWaUrl ? (
        <SurfaceCard tone="subtle" padded>
          <VStack gap={2}>
            <Text weight="semibold" size="base">
              Recibo por WhatsApp
            </Text>
            <Text type="supporting" color="secondary">
              Envía el comprobante con total cobrado
              {completedState.stampAwarded ? ' y avance de sellos' : ''} a {booking.client.fullName}.
            </Text>
            <Button
              label="Enviar recibo por WhatsApp"
              variant="secondary"
              size="md"
              width="100%"
              icon={<MessageCircle size={16} aria-hidden="true" />}
              href={receiptWaUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </VStack>
        </SurfaceCard>
      ) : null}

      <SurfaceCard tone="accent" padded>
        <VStack gap={3}>
          <Text weight="semibold" size="base">
            ¿Agendamos su próximo retoque?
          </Text>
          <Text type="supporting" color="secondary">
            Deja lista la cita de {booking.client.fullName} con {booking.staff.name} en{' '}
            {touchUpDays} días sin volver a escribir sus datos.
          </Text>
          <Button
            type="button"
            label={`Agendar siguiente retoque (+${touchUpDays} días)`}
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
