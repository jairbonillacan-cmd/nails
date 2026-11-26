'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatDateShortInTimezone } from '@/lib/format';
import type { BookingConflictState } from './bookingMachine';

interface BookingConflictBannerProps {
  formErrorCode: string | null;
  conflict: BookingConflictState | null;
  timezone: string;
  timeFormat: '12h' | '24h';
  pendingSlotKey: string | null;
  isBusy: boolean;
  onDismissConflict: () => void;
  onSelectSuggestion: (slot: AvailableSlot) => void;
}

export function BookingConflictBanner({
  formErrorCode,
  conflict,
  timezone,
  timeFormat,
  pendingSlotKey,
  isBusy,
  onDismissConflict,
  onSelectSuggestion,
}: BookingConflictBannerProps) {
  return (
    <>
      {formErrorCode === 'NO_SHOW_DEPOSIT_REQUIRED' ? (
        <VStack className="fx-fade-up">
          <Banner
            status="info"
            role="status"
            title="Esta cita lleva anticipo"
            description="Con el anticipo apartamos tu lugar. Se descuenta de tu total el día de tu cita."
          />
        </VStack>
      ) : null}
      {conflict ? (
        <VStack className="fx-fade-up">
          <Banner
            status="warning"
            role="alert"
            title={conflict.kind === 'expired' ? 'Se acabó tu tiempo de apartado' : 'Ese horario se acaba de ocupar'}
            description={conflict.message}
            isDismissable
            onDismiss={onDismissConflict}
          >
            {conflict.suggestions.length > 0 ? (
              <HStack gap={2} wrap="wrap" paddingBlockStart={2}>
                {conflict.suggestions.slice(0, 3).map((alt) => {
                  const altKey = `${alt.staffId}-${alt.startAt}`;
                  const isAltPending = pendingSlotKey === altKey;
                  return (
                    <Button
                      key={altKey}
                      variant="secondary"
                      size="md"
                      className="fx-press fx-tabular"
                      isDisabled={isBusy}
                      isLoading={isAltPending}
                      label={
                        isAltPending
                          ? 'Apartando…'
                          : `${formatDateShortInTimezone(alt.startAt, timezone)} · ${
                              timeFormat === '24h' ? alt.localTime24 : alt.localTime12
                            }`
                      }
                      onClick={() => onSelectSuggestion(alt)}
                    />
                  );
                })}
              </HStack>
            ) : null}
          </Banner>
        </VStack>
      ) : null}
    </>
  );
}
