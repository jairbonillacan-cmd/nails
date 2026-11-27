'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check, ExternalLink } from 'lucide-react';
import { CopyableField } from '@/components/ui/CopyableField';
import { BookingStatusTag } from '@/components/ui/StatusTag';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { formatCurrency } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { hasConfiguredDeposit } from '../booking/bookingHelpers';
import { CitaDepositProofUpload } from './CitaDepositProofUpload';
import {
  appendManageTokenToMediaUrl,
  isDisplayableMediaUrl,
  resolveSafeHttpUrl,
  type PublicManageBooking,
} from './types';

interface CitaDepositSectionProps {
  booking: PublicManageBooking;
  settings: PublicSettingsDTO;
  isUploading: boolean;
  justUploadedMessage?: string | null;
  onUploadProof: (dataUrl: string) => Promise<boolean>;
}

export function CitaDepositSection({
  booking,
  settings,
  isUploading,
  justUploadedMessage = null,
  onUploadProof,
}: CitaDepositSectionProps) {
  const isPendingDeposit =
    booking.status === 'pending_confirmation' || booking.status === 'pending_payment';
  if (!isPendingDeposit) return null;

  const safeCheckoutUrl = resolveSafeHttpUrl(booking.checkoutUrl);
  const showSpei = hasConfiguredDeposit(settings, booking.depositAmountCents);

  if (!showSpei && !safeCheckoutUrl) {
    return (
      <SurfaceCard
        id="ck-deposit-title"
        tone="accent"
        padded
        headingLevel={2}
        title="Tu solicitud está en revisión"
        subtitle="Siguiente paso · En revisión por el estudio"
        icon={<BrandIcon name="pago-despues" size={1.375} className="lk-cereza-text" />}
        badge={<BookingStatusTag status={booking.status} size="sm" />}
        className="ck-panel rb-deposit fx-fade-up"
      >
        <Text type="supporting" textWrap="pretty">
          Ya recibimos tu cita en {settings.name}. En breve confirmaremos tu horario y te avisaremos por WhatsApp.
        </Text>
      </SurfaceCard>
    );
  }

  const effectiveDepositCents =
    booking.depositAmountCents > 0
      ? booking.depositAmountCents
      : settings.depositAmountCents ?? 20000;
  const displayAmount = formatCurrency(effectiveDepositCents, settings.currency);
  const beneficiary = settings.depositBeneficiary || settings.depositAccountHolder;
  const hasExistingProof = Boolean(booking.paymentProofUrl?.trim());
  const isExternalProofLink =
    booking.proofDeliveryMethod === 'web_link' ||
    Boolean(booking.paymentProofUrl?.startsWith('https://'));
  const authorizedProofUrl = appendManageTokenToMediaUrl(booking.paymentProofUrl, booking.manageToken);
  const canPreviewProof = !isExternalProofLink && isDisplayableMediaUrl(authorizedProofUrl);
  const safeExternalProofUrl = isExternalProofLink
    ? resolveSafeHttpUrl(booking.paymentProofUrl)
    : null;
  const cleanClabe = settings.depositClabe.replace(/\s+/g, '');

  if (hasExistingProof) {
    return (
      <SurfaceCard
        id="ck-deposit-title"
        tone="accent"
        padded
        headingLevel={2}
        title="Comprobante recibido · En revisión por el estudio"
        icon={<BrandIcon name="cita-confirmada" size={1.625} className="lk-cereza-text fx-pop" />}
        badge={<BookingStatusTag status={booking.status} hasPaymentProof size="sm" />}
        className="ck-panel rb-deposit fx-fade-up"
      >
        <VStack gap={3}>
          {justUploadedMessage ? (
            <HStack className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={13} aria-hidden="true" />
              <Text type="supporting" color="inherit" weight="semibold">
                {justUploadedMessage}
              </Text>
            </HStack>
          ) : null}
          <Text type="supporting" textWrap="pretty">
            Ya recibimos tu comprobante de anticipo de {displayAmount}. El equipo lo valida y te confirmamos por WhatsApp en cuanto quede aprobado.
          </Text>
          {canPreviewProof && authorizedProofUrl ? (
            <VStack className="fx-upload-thumb" data-size="lg">
              <img
                src={authorizedProofUrl}
                alt="Comprobante de anticipo adjunto"
                loading="lazy"
                decoding="async"
              />
            </VStack>
          ) : safeExternalProofUrl ? (
            <HStack gap={3} align="center" justify="between" padding={3} className="rb-card" wrap="wrap">
              <VStack gap={0.5} className="rb-grow" style={{ minWidth: 0 }}>
                <Text weight="semibold">Enlace de comprobante registrado</Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Anticipo {displayAmount} · Código {booking.bookingCode}
                </Text>
              </VStack>
              <Button
                label="Abrir enlace"
                variant="secondary"
                size="sm"
                icon={<ExternalLink size={14} aria-hidden="true" />}
                href={safeExternalProofUrl}
                target="_blank"
                rel="noopener noreferrer"
              />
            </HStack>
          ) : (
            <HStack gap={3} align="center" padding={3} className="rb-card">
              <BrandIcon name="comprobante" size={1.625} className="lk-cereza-text" />
              <VStack gap={0.5} className="rb-grow" style={{ minWidth: 0 }}>
                <Text weight="semibold">Comprobante adjunto registrado</Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Anticipo {displayAmount} · Código {booking.bookingCode}
                </Text>
              </VStack>
            </HStack>
          )}
          <Collapsible
            key={booking.paymentProofUrl ?? 'existing-proof'}
            className="rb-fold"
            defaultIsOpen={false}
            trigger={
              <HStack justify="between" align="center" gap={2} width="100%" style={{ minHeight: '2.75rem' }}>
                <Text weight="semibold">Reemplazar comprobante</Text>
              </HStack>
            }
          >
            <VStack gap={3} className="rb-fold-body">
              <CitaDepositProofUpload
                submitLabel="Reemplazar comprobante"
                isUploading={isUploading}
                onUploadProof={onUploadProof}
              />
            </VStack>
          </Collapsible>
        </VStack>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard
      id="ck-deposit-title"
      tone="accent"
      padded
      headingLevel={2}
      title={`Anticipo de ${displayAmount}`}
      subtitle="Siguiente paso · Confirma tu horario · Se descuenta de tu total"
      icon={<BrandIcon name="pago-despues" size={1.375} className="lk-cereza-text" />}
      badge={<BookingStatusTag status={booking.status} size="sm" />}
      className="ck-panel rb-deposit fx-fade-up"
    >
      <VStack gap={3}>
        {booking.proofRejectedAt ? (
          <Banner
            status="warning"
            title="Necesitamos un nuevo comprobante"
            description={
              booking.proofRejectionReason ||
              'No pudimos validar el comprobante anterior. Sube una nueva captura o pega el enlace de tu recibo.'
            }
          />
        ) : null}

        {safeCheckoutUrl ? (
          <VStack gap={2}>
            <Text type="supporting" textWrap="pretty">
              Completa tu anticipo en línea para confirmar tu horario al instante.
            </Text>
            <Button
              label="Pagar anticipo con Mercado Pago"
              variant="primary"
              size="lg"
              width="100%"
              className="fx-press"
              icon={<BrandIcon name="transferencia-spei" size={1.25} />}
              href={safeCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </VStack>
        ) : null}

        {showSpei && cleanClabe ? (
          <>
            <Text type="supporting" textWrap="pretty">
              Transferencia a {settings.depositBankName} · {beneficiary}
            </Text>

            <CopyableField
              label="CLABE"
              value={settings.depositClabe}
              copyValue={cleanClabe}
              copyLabel="Copiar CLABE"
              copiedLabel="CLABE copiada ✓"
              feedbackMessage="CLABE copiada al portapapeles"
              monospace
            />

            <Text type="supporting" color="secondary" textWrap="pretty">
              Cuando hagas la transferencia, sube aquí la captura. El equipo la revisa y te
              confirma por WhatsApp; no hace falta escribirnos.
            </Text>

            <CitaDepositProofUpload
              submitLabel="Subir comprobante"
              isUploading={isUploading}
              onUploadProof={onUploadProof}
            />
          </>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
