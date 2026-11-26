'use client';

import { useMemo, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  MapPin,
  MessageCircle,
  QrCode,
  RefreshCw,
  XCircle,
} from 'lucide-react';
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
  manageUrl: string;
  canModify: boolean;
  onOpenReschedule: () => void;
  onOpenCancel: () => void;
}

export function CitaActionsPanel({
  booking,
  settings,
  calendarLinks,
  whatsappUrl,
  manageUrl,
  canModify,
  onOpenReschedule,
  onOpenCancel,
}: CitaActionsPanelProps) {
  const linkFeedback = useEphemeralMessage(2400);
  const lastFeedbackRef = useRef('');
  const [feedbackKind, setFeedbackKind] = useState<'copied' | 'downloaded' | 'error' | null>(null);

  const mapsUrl = resolveSafeHttpUrl(settings.mapsUrl);
  const showInspo = isDisplayableMediaUrl(booking.inspoPhotoUrl);

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
      announce('Enlace de tu cita copiado');
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
    announce('Código QR descargado');
  };

  const isCopiedActive = Boolean(linkFeedback.message && feedbackKind === 'copied');
  const isDownloadedActive = Boolean(linkFeedback.message && feedbackKind === 'downloaded');

  return (
    <VStack gap={4}>
      {booking.status !== 'canceled' && booking.status !== 'completed' ? (
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-calendar-title">
          <VStack gap={0.5}>
            <Heading level={2} id="ck-calendar-title" className="lk-serif rb-h2">
              Guarda tu cita
            </Heading>
            <Text color="secondary" textWrap="pretty">
              Agrégala a tu calendario o ten los detalles a la mano en WhatsApp.
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

      <VStack as="section" gap={4} className="ck-panel fx-fade-up" aria-labelledby="ck-location-title">
        <VStack gap={0.5}>
          <Heading level={2} id="ck-location-title" className="lk-serif rb-h2">
            Ubicación y detalles
          </Heading>
          <Text color="secondary" textWrap="pretty">
            Llega unos minutos antes para empezar puntual tu bloque.
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
          <VStack gap={0.5} className="rb-grow">
            <Text weight="semibold" textWrap="pretty">{settings.address}</Text>
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
            <AspectRatio ratio={16 / 9} fit="cover">
              <img
                src={booking.inspoPhotoUrl}
                alt="Referencia de diseño"
                loading="lazy"
                decoding="async"
                className="ck-proof-img"
              />
            </AspectRatio>
          </VStack>
        ) : null}
      </VStack>

      {booking.status !== 'canceled' ? (
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
            <VStack gap={2} className="rb-grow">
              <HStack gap={1.5} align="center">
                <QrCode size={16} aria-hidden="true" className="lk-cereza-text" />
                <Heading level={3} id="ck-qr-title" className="lk-serif ck-h3">
                  Código QR de tu cita
                </Heading>
              </HStack>
              <Text type="supporting" color="secondary" textWrap="pretty">
                Guarda este pase para abrir tu cita rápido o muéstralo al llegar al estudio ({booking.bookingCode}).
              </Text>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label={isCopiedActive ? 'Enlace copiado' : 'Copiar enlace'}
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
                  label={isDownloadedActive ? 'QR descargado' : 'Descargar QR'}
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
              <Text
                type="supporting"
                color={feedbackKind === 'error' ? 'secondary' : 'accent'}
                role="status"
                aria-live="polite"
                className={linkFeedback.message ? 'fx-fade-up' : 'rb-sr-only'}
              >
                {linkFeedback.message ?? ''}
              </Text>
            </VStack>
          </HStack>
        </VStack>
      ) : null}

      {canModify ? (
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-manage-title">
          <VStack gap={0.5}>
            <Heading level={2} id="ck-manage-title" className="lk-serif rb-h2">
              ¿Necesitas hacer un cambio?
            </Heading>
            <Text type="supporting" color="secondary" textWrap="pretty">
              {settings.cancellationPolicyText ||
                `Puedes reagendar o cancelar hasta ${settings.minCancelHours} h antes de tu cita.`}
            </Text>
          </VStack>
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
              type="button"
              label="Cancelar cita"
              variant="ghost"
              size="md"
              className="fx-press"
              icon={<XCircle size={15} aria-hidden="true" />}
              onClick={onOpenCancel}
            />
          </HStack>
        </VStack>
      ) : booking.status === 'canceled' || booking.status === 'completed' ? (
        <VStack as="section" gap={3} className="ck-panel fx-fade-up" aria-labelledby="ck-rebook-title">
          <Heading level={2} id="ck-rebook-title" className="lk-serif rb-h2">
            {booking.status === 'completed'
              ? '¿Lista para tu próximo retoque?'
              : '¿Quieres agendar otro día?'}
          </Heading>
          <Text color="secondary" textWrap="pretty">
            Puedes elegir un nuevo horario en línea en cualquier momento.
          </Text>
          <HStack>
            <Button
              label="Agendar nueva cita"
              variant="primary"
              size="lg"
              className="fx-press"
              href="/reservar"
            />
          </HStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
