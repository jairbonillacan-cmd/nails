'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import {
  CalendarDays,
  Check,
  DollarSign,
  ExternalLink,
  Eye,
  ShieldCheck,
  UserCheck,
  UserRound,
} from 'lucide-react';
import { StatusTag } from '@/components/ui/StatusTag';
import {
  computeStudioBarViewModel,
  type StudioBarContext,
} from '@/lib/cita/studio-bar';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import type { BookingStatus } from '@/lib/types';
import {
  isDisplayableMediaUrl,
  resolveSafeHttpUrl,
  type PublicManageBooking,
} from './types';

const STUDIO_ACTION_TIMEOUT_MS = 15_000;

export interface StudioBookingUpdate {
  bookingId: string;
  status?: BookingStatus;
  attendanceStatus?: 'pending' | 'confirmed' | 'rescheduled';
  updatedAt: string;
}

interface CitaStudioBarProps {
  context: StudioBarContext;
  booking: PublicManageBooking;
  currency: PublicSettingsDTO['currency'];
  timezone: string;
  onBookingUpdated: (patch: StudioBookingUpdate) => void;
}

interface AdminPatchResponse {
  booking?: {
    id?: string;
    status?: BookingStatus;
    attendanceStatus?: 'pending' | 'confirmed' | 'rescheduled';
    updatedAt?: string;
  };
  error?: string;
}

export function CitaStudioBar({
  context,
  booking,
  currency,
  timezone,
  onBookingUpdated,
}: CitaStudioBarProps) {
  const [busyAction, setBusyAction] = useState<'confirm' | 'checkin' | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const view = computeStudioBarViewModel(context, {
    id: booking.id,
    bookingCode: booking.bookingCode,
    status: booking.status,
    attendanceStatus: booking.attendanceStatus,
    paymentProofUrl: booking.paymentProofUrl,
    proofDeliveryMethod: booking.proofDeliveryMethod,
  });

  const isBusy = busyAction !== null;
  const isExternalProofLink =
    booking.proofDeliveryMethod === 'web_link' ||
    Boolean(booking.paymentProofUrl?.startsWith('https://'));
  const hasImageProof =
    !isExternalProofLink && isDisplayableMediaUrl(booking.paymentProofUrl);
  const safeExternalProofUrl = isExternalProofLink
    ? resolveSafeHttpUrl(booking.paymentProofUrl)
    : null;

  const submitStudioPatch = async (
    kind: 'confirm' | 'checkin',
    payload: Record<string, string>,
    successMessage: string,
    fallbackPatch: Pick<StudioBookingUpdate, 'status' | 'attendanceStatus'>,
  ): Promise<boolean> => {
    if (busyAction !== null) return false;
    setBusyAction(kind);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const response = await fetchJsonWithTimeout<AdminPatchResponse>('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: STUDIO_ACTION_TIMEOUT_MS,
      });
      if (!response.ok) {
        setFeedbackError(
          response.error || 'No se pudo actualizar la cita. Intenta de nuevo.',
        );
        return false;
      }
      onBookingUpdated({
        bookingId: booking.id,
        status: response.data.booking?.status ?? fallbackPatch.status,
        attendanceStatus:
          response.data.booking?.attendanceStatus ?? fallbackPatch.attendanceStatus,
        updatedAt: response.data.booking?.updatedAt ?? new Date().toISOString(),
      });
      setFeedbackSuccess(successMessage);
      return true;
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmBooking = async (): Promise<boolean> =>
    submitStudioPatch(
      'confirm',
      { bookingId: booking.id, status: 'confirmed' },
      'Cita y anticipo confirmados correctamente.',
      { status: 'confirmed' },
    );

  const handleMarkArrival = async (): Promise<boolean> =>
    submitStudioPatch(
      'checkin',
      { action: 'check_in', bookingId: booking.id },
      'Llegada registrada en recepción.',
      { attendanceStatus: 'confirmed' },
    );

  return (
    <>
      <VStack
        as="section"
        aria-label="Recepción · Escaneo de cita"
        gap={3}
        className="ck-studio-bar fx-fade-up"
      >
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <HStack gap={2} align="center" wrap="wrap">
            <Text color="inherit" className="ck-studio-badge">
              <ShieldCheck size={13} aria-hidden="true" />
              Recepción · Escaneo de cita
            </Text>
            <Text type="supporting" color="secondary">
              {view.roleLabel} · {context.actorName}
            </Text>
          </HStack>

          <HStack gap={1.5} align="center" wrap="wrap">
            {view.showCompletedPaidBadge ? (
              <StatusTag tone="success" label="Cita completada y cobrada" showDot />
            ) : null}
            {!view.showCompletedPaidBadge && view.isConfirmed && view.isArrived ? (
              <StatusTag tone="success" label="Llegada registrada" showDot />
            ) : null}
            {!view.showCompletedPaidBadge &&
            view.showCollectAndStamp &&
            context.remainingCents > 0 ? (
              <StatusTag
                tone="warning"
                hasTabularNumbers
                label={`Por cobrar ${formatCurrency(context.remainingCents, currency)}`}
              />
            ) : null}
          </HStack>
        </HStack>

        {feedbackSuccess ? (
          <Banner
            status="success"
            title={feedbackSuccess}
            isDismissable
            onDismiss={() => setFeedbackSuccess(null)}
          />
        ) : null}

        {feedbackError ? (
          <Banner
            status="error"
            role="alert"
            title="No se pudo completar la acción"
            description={feedbackError}
            isDismissable
            onDismiss={() => setFeedbackError(null)}
          />
        ) : null}

        <HStack gap={2} wrap="wrap" align="center" className="ck-studio-actions">
          {view.showViewProof ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              label="Ver comprobante"
              icon={<Eye size={15} aria-hidden="true" />}
              className="fx-press"
              isDisabled={isBusy}
              onClick={() => setProofOpen(true)}
            />
          ) : null}

          {view.showConfirmBooking ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              label={busyAction === 'confirm' ? 'Confirmando…' : 'Confirmar cita / anticipo'}
              icon={<Check size={15} aria-hidden="true" />}
              className="fx-press"
              isLoading={busyAction === 'confirm'}
              isDisabled={isBusy}
              onClick={() => void handleConfirmBooking()}
            />
          ) : null}

          {view.showMarkArrival ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              label={busyAction === 'checkin' ? 'Registrando…' : 'Marcar llegada'}
              icon={<UserCheck size={15} aria-hidden="true" />}
              className="fx-press"
              isLoading={busyAction === 'checkin'}
              isDisabled={isBusy}
              onClick={() => void handleMarkArrival()}
            />
          ) : null}

          {view.showCollectAndStamp ? (
            <Button
              variant={view.showConfirmBooking ? 'secondary' : 'primary'}
              size="md"
              label="Cobrar y dar sello"
              icon={<DollarSign size={15} aria-hidden="true" />}
              className="fx-press"
              isDisabled={isBusy}
              href={context.collectHref}
            />
          ) : null}

          {view.showClientProfileLink && context.clientProfileHref ? (
            <Button
              variant="primary"
              size="md"
              label="Ver perfil de clienta"
              icon={<UserRound size={15} aria-hidden="true" />}
              className="fx-press"
              href={context.clientProfileHref}
            />
          ) : null}

          {view.showOpenInAgenda ? (
            <Button
              variant="secondary"
              size="md"
              label="Abrir en Agenda"
              icon={<CalendarDays size={15} aria-hidden="true" />}
              className="fx-press"
              href={context.agendaHref}
            />
          ) : null}
        </HStack>
      </VStack>

      {view.showViewProof ? (
        <Dialog
          isOpen={proofOpen}
          onOpenChange={(open) => {
            if (!open && busyAction !== 'confirm') {
              setProofOpen(false);
            }
          }}
          width="min(34rem, 94vw)"
          maxHeight="88dvh"
          padding={4}
        >
          <Layout
            header={
              <DialogHeader
                title="Comprobante de anticipo"
                subtitle={`${booking.client.fullName} · ${booking.bookingCode}`}
                hasDivider
                onOpenChange={(open) => {
                  if (!open && busyAction !== 'confirm') {
                    setProofOpen(false);
                  }
                }}
              />
            }
            content={
              <LayoutContent>
                <VStack gap={3}>
                  <VStack gap={1.5} padding={3} className="rb-card">
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary">
                        Servicio y profesional
                      </Text>
                      <Text weight="semibold" size="sm">
                        {booking.service.name} · {booking.staff.name}
                      </Text>
                    </HStack>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary">
                        Fecha de cita
                      </Text>
                      <Text weight="semibold" size="sm" hasTabularNumbers>
                        {formatDateShortInTimezone(booking.startAt, timezone)} ·{' '}
                        {formatTimeInTimezone(booking.startAt, timezone)}
                      </Text>
                    </HStack>
                    {booking.depositAmountCents > 0 ? (
                      <HStack justify="between" align="center" gap={2} wrap="wrap">
                        <Text type="supporting" color="secondary">
                          Anticipo esperado
                        </Text>
                        <StatusTag
                          tone="info"
                          hasTabularNumbers
                          label={formatCurrency(booking.depositAmountCents, currency)}
                        />
                      </HStack>
                    ) : null}
                  </VStack>

                  {hasImageProof && booking.paymentProofUrl ? (
                    <VStack gap={2}>
                      <img
                        src={booking.paymentProofUrl}
                        alt={`Comprobante de anticipo de ${booking.client.fullName}`}
                        className="ck-proof-img"
                      />
                      <Button
                        label="Abrir imagen completa"
                        variant="ghost"
                        size="sm"
                        icon={<ExternalLink size={14} aria-hidden="true" />}
                        href={booking.paymentProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </VStack>
                  ) : safeExternalProofUrl ? (
                    <VStack gap={2} padding={3} className="rb-card">
                      <Text weight="semibold" size="sm">
                        Enlace de comprobante externo
                      </Text>
                      <Text type="supporting" color="secondary">
                        Abre el enlace en una pestaña nueva para validar la transferencia antes de confirmar.
                      </Text>
                      <Button
                        label="Abrir enlace del recibo"
                        variant="secondary"
                        size="sm"
                        icon={<ExternalLink size={14} aria-hidden="true" />}
                        href={safeExternalProofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </VStack>
                  ) : (
                    <VStack gap={1} padding={3} className="rb-card">
                      <Text weight="semibold" size="sm">
                        Comprobante registrado
                      </Text>
                      <Text type="supporting" color="secondary">
                        Revisa el mensaje o referencia enviada por {booking.client.fullName}.
                      </Text>
                    </VStack>
                  )}
                </VStack>
              </LayoutContent>
            }
            footer={
              <LayoutFooter hasDivider>
                <HStack justify="end" gap={2} wrap="wrap" width="100%">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    label="Cerrar"
                    isDisabled={busyAction === 'confirm'}
                    onClick={() => setProofOpen(false)}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    label={busyAction === 'confirm' ? 'Confirmando…' : 'Confirmar cita / anticipo'}
                    icon={<Check size={15} aria-hidden="true" />}
                    isLoading={busyAction === 'confirm'}
                    isDisabled={isBusy}
                    onClick={async () => {
                      const ok = await handleConfirmBooking();
                      if (ok) {
                        setProofOpen(false);
                      }
                    }}
                  />
                </HStack>
              </LayoutFooter>
            }
          />
        </Dialog>
      ) : null}
    </>
  );
}
