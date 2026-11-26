'use client';

import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import {
  CalendarCheck,
  CalendarPlus,
  CalendarX2,
  Check,
  CheckCircle2,
  Copy,
  Download,
  MapPin,
  MessageCircle,
  QrCode,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { generateQrSvg } from '@/lib/qr';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { LANDING_ASSETS } from '../landing/landingContent';
import {
  isDisplayableMediaUrl,
  resolveSafeHttpUrl,
  type CalendarAddLinks,
  type PublicManageBooking,
} from './types';

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
  const linkFeedback = useEphemeralMessage(2600);
  const lastFeedbackRef = useRef('');
  const [feedbackKind, setFeedbackKind] = useState<'copied' | 'downloaded' | 'error' | null>(null);

  const mapsUrl = resolveSafeHttpUrl(settings.mapsUrl);
  const showInspo = isDisplayableMediaUrl(booking.inspoPhotoUrl);
  const hasPaymentProof = Boolean(booking.paymentProofUrl?.trim());
  const isConfirmed = booking.status === 'confirmed';
  const isCanceled = booking.status === 'canceled';
  const isCompleted = booking.status === 'completed';
  const isNoShow = booking.status === 'no_show';
  const isActive = !isCanceled && !isCompleted && !isNoShow;

  const sameServiceBookingUrl = `/reservar/${encodeURIComponent(booking.service.slug)}?staff=${encodeURIComponent(booking.staff.bookingSlug)}`;

  const qrLabel = `Código QR de tu cita ${booking.bookingCode} en ${settings.name}`;
  const qrSvgMarkup = useMemo(
    () => generateQrSvg(manageUrl, qrLabel),
    [manageUrl, qrLabel],
  );
  const qrDataUri = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup)}`,
    [qrSvgMarkup],
  );

  const announce = (raw: string) => {
    let msg = raw;
    if (msg === lastFeedbackRef.current) {
      msg += '\u00A0';
    }
    lastFeedbackRef.current = msg;
    linkFeedback.show(msg);
  };

  const handleCopyManageUrl = async () => {
    try {
      await navigator.clipboard.writeText(manageUrl);
      setFeedbackKind('copied');
      announce('Enlace copiado ✓');
    } catch {
      setFeedbackKind('error');
      announce('No se pudo copiar automáticamente; copia la dirección del navegador.');
    }
  };

  const handleDownloadQrSvg = () => {
    const blob = new Blob([qrSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `cita-${booking.bookingCode.toLowerCase()}-qr.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
    setFeedbackKind('downloaded');
    announce('QR descargado ✓');
  };

  const isCopiedActive = Boolean(linkFeedback.message && feedbackKind === 'copied');
  const isDownloadedActive = Boolean(linkFeedback.message && feedbackKind === 'downloaded');
  const isRescheduleLocked = canModify && !rescheduleWindowAllowed;
  const isCancelLocked = canModify && !cancelWindowAllowed;
  const isAnyPolicyLocked = isRescheduleLocked || isCancelLocked;
  const policyHours = Math.max(settings.minCancelHours, settings.minRescheduleHours);

  const locationSubtitle = isCanceled
    ? 'Resumen de la cita cancelada y datos de contacto del estudio.'
    : isCompleted
      ? 'Resumen de tu visita y ubicación del estudio.'
      : 'Llega unos minutos antes para empezar puntual tu bloque.';

  const renderLocationSection = () => (
    <VStack as="section" gap={4} className="ck-panel fx-fade-up" aria-labelledby="ck-location-title">
      <VStack gap={0.5}>
        <Heading level={2} id="ck-location-title" className="lk-serif rb-h2">
          Ubicación y detalles
        </Heading>
        <Text color="secondary" textWrap="pretty">
          {locationSubtitle}
        </Text>
      </VStack>

      <HStack gap={3} align="start">
        <img
          src={LANDING_ASSETS.iconPin}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          decoding="async"
          className="ck-icon"
        />
        <VStack gap={0.5} className="rb-grow" style={{ minWidth: 0 }}>
          <Text weight="semibold" textWrap="pretty">
            {settings.address}
          </Text>
          {settings.bookingInstructionsText ? (
            <Text type="supporting" color="secondary" textWrap="pretty">
              {settings.bookingInstructionsText}
            </Text>
          ) : null}
        </VStack>
      </HStack>

      <HStack gap={2} wrap="wrap">
        {mapsUrl ? (
          <Button
            label="Abrir en Google Maps"
            variant="primary"
            size="md"
            className="fx-press"
            icon={<MapPin size={16} aria-hidden="true" />}
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        ) : null}
        <Button
          label="WhatsApp del salón"
          variant="secondary"
          size="md"
          className="fx-press"
          icon={<MessageCircle size={16} aria-hidden="true" />}
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
        />
      </HStack>

      <VStack gap={2} className="ck-detail-list">
        <HStack justify="between" gap={2} wrap="wrap">
          <Text type="supporting" color="secondary">
            Clienta
          </Text>
          <Text weight="semibold" style={{ overflowWrap: 'anywhere' }}>
            {booking.client.fullName}
            {booking.clientInstagram ? ` · ${booking.clientInstagram}` : ''}
          </Text>
        </HStack>
        <HStack justify="between" gap={2} wrap="wrap">
          <Text type="supporting" color="secondary">
            WhatsApp registrado
          </Text>
          <Text hasTabularNumbers>{booking.client.phoneE164}</Text>
        </HStack>
        {booking.clientNotes.trim() ? (
          <VStack gap={0.5}>
            <Text type="supporting" color="secondary">
              Notas para tu artista
            </Text>
            <Text textWrap="pretty" style={{ overflowWrap: 'anywhere' }}>
              {booking.clientNotes}
            </Text>
          </VStack>
        ) : null}
      </VStack>

      {showInspo && booking.inspoPhotoUrl ? (
        <VStack gap={1.5} className="ck-detail-list">
          <Text type="label" weight="semibold">
            Tu foto de inspiración adjunta
          </Text>
          <VStack className="fx-upload-thumb" data-size="lg">
            <img
              src={booking.inspoPhotoUrl}
              alt="Referencia de diseño"
              loading="lazy"
              decoding="async"
            />
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );

  const renderQrSection = () => (
    <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-qr-title">
      <HStack gap={4} align="center" className="ck-qr-wrap">
        <VStack className="ck-qr-box" align="center" justify="center">
          <img
            src={qrDataUri}
            alt={qrLabel}
            width={120}
            height={120}
            loading="lazy"
            decoding="async"
            className="ck-qr-img"
          />
        </VStack>
        <VStack gap={2} className="rb-grow" style={{ minWidth: 0 }}>
          <HStack gap={1.5} align="center">
            <QrCode size={16} aria-hidden="true" className="lk-cereza-text" />
            <Heading level={3} id="ck-qr-title" className="lk-serif ck-h3">
              Código QR de tu cita
            </Heading>
          </HStack>
          <Text type="supporting" color="secondary" textWrap="pretty">
            Guarda este pase para abrir tu cita rápido o muéstralo al llegar al estudio ({booking.bookingCode}).
          </Text>
          <HStack gap={2} wrap="wrap" align="center">
            <Button
              type="button"
              label={isCopiedActive ? 'Enlace copiado ✓' : 'Copiar enlace'}
              variant="secondary"
              size="md"
              className="fx-press"
              icon={
                isCopiedActive ? (
                  <Check size={15} aria-hidden="true" className="fx-pop" />
                ) : (
                  <Copy size={15} aria-hidden="true" />
                )
              }
              onClick={() => void handleCopyManageUrl()}
            />
            <Button
              type="button"
              label={isDownloadedActive ? 'QR descargado ✓' : 'Descargar QR'}
              variant="ghost"
              size="md"
              className="fx-press"
              icon={
                isDownloadedActive ? (
                  <Check size={15} aria-hidden="true" className="fx-pop" />
                ) : (
                  <Download size={15} aria-hidden="true" />
                )
              }
              onClick={handleDownloadQrSvg}
            />
          </HStack>
          {linkFeedback.message ? (
            <HStack
              className="fx-save-pill"
              data-state={feedbackKind === 'error' ? 'error' : 'saved'}
              role="status"
              aria-live="polite"
            >
              <Text type="supporting" color="inherit" weight="semibold">
                {linkFeedback.message}
              </Text>
            </HStack>
          ) : (
            <Text role="status" aria-live="polite" className="rb-sr-only">
              {''}
            </Text>
          )}
        </VStack>
      </HStack>
    </VStack>
  );

  if (isCanceled) {
    return (
      <VStack gap={4}>
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-canceled-title">
          <HStack gap={2} align="center">
            <CalendarX2 size={20} aria-hidden="true" className="lk-cereza-text" />
            <Heading level={2} id="ck-canceled-title" className="lk-serif rb-h2">
              Esta cita fue cancelada
            </Heading>
          </HStack>
          <Text color="secondary" textWrap="pretty">
            Tu espacio quedó liberado al instante. Cuando quieras volver, puedes elegir un nuevo horario en segundos.
          </Text>

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
              icon={<Sparkles size={16} aria-hidden="true" />}
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
              icon={<CalendarCheck size={16} aria-hidden="true" />}
              href="/mis-citas"
            />
          </HStack>
        </VStack>

        {loyaltySlot}
        {renderLocationSection()}
      </VStack>
    );
  }

  if (isNoShow) {
    return (
      <VStack gap={4}>
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-noshow-title">
          <Heading level={2} id="ck-noshow-title" className="lk-serif rb-h2">
            ¿Quieres agendar una nueva visita?
          </Heading>
          <Text color="secondary" textWrap="pretty">
            Esta cita quedó registrada como inasistencia. Cuando estés lista puedes reservar un nuevo bloque en línea o escribirnos por WhatsApp.
          </Text>
          <HStack gap={2} wrap="wrap">
            <Button
              label="Agendar nueva cita"
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<Sparkles size={16} aria-hidden="true" />}
              href="/reservar"
            />
            <Button
              label="WhatsApp del salón"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<MessageCircle size={16} aria-hidden="true" />}
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </VStack>

        {loyaltySlot}
        {renderLocationSection()}
      </VStack>
    );
  }

  if (isCompleted) {
    return (
      <VStack gap={4}>
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-rebook-title">
          <Heading level={2} id="ck-rebook-title" className="lk-serif rb-h2">
            ¿Lista para tu próximo retoque?
          </Heading>
          <Text color="secondary" textWrap="pretty">
            Dejamos prellenado {booking.service.name} con {booking.staff.name} en 21 días para que apartes en un toque.
          </Text>
          <HStack gap={2} wrap="wrap">
            <Button
              label="Agendar siguiente retoque (+21 días)"
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<Sparkles size={16} aria-hidden="true" />}
              href={touchUpUrl}
            />
            <Button
              label="Ver mis citas"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<CalendarCheck size={16} aria-hidden="true" />}
              href="/mis-citas"
            />
          </HStack>
        </VStack>

        {renderLocationSection()}
        {renderQrSection()}
      </VStack>
    );
  }

  return (
    <VStack gap={4}>
      {isActive ? (
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-calendar-title">
          <VStack gap={0.5}>
            <HStack gap={2} align="center">
              {isConfirmed ? (
                <CheckCircle2 size={20} aria-hidden="true" className="lk-cereza-text fx-pop" />
              ) : null}
              <Heading level={2} id="ck-calendar-title" className="lk-serif rb-h2">
                {isConfirmed ? 'Todo listo para tu cita' : 'Guarda tu cita'}
              </Heading>
            </HStack>
            <Text color="secondary" textWrap="pretty">
              {isConfirmed
                ? `Te esperamos con ${booking.staff.name}. Agrégala a tu calendario o ten los detalles a la mano en WhatsApp.`
                : 'Agrégala a tu calendario desde ahora o ten los detalles a la mano en WhatsApp.'}
            </Text>
          </VStack>

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
              icon={<MessageCircle size={16} aria-hidden="true" />}
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </VStack>
      ) : null}

      {renderLocationSection()}
      {renderQrSection()}
      {loyaltySlot}

      {canModify ? (
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-manage-title">
          <VStack gap={0.5}>
            <Heading level={2} id="ck-manage-title" className="lk-serif rb-h2">
              ¿Necesitas hacer un cambio?
            </Heading>
            <Text type="supporting" color="secondary" textWrap="pretty">
              {settings.cancellationPolicyText ||
                `Puedes reagendar o cancelar en línea hasta ${policyHours} h antes de tu cita.`}
            </Text>
          </VStack>

          {isAnyPolicyLocked ? (
            <VStack gap={3}>
              <Banner
                status="warning"
                title={`Faltan menos de ${policyHours} h; escríbenos por WhatsApp para ayudarte`}
                description={
                  isRescheduleLocked && isCancelLocked
                    ? `Los cambios y cancelaciones en línea cierran ${policyHours} h antes de tu horario. Escríbenos directo y con gusto revisamos tu cita ${booking.bookingCode}.`
                    : isCancelLocked
                      ? `La cancelación en línea cierra ${settings.minCancelHours} h antes de tu cita. Escríbenos por WhatsApp si necesitas ayuda.`
                      : `La reprogramación en línea cierra ${settings.minRescheduleHours} h antes de tu cita. Escríbenos por WhatsApp si necesitas ayuda.`
                }
              />
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Escribir por WhatsApp"
                  variant="primary"
                  size="md"
                  className="fx-press"
                  icon={<MessageCircle size={15} aria-hidden="true" />}
                  href={policyHelpWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
                {!isRescheduleLocked ? (
                  <Button
                    type="button"
                    label="Reagendar"
                    variant="secondary"
                    size="md"
                    className="fx-press"
                    icon={<RefreshCw size={15} aria-hidden="true" />}
                    onClick={onOpenReschedule}
                  />
                ) : null}
                {!isCancelLocked ? (
                  <Button
                    type="button"
                    label="Cancelar cita"
                    variant="ghost"
                    size="md"
                    className="fx-press"
                    icon={<XCircle size={15} aria-hidden="true" />}
                    onClick={onOpenCancel}
                  />
                ) : null}
                <Button
                  label="Agendar siguiente retoque (+21 días)"
                  variant="secondary"
                  size="md"
                  className="fx-press"
                  icon={<Sparkles size={15} aria-hidden="true" />}
                  href={touchUpUrl}
                />
                <Button
                  label="Ver mis citas"
                  variant="ghost"
                  size="md"
                  className="fx-press"
                  icon={<CalendarCheck size={15} aria-hidden="true" />}
                  href="/mis-citas"
                />
              </HStack>
            </VStack>
          ) : (
            <HStack gap={2} wrap="wrap">
              <Button
                type="button"
                label="Reagendar"
                variant="secondary"
                size="md"
                className="fx-press"
                icon={<RefreshCw size={15} aria-hidden="true" />}
                onClick={onOpenReschedule}
              />
              <Button
                label="Agendar siguiente retoque (+21 días)"
                variant="secondary"
                size="md"
                className="fx-press"
                icon={<Sparkles size={15} aria-hidden="true" />}
                href={touchUpUrl}
              />
              <Button
                label="Ver mis citas"
                variant="ghost"
                size="md"
                className="fx-press"
                icon={<CalendarCheck size={15} aria-hidden="true" />}
                href="/mis-citas"
              />
              <Button
                type="button"
                label="Cancelar cita"
                variant="ghost"
                size="md"
                className="fx-press"
                icon={<XCircle size={15} aria-hidden="true" />}
                onClick={onOpenCancel}
              />
            </HStack>
          )}
        </VStack>
      ) : null}
    </VStack>
  );
}
