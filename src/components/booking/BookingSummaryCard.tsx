'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { LANDING_ASSETS } from '../landing/landingContent';
import { formatHoldClock } from './BookingChrome';
import { formatServicePrice } from './bookingHelpers';

export interface SummaryRow {
  key: string;
  label: string;
  value: string;
  sub: string | null;
  mark: string;
  isDone: boolean;
}

interface BookingSummaryCardProps {
  currency: PublicSettingsDTO['currency'];
  rows: SummaryRow[];
  totalPriceCents: number;
  hasStartingPrice: boolean;
  discountCents: number;
  depositAmountCents: number;
  depositLabel?: string;
  codeBadge?: string | null;
  holdRemainingSec: number;
  holdTotalSec: number;
  headingId: string;
}

export function BookingSummaryCard({
  currency,
  rows,
  totalPriceCents,
  hasStartingPrice,
  discountCents,
  depositAmountCents,
  depositLabel = 'Anticipo para apartar',
  codeBadge = null,
  holdRemainingSec,
  holdTotalSec,
  headingId,
}: BookingSummaryCardProps) {
  const holdPercent = holdTotalSec > 0 ? Math.min(100, (holdRemainingSec / holdTotalSec) * 100) : 0;

  return (
    <VStack gap={4} className="rb-summary">
      <img className="rb-summary-cherries" src={LANDING_ASSETS.cherriesWhite} alt="" width={280} height={280} />
      <HStack justify="between" align="center" gap={2} wrap="wrap">
        <Heading level={2} id={headingId} color="inherit" className="lk-serif rb-summary-title">
          Tu cita
        </Heading>
        {codeBadge ? (
          <Text color="inherit" weight="bold" className="ck-summary-code" hasTabularNumbers>
            {codeBadge}
          </Text>
        ) : null}
      </HStack>

      <VStack as="ul" gap={3} className="rb-summary-rows">
        {rows.map((row) => (
          <HStack as="li" key={row.key} gap={3} align="start">
            <Text color="inherit" weight="bold" className="rb-summary-mark" data-on={row.isDone ? 'true' : 'false'} aria-hidden="true">
              {row.mark === 'clock' ? <Clock size={16} /> : row.mark}
            </Text>
            <VStack gap={0} className="rb-grow">
              <Text color="inherit" type="supporting" className="rb-summary-label">
                {row.label}
              </Text>
              <Text color="inherit" weight="semibold" className="rb-first-upper">
                {row.value}
              </Text>
              {row.sub ? (
                <Text color="inherit" type="supporting" className="rb-summary-sub">
                  {row.sub}
                </Text>
              ) : null}
            </VStack>
          </HStack>
        ))}
      </VStack>

      <VStack gap={1} className="rb-summary-total">
        {discountCents > 0 ? (
          <HStack justify="between">
            <Text color="inherit" type="supporting" className="rb-summary-sub">
              Descuento
            </Text>
            <Text color="inherit" type="supporting" className="rb-summary-sub" hasTabularNumbers>
              −{formatCurrency(discountCents, currency)}
            </Text>
          </HStack>
        ) : null}
        <HStack justify="between" align="end" gap={2}>
          <Text color="inherit" weight="semibold">
            Total aprox.
          </Text>
          <Text color="inherit" className="lk-serif rb-summary-amount" hasTabularNumbers>
            {formatServicePrice(totalPriceCents, hasStartingPrice, currency)}
          </Text>
        </HStack>
        {depositAmountCents > 0 ? (
          <HStack justify="between">
            <Text color="inherit" type="supporting" className="rb-summary-sub">
              {depositLabel}
            </Text>
            <Text color="inherit" type="supporting" className="rb-summary-sub" hasTabularNumbers>
              {formatCurrency(depositAmountCents, currency)}
            </Text>
          </HStack>
        ) : null}
      </VStack>

      {holdRemainingSec > 0 ? (
        <VStack gap={1.5} className="rb-summary-hold">
          <HStack justify="between">
            <Text color="inherit" type="supporting">
              Te guardamos el horario
            </Text>
            <Text color="inherit" weight="bold" hasTabularNumbers>
              {formatHoldClock(holdRemainingSec)}
            </Text>
          </HStack>
          <progress className="rb-hold-bar" aria-label="Tiempo restante de apartado" max={100} value={holdPercent} />
        </VStack>
      ) : null}
    </VStack>
  );
}
