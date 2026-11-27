'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { ShieldCheck, X } from 'lucide-react';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import { formatCurrency, formatDuration } from '@/lib/format';
import { formatServicePrice } from '../booking/bookingHelpers';
import { landingPhoto, servicePhoto } from './landingContent';

interface LandingServiceDialogProps {
  service: PublicServiceDTO;
  categoryName: string | null;
  currency: PublicSettingsDTO['currency'];
  depositLabel: string | null;
  onClose: () => void;
}

export function LandingServiceDialog({
  service,
  categoryName,
  currency,
  depositLabel,
  onClose,
}: LandingServiceDialogProps) {
  const photoSrc = servicePhoto(service.slug, service.imageUrl);
  const priceLabel = formatServicePrice(service.priceCents, service.isStartingPrice, currency);
  const depositText = !service.depositRequired
    ? 'No requiere anticipo'
    : service.depositAmountCents
      ? `Apartas con ${formatCurrency(service.depositAmountCents, currency)}`
      : depositLabel
        ? `Apartas con ${depositLabel}`
        : 'Se confirma al agendar';

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      aria-labelledby="lk-service-dialog-title"
      width="min(34rem, 94vw)"
      maxHeight="90dvh"
      padding={0}
    >
      <VStack gap={0} height="100%" className="lk-portal">
        <HStack justify="between" align="start" gap={3} padding={5} paddingBlockEnd={3}>
          <VStack gap={0.5} className="lk-service-dialog-head">
            {categoryName ? (
              <Text type="supporting" color="accent" weight="semibold">
                {categoryName}
              </Text>
            ) : null}
            <Heading level={2} id="lk-service-dialog-title" className="lk-serif lk-service-dialog-title">
              {service.name}
            </Heading>
          </VStack>
          <Button
            label="Cerrar"
            variant="ghost"
            size="md"
            className="lk-icon-touch fx-press"
            isIconOnly
            icon={<X size={18} aria-hidden="true" />}
            onClick={onClose}
          />
        </HStack>

        <VStack gap={4} padding={5} isScrollable className="lk-service-dialog-body">
          <VStack className="lk-service-dialog-media">
            <img
              {...landingPhoto(photoSrc)}
              alt={`Ejemplo de ${service.name} en LAIKONA NAILS Puebla`}
              width={640}
              height={480}
              loading="eager"
              decoding="async"
              className="lk-service-dialog-img"
            />
          </VStack>

          <Text textWrap="pretty" className="lk-service-dialog-desc">
            {service.description}
          </Text>

          <VStack gap={2} padding={4} className="lk-card">
            <HStack justify="between" align="center" gap={3} wrap="wrap">
              <Text color="secondary">Precio</Text>
              <Text weight="bold" color="accent" hasTabularNumbers>
                {priceLabel}
              </Text>
            </HStack>
            {service.isStartingPrice ? (
              <Text type="supporting" color="secondary" textWrap="pretty">
                Precio base · puede variar según el largo o el diseño que elijas.
              </Text>
            ) : null}
            <HStack justify="between" align="center" gap={3} wrap="wrap">
              <HStack gap={1.5} align="center">
                <BrandIcon name="duracion" size={1.125} className="lk-service-meta-icon" />
                <Text color="secondary">Duración aproximada</Text>
              </HStack>
              <Text weight="medium" hasTabularNumbers>
                {formatDuration(service.durationMinutes)}
              </Text>
            </HStack>
            <HStack justify="between" align="center" gap={3} wrap="wrap">
              <HStack gap={1.5} align="center">
                <ShieldCheck size={15} aria-hidden="true" className="lk-service-meta-icon" />
                <Text color="secondary">Anticipo</Text>
              </HStack>
              <Text weight="medium" hasTabularNumbers>
                {depositText}
              </Text>
            </HStack>
            {service.allowInspoPhoto ? (
              <HStack gap={1.5} align="center">
                <BrandIcon name="foto-inspiracion" size={1.125} className="lk-service-meta-icon" />
                <Text type="supporting" color="secondary" textWrap="pretty">
                  Puedes subir tu foto de inspiración al reservar.
                </Text>
              </HStack>
            ) : null}
          </VStack>
        </VStack>

        <VStack padding={5}>
          <Button
            label={`Reservar ${service.name}`}
            variant="primary"
            size="lg"
            width="100%"
            className="fx-press"
            href={`/reservar/${service.slug}`}
          />
        </VStack>
      </VStack>
    </Dialog>
  );
}
