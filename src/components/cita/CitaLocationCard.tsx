'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { MapPin, MessageCircle } from 'lucide-react';
import { BookingStatusTag, SurfaceCard } from '@/components/ui';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { LANDING_ASSETS } from '../landing/landingContent';
import {
  isDisplayableMediaUrl,
  resolveSafeHttpUrl,
  type PublicManageBooking,
} from './types';

interface CitaLocationCardProps {
  booking: PublicManageBooking;
  settings: PublicSettingsDTO;
  whatsappUrl: string;
}

export function CitaLocationCard({
  booking,
  settings,
  whatsappUrl,
}: CitaLocationCardProps) {
  const mapsUrl = resolveSafeHttpUrl(settings.mapsUrl);
  const showInspo = isDisplayableMediaUrl(booking.inspoPhotoUrl);
  const hasPaymentProof = Boolean(booking.paymentProofUrl?.trim());
  const locationSubtitle =
    booking.status === 'canceled'
      ? 'Resumen de la cita cancelada y datos de contacto del estudio.'
      : booking.status === 'completed'
        ? 'Resumen de tu visita y ubicación del estudio.'
        : 'Llega unos minutos antes para empezar puntual tu bloque.';

  return (
    <SurfaceCard
      id="ck-location-title"
      headingLevel={2}
      title="Ubicación y detalles"
      subtitle={locationSubtitle}
      badge={<BookingStatusTag status={booking.status} hasPaymentProof={hasPaymentProof} size="sm" />}
      padded
      className="ck-panel fx-fade-up"
    >
      <VStack gap={4}>
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
    </SurfaceCard>
  );
}
