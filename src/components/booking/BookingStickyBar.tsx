'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { ChevronUp } from 'lucide-react';
import { formatDuration } from '@/lib/format';
import { BookingSummaryCard, type SummaryRow } from './BookingSummaryCard';
import { formatServicePrice } from './bookingHelpers';
import type { BookingStep } from './bookingMachine';

interface PrimaryCtaProps {
  step: BookingStep;
  formId: string;
  nextLabel: string;
  canContinue: boolean;
  isBusy: boolean;
  isSubmittingBooking: boolean;
  holdExpired: boolean;
  onNext: () => void;
}

function BookingPrimaryCta({
  step,
  formId,
  nextLabel,
  canContinue,
  isBusy,
  isSubmittingBooking,
  holdExpired,
  onNext,
}: PrimaryCtaProps) {
  if (step === 'details') {
    return (
      <Button
        type="submit"
        form={formId}
        variant="primary"
        size="lg"
        label={nextLabel}
        isDisabled={isSubmittingBooking || holdExpired}
        isLoading={isSubmittingBooking}
        className="rb-cta fx-press"
      />
    );
  }
  return (
    <Button
      variant="primary"
      size="lg"
      label={nextLabel}
      isDisabled={!canContinue || isBusy}
      isLoading={isBusy && step === 'staff'}
      onClick={onNext}
      className="rb-cta fx-press"
    />
  );
}

interface BookingDesktopActionsProps extends PrimaryCtaProps {
  canGoBack: boolean;
  nextHint: string;
  onBack: () => void;
}

export function BookingDesktopActions({
  canGoBack,
  nextHint,
  onBack,
  ...ctaProps
}: BookingDesktopActionsProps) {
  return (
    <HStack justify="between" align="center" gap={3} className="rb-actions rb-d">
      <Button
        label="Atrás"
        variant="secondary"
        size="lg"
        className="fx-press"
        isDisabled={!canGoBack || ctaProps.isSubmittingBooking}
        onClick={onBack}
      />
      <HStack gap={3} align="center">
        {nextHint ? (
          <Text type="supporting" color="secondary">
            {nextHint}
          </Text>
        ) : null}
        <BookingPrimaryCta {...ctaProps} />
      </HStack>
    </HStack>
  );
}

interface BookingSummaryProps {
  currency: 'MXN' | 'USD';
  rows: SummaryRow[];
  totalPriceCents: number;
  hasStartingPrice: boolean;
  discountCents: number;
  depositAmountCents: number;
  holdRemainingSec: number;
  holdTotalSec: number;
  isHoldExpired: boolean;
}

interface BookingStickyBarProps extends PrimaryCtaProps {
  currency: 'MXN' | 'USD';
  totalPriceCents: number;
  hasStartingPrice: boolean;
  totalDurationMinutes: number;
  summaryOpen: boolean;
  summaryProps: BookingSummaryProps;
  onOpenSummary: () => void;
  onSummaryOpenChange: (open: boolean) => void;
}

export function BookingStickyBar({
  currency,
  totalPriceCents,
  hasStartingPrice,
  totalDurationMinutes,
  summaryOpen,
  summaryProps,
  onOpenSummary,
  onSummaryOpenChange,
  ...ctaProps
}: BookingStickyBarProps) {
  return (
    <>
      <HStack justify="between" align="center" gap={3} className="rb-bottom rb-m">
        <button
          type="button"
          className="rb-bottom-summary fx-press"
          style={{ minWidth: 0 }}
          aria-haspopup="dialog"
          onClick={onOpenSummary}
        >
          <Text className="lk-serif rb-bottom-total" hasTabularNumbers>
            {formatServicePrice(totalPriceCents, hasStartingPrice, currency)}
          </Text>
          <Text type="supporting" color="accent" weight="semibold" className="rb-bottom-hint" hasTabularNumbers>
            {formatDuration(totalDurationMinutes)} · Ver resumen
            <ChevronUp size={14} aria-hidden="true" />
          </Text>
        </button>
        <BookingPrimaryCta {...ctaProps} />
      </HStack>

      <BottomSheet isOpen={summaryOpen} onOpenChange={onSummaryOpenChange} label="Resumen de tu cita" padding={0} height="hug">
        <VStack className="lk-portal rb-sheet fx-sheet-in">
          <BookingSummaryCard {...summaryProps} headingId="rb-summary-sheet" />
        </VStack>
      </BottomSheet>
    </>
  );
}
