'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { RotateCcw } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatDateShortInTimezone } from '@/lib/format';
import type { BookingConflictState, BookingHoldErrorState } from './bookingMachine';

interface BookingConflictBannerProps {
  formErrorCode: string | null;
  conflict: BookingConflictState | null;
  holdError?: BookingHoldErrorState | null;
  timezone: string;
  timeFormat: '12h' | '24h';
  pendingSlotKey: string | null;
  isBusy: boolean;
  onDismissConflict: () => void;
  onDismissHoldError?: () => void;
  onRetryHold?: () => void;
  onSelectSuggestion: (slot: AvailableSlot) => void;
}

function resolveHoldErrorTitle(error: BookingHoldErrorState): string {
  if (error.kind === 'rate_limited') return 'Demasiados intentos seguidos';
  if (error.kind === 'policy') return 'No pudimos apartar este horario';
  return 'No pudimos conectar para apartar tu horario';
}

function resolveHoldErrorDescription(error: BookingHoldErrorState): string {
  if (
    error.kind === 'rate_limited' &&
    typeof error.retryAfterSeconds === 'number' &&
    error.retryAfterSeconds > 0 &&
    !/\d/.test(error.message)
  ) {
    return `${error.message} Espera ${error.retryAfterSeconds} s e intenta de nuevo.`;
  }
  return error.message;
}

export function BookingConflictBanner({
  formErrorCode,
  conflict,
  holdError = null,
  timezone,
  timeFormat,
  pendingSlotKey,
  isBusy,
  onDismissConflict,
  onDismissHoldError,
  onRetryHold,
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
      {holdError ? (
        <VStack className="fx-fade-up">
          <Banner
            status={holdError.kind === 'rate_limited' ? 'warning' : 'error'}
            role="alert"
            title={resolveHoldErrorTitle(holdError)}
            description={resolveHoldErrorDescription(holdError)}
            collapsible={false}
            isDismissable={Boolean(onDismissHoldError)}
            dismissLabel="Cerrar aviso"
            onDismiss={onDismissHoldError}
          >
            {onRetryHold ? (
              <HStack gap={2} wrap="wrap" paddingBlockStart={2}>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  className="fx-press"
                  label="Reintentar"
                  icon={<RotateCcw size={15} aria-hidden="true" />}
                  isDisabled={isBusy}
                  isLoading={isBusy}
                  onClick={onRetryHold}
                />
              </HStack>
            ) : null}
          </Banner>
        </VStack>
      ) : null}
      {conflict ? (
        <VStack className="fx-fade-up">
          <Banner
            status="warning"
            role="alert"
            title={conflict.kind === 'expired' ? 'Se acabó tu tiempo de apartado' : 'Ese horario se acaba de ocupar'}
            description={conflict.message}
            collapsible={false}
            isDismissable
            dismissLabel="Cerrar aviso"
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
