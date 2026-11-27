'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { CalendarPlus, CalendarX2, Download } from 'lucide-react';
import { BookingStatusTag } from '@/components/ui/StatusTag';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import {
  formatTouchUpActionLabel,
  formatTouchUpSubtitle,
  resolveShowBookingQr,
  resolveTouchUpDays,
} from '@/lib/cita/cita-settings';
import { formatCurrency } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { CitaLocationCard } from './CitaLocationCard';
import { CitaModifyCard } from './CitaModifyCard';
import { CitaQrCard } from './CitaQrCard';
import type { CalendarAddLinks, PublicManageBooking } from './types';

interface CitaActionsPanelProps {
  booking: PublicManageBooking;
  settings: PublicSettingsDTO;
  calendarLinks: CalendarAddLinks;
  whatsappUrl: string;
  policyHelpWhatsappUrl: string;
  manageUrl: string;
  touchUpUrl: string;
  canModify: boolean;
  rescheduleWindowAllowed: boolean;
  cancelWindowAllowed: boolean;
  loyaltySlot?: React.ReactNode;
  onOpenReschedule: () => void;
  onOpenCancel: () => void;
}

export function CitaActionsPanel({
  booking,
  settings,
  calendarLinks,
  whatsappUrl,
  policyHelpWhatsappUrl,
  manageUrl,
  touchUpUrl,
  canModify,
  rescheduleWindowAllowed,
  cancelWindowAllowed,
  loyaltySlot = null,
  onOpenReschedule,
  onOpenCancel,
}: CitaActionsPanelProps) {
  const hasPaymentProof = Boolean(booking.paymentProofUrl?.trim());
  const isConfirmed = booking.status === 'confirmed';
  const isCanceled = booking.status === 'canceled';
  const isCompleted = booking.status === 'completed';
  const isNoShow = booking.status === 'no_show';
  const isActive = !isCanceled && !isCompleted && !isNoShow;
  const sameServiceBookingUrl = `/reservar/${encodeURIComponent(booking.service.slug)}?staff=${encodeURIComponent(booking.staff.bookingSlug)}`;
  const showBookingQr = resolveShowBookingQr(settings.landingContent);
  const touchUpDays = resolveTouchUpDays(settings.landingContent);
  const touchUpLabel = formatTouchUpActionLabel(touchUpDays);

  const locationCard = (
    <CitaLocationCard booking={booking} settings={settings} whatsappUrl={whatsappUrl} />
  );
  const qrCard = showBookingQr ? (
    <CitaQrCard bookingCode={booking.bookingCode} salonName={settings.name} manageUrl={manageUrl} />
  ) : null;

  if (isCanceled) {
    return (
      <VStack gap={4}>
        <SurfaceCard
          id="ck-canceled-title"
          headingLevel={2}
          title="Esta cita fue cancelada"
          subtitle="Liberamos tu lugar. Cuando quieras volver, eliges otro horario desde aquí."
          icon={<CalendarX2 size={20} aria-hidden="true" className="lk-cereza-text" />}
          badge={<BookingStatusTag status={booking.status} size="sm" />}
          padded
          className="ck-panel fx-fade-up"
        >
          <VStack gap={3}>
            {booking.cancellationReason?.trim() ? (
              <VStack gap={0.5} padding={3} className="rb-card">
                <Text type="supporting" color="secondary">
                  Motivo registrado
                </Text>
                <Text weight="semibold" textWrap="pretty" style={{ overflowWrap: 'anywhere' }}>
                  {booking.cancellationReason}
                </Text>
              </VStack>
            ) : null}

            {booking.couponCode || booking.discountCents > 0 ? (
              <Banner
                status="success"
                title={
                  booking.couponCode
                    ? `Cupón o Gift Card ${booking.couponCode} liberado`
                    : 'Beneficio de descuento liberado'
                }
                description={
                  booking.couponCode
                    ? `El uso o saldo de ${booking.couponCode} (${formatCurrency(booking.discountCents, settings.currency)}) quedó disponible nuevamente para tu próxima cita.`
                    : 'El descuento aplicado a esta cita quedó liberado para tu próxima reserva.'
                }
              />
            ) : null}

            {booking.depositAmountCents > 0 && hasPaymentProof ? (
              <Text type="supporting" color="secondary" textWrap="pretty">
                Si ya habías enviado un comprobante de anticipo, escríbenos por WhatsApp con tu código {booking.bookingCode} para ayudarte.
              </Text>
            ) : null}

            <HStack gap={2} wrap="wrap">
              <Button
                label="Agendar nueva cita"
                variant="primary"
                size="lg"
                className="fx-press"
                icon={<BrandIcon name="servicio" size={1.25} />}
                href="/reservar"
              />
              <Button
                label={`Repetir ${booking.service.name}`}
                variant="secondary"
                size="lg"
                className="fx-press"
                icon={<CalendarPlus size={16} aria-hidden="true" />}
                href={sameServiceBookingUrl}
              />
              <Button
                label="Ver mis citas"
                variant="ghost"
                size="lg"
                className="fx-press"
                icon={<BrandIcon name="calendario" size={1.25} />}
                href="/mis-citas"
              />
            </HStack>
          </VStack>
        </SurfaceCard>
        {loyaltySlot}
        {locationCard}
      </VStack>
    );
  }

  if (isNoShow) {
    return (
      <VStack gap={4}>
        <SurfaceCard
          id="ck-noshow-title"
          headingLevel={2}
          title="¿Quieres agendar una nueva visita?"
          subtitle="Esta cita quedó registrada como inasistencia. Cuando estés lista puedes reservar un nuevo bloque en línea o escribirnos por WhatsApp."
          badge={<BookingStatusTag status={booking.status} size="sm" />}
          padded
          className="ck-panel fx-fade-up"
        >
          <HStack gap={2} wrap="wrap">
            <Button
              label="Agendar nueva cita"
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<BrandIcon name="servicio" size={1.25} />}
              href="/reservar"
            />
            <Button
              label="WhatsApp del salón"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<BrandIcon name="whatsapp" size={1.25} />}
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </SurfaceCard>
        {loyaltySlot}
        {locationCard}
      </VStack>
    );
  }

  if (isCompleted) {
    return (
      <VStack gap={4}>
        <SurfaceCard
          id="ck-rebook-title"
          headingLevel={2}
          title="¿Lista para tu próximo retoque?"
          subtitle={formatTouchUpSubtitle(booking.service.name, booking.staff.name, touchUpDays)}
          badge={<BookingStatusTag status={booking.status} size="sm" />}
          padded
          className="ck-panel fx-fade-up"
        >
          <HStack gap={2} wrap="wrap">
            <Button
              label={touchUpLabel}
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<BrandIcon name="servicio" size={1.25} />}
              href={touchUpUrl}
            />
            <Button
              label="Ver mis citas"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<BrandIcon name="calendario" size={1.25} />}
              href="/mis-citas"
            />
          </HStack>
        </SurfaceCard>
        {locationCard}
        {qrCard}
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      {isActive ? (
        <SurfaceCard
          id="ck-calendar-title"
          headingLevel={2}
          title={isConfirmed ? 'Todo listo para tu cita' : 'Guarda tu cita'}
          subtitle={
            isConfirmed
              ? `Te esperamos con ${booking.staff.name}. Agrégala a tu calendario o ten los detalles a la mano en WhatsApp.`
              : 'Agrégala a tu calendario desde ahora o ten los detalles a la mano en WhatsApp.'
          }
          icon={isConfirmed ? <BrandIcon name="cita-confirmada" size={1.625} className="lk-cereza-text fx-pop" /> : undefined}
          padded
          className="ck-panel fx-fade-up"
        >
          <HStack gap={2} wrap="wrap">
            <Button
              label="Google Calendar"
              variant="secondary"
              size="md"
              className="fx-press"
              icon={<CalendarPlus size={16} aria-hidden="true" />}
              href={calendarLinks.google}
              target="_blank"
              rel="noopener noreferrer"
            />
            <Button
              label="Apple / iPhone (.ics)"
              variant="secondary"
              size="md"
              className="fx-press"
              icon={<Download size={16} aria-hidden="true" />}
              href={calendarLinks.icsDownload}
            />
            <Button
              label="Outlook"
              variant="secondary"
              size="md"
              className="fx-press"
              icon={<CalendarPlus size={16} aria-hidden="true" />}
              href={calendarLinks.outlook}
              target="_blank"
              rel="noopener noreferrer"
            />
            <Button
              label="Enviar por WhatsApp"
              variant="primary"
              size="md"
              className="fx-press"
              icon={<BrandIcon name="whatsapp" size={1.25} />}
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </SurfaceCard>
      ) : null}

      {locationCard}
      {qrCard}
      {loyaltySlot}

      {canModify ? (
        <CitaModifyCard
          bookingCode={booking.bookingCode}
          cancellationPolicyText={settings.cancellationPolicyText}
          minCancelHours={settings.minCancelHours}
          minRescheduleHours={settings.minRescheduleHours}
          rescheduleWindowAllowed={rescheduleWindowAllowed}
          cancelWindowAllowed={cancelWindowAllowed}
          policyHelpWhatsappUrl={policyHelpWhatsappUrl}
          touchUpUrl={touchUpUrl}
          touchUpDays={touchUpDays}
          onOpenReschedule={onOpenReschedule}
          onOpenCancel={onOpenCancel}
        />
      ) : null}
    </VStack>
  );
}
