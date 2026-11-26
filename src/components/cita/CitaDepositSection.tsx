'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileCheck2,
} from 'lucide-react';
import { CopyableField } from '@/components/ui/CopyableField';
import { BookingStatusTag } from '@/components/ui/StatusTag';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import {
  hasConfiguredDeposit,
  normalizeInstagramHandle,
  resolveInstagramUrl,
} from '../booking/bookingHelpers';
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
  timezone: string;
  isUploading: boolean;
  justUploadedMessage?: string | null;
  onUploadProof: (dataUrl: string) => Promise<boolean>;
}

function buildBookingDmSummary(
  booking: PublicManageBooking,
  settings: PublicSettingsDTO,
  timezone: string,
): string {
  const handle = normalizeInstagramHandle(settings.instagramHandle);
  const serviceNames = [
    booking.service.name,
    ...(booking.extraServices ?? []).map((srv) => srv.name),
  ];
  const addonNames = booking.addons.map((a) => a.name);
  const depositCents =
    booking.depositAmountCents > 0
      ? booking.depositAmountCents
      : settings.depositAmountCents ?? 20000;
  return [
    `Hola ${handle}, envío mi comprobante de anticipo (${formatCurrency(depositCents, settings.currency)}) para confirmar mi cita ${booking.bookingCode} en ${settings.name}:`,
    `- Servicios: ${serviceNames.join(' + ')}`,
    ...(addonNames.length > 0 ? [`- Extras: ${addonNames.join(', ')}`] : []),
    `- Fecha y hora: ${formatDateLongInTimezone(booking.startAt, timezone)} · ${formatTimeInTimezone(booking.startAt, timezone)} (${formatDuration(booking.totalDurationMinutes)})`,
    `- Especialista: ${booking.staff.name}`,
    `- Clienta: ${booking.client.fullName}`,
    ...(booking.clientInstagram
      ? [`- Instagram: ${normalizeInstagramHandle(booking.clientInstagram, '')}`]
      : []),
  ].join('\n');
}

export function CitaDepositSection({
  booking,
  settings,
  timezone,
  isUploading,
  justUploadedMessage = null,
  onUploadProof,
}: CitaDepositSectionProps) {
  const [deliveryMethod, setDeliveryMethod] = useState<'web_upload' | 'instagram_dm'>(
    booking.proofDeliveryMethod === 'instagram_dm' ? 'instagram_dm' : 'web_upload',
  );

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
        icon={<Clock size={18} aria-hidden="true" className="lk-cereza-text" />}
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
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const hasExistingProof = Boolean(booking.paymentProofUrl?.trim());
  const authorizedProofUrl = appendManageTokenToMediaUrl(booking.paymentProofUrl, booking.manageToken);
  const canPreviewProof = isDisplayableMediaUrl(authorizedProofUrl);
  const cleanClabe = settings.depositClabe.replace(/\s+/g, '');
  const dmSummaryText = buildBookingDmSummary(booking, settings, timezone);

  if (hasExistingProof) {
    return (
      <SurfaceCard
        id="ck-deposit-title"
        tone="accent"
        padded
        headingLevel={2}
        title="Comprobante recibido · En revisión por el estudio"
        icon={<CheckCircle2 size={20} aria-hidden="true" className="lk-cereza-text fx-pop" />}
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
          ) : (
            <HStack gap={3} align="center" padding={3} className="rb-card">
              <FileCheck2 size={20} aria-hidden="true" className="lk-cereza-text" />
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
      icon={<Clock size={18} aria-hidden="true" className="lk-cereza-text" />}
      badge={<BookingStatusTag status={booking.status} size="sm" />}
      className="ck-panel rb-deposit fx-fade-up"
    >
      <VStack gap={3}>
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
              icon={<CreditCard size={16} aria-hidden="true" />}
              href={safeCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </VStack>
        ) : null}

        {showSpei && cleanClabe ? (
          <>
            <Text type="supporting" textWrap="pretty">
              SPEI a {settings.depositBankName} · {beneficiary}
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

            <RadioList
              label="¿Cómo nos mandas tu comprobante?"
              value={deliveryMethod}
              onChange={(val) =>
                setDeliveryMethod(val === 'instagram_dm' ? 'instagram_dm' : 'web_upload')
              }
            >
              <RadioListItem
                value="web_upload"
                label="Subir comprobante aquí"
                description="Adjunta tu captura PNG, JPG o WEBP directo a tu cita."
              />
              <RadioListItem
                value="instagram_dm"
                label={`Enviar por DM a ${instagramHandle}`}
                description="Copia el mensaje prellenado con tu código y mándalo por Instagram."
              />
            </RadioList>

            {deliveryMethod === 'web_upload' ? (
              <CitaDepositProofUpload
                submitLabel="Subir comprobante"
                isUploading={isUploading}
                onUploadProof={onUploadProof}
              />
            ) : (
              <SurfaceCard tone="default" padded className="rb-card fx-fade-up">
                <VStack gap={3}>
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    Copia el mensaje con tu código {booking.bookingCode} y envía la captura de tu transferencia a {instagramHandle}.
                  </Text>
                  <CopyableField
                    label="Mensaje listo para pegar en DM"
                    value={dmSummaryText}
                    copyLabel="Copiar mensaje para DM"
                    copiedLabel="Mensaje copiado ✓"
                    feedbackMessage="Copiado al portapapeles ✓"
                    layout="stacked"
                    endExtra={
                      <Button
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        icon={<ExternalLink size={15} aria-hidden="true" />}
                        label={`Abrir ${instagramHandle}`}
                        href={instagramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                  />
                </VStack>
              </SurfaceCard>
            )}
          </>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
