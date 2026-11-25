'use client';

import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { FileInput } from '@astryxdesign/core/FileInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { Check, CheckCircle2, Copy, CreditCard, ExternalLink, Upload } from 'lucide-react';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import {
  hasConfiguredDeposit,
  normalizeInstagramHandle,
  readFileAsDataUrl,
  resolveInstagramUrl,
} from '../booking/bookingHelpers';
import {
  isDisplayableMediaUrl,
  resolveSafeHttpUrl,
  type PublicManageBooking,
} from './types';

interface CitaDepositSectionProps {
  booking: PublicManageBooking;
  settings: PublicSettingsDTO;
  timezone: string;
  isUploading: boolean;
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
  const lines = [
    `Hola ${handle}, envío mi comprobante de anticipo (${formatCurrency(depositCents, settings.currency)}) para confirmar mi cita ${booking.bookingCode} en ${settings.name}:`,
    `- Servicios: ${serviceNames.join(' + ')}`,
    ...(addonNames.length > 0 ? [`- Extras: ${addonNames.join(', ')}`] : []),
    `- Fecha y hora: ${formatDateLongInTimezone(booking.startAt, timezone)} · ${formatTimeInTimezone(booking.startAt, timezone)} (${formatDuration(booking.totalDurationMinutes)})`,
    `- Especialista: ${booking.staff.name}`,
    `- Clienta: ${booking.client.fullName}`,
    ...(booking.clientInstagram
      ? [`- Instagram: ${normalizeInstagramHandle(booking.clientInstagram, '')}`]
      : []),
  ];
  return lines.join('\n');
}

export function CitaDepositSection({
  booking,
  settings,
  timezone,
  isUploading,
  onUploadProof,
}: CitaDepositSectionProps) {
  const clabeFeedback = useEphemeralMessage(2500);
  const dmFeedback = useEphemeralMessage(2500);
  const lastCopyMsgRef = useRef('');
  const [clabeCopyOk, setClabeCopyOk] = useState(false);
  const [dmCopyOk, setDmCopyOk] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'web_upload' | 'instagram_dm'>(
    booking.proofDeliveryMethod === 'instagram_dm' ? 'instagram_dm' : 'web_upload',
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const isPendingDeposit =
    booking.status === 'pending_confirmation' || booking.status === 'pending_payment';
  const safeCheckoutUrl = resolveSafeHttpUrl(booking.checkoutUrl);
  const showSpei = hasConfiguredDeposit(settings, booking.depositAmountCents);

  if (!isPendingDeposit || (!showSpei && !safeCheckoutUrl)) {
    return null;
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
  const canPreviewProof = isDisplayableMediaUrl(booking.paymentProofUrl);

  const announce = (
    target: ReturnType<typeof useEphemeralMessage>,
    rawMessage: string,
  ) => {
    let msg = rawMessage;
    if (msg === lastCopyMsgRef.current) {
      msg += '\u00A0';
    }
    lastCopyMsgRef.current = msg;
    target.show(msg);
  };

  const handleCopyClabe = async () => {
    const cleanClabe = settings.depositClabe.replace(/\s+/g, '');
    if (!cleanClabe) return;
    try {
      await navigator.clipboard.writeText(cleanClabe);
      setClabeCopyOk(true);
      announce(clabeFeedback, 'CLABE copiada al portapapeles');
    } catch {
      setClabeCopyOk(false);
      announce(clabeFeedback, 'No se pudo copiar automáticamente; selecciona la CLABE.');
    }
  };

  const handleCopyDmSummary = async () => {
    const summary = buildBookingDmSummary(booking, settings, timezone);
    try {
      await navigator.clipboard.writeText(summary);
      setDmCopyOk(true);
      announce(dmFeedback, 'Resumen copiado para pegar en Instagram DM');
    } catch {
      setDmCopyOk(false);
      announce(dmFeedback, 'No se pudo copiar automáticamente; envía tu captura por DM.');
    }
  };

  const handleSelectProofFile = async (files: File | File[] | null) => {
    setFileError(null);
    const selected = Array.isArray(files) ? (files[0] ?? null) : files;
    if (!selected) {
      setProofFile(null);
      setProofDataUrl(null);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(selected);
      setProofFile(selected);
      setProofDataUrl(dataUrl);
    } catch {
      setProofFile(null);
      setProofDataUrl(null);
      setFileError('No pudimos leer esa imagen. Intenta con PNG, JPG o WEBP.');
    }
  };

  const handleSubmitProof = async () => {
    if (!proofDataUrl) {
      setFileError('Primero elige la captura de tu transferencia.');
      return;
    }
    setFileError(null);
    const ok = await onUploadProof(proofDataUrl);
    if (ok) {
      setProofFile(null);
      setProofDataUrl(null);
    }
  };

  const renderUploadBlock = (submitLabel: string) => (
    <VStack gap={3}>
      <FileInput
        label="Comprobante de transferencia"
        description="Captura PNG, JPG o WEBP hasta 2.5 MB."
        mode="dropzone"
        accept="image/png,image/jpeg,image/webp"
        maxSize={2_500_000}
        value={proofFile}
        status={fileError ? { type: 'error', message: fileError } : undefined}
        onChange={(f) => void handleSelectProofFile(f)}
      />
      <Button
        type="button"
        variant="primary"
        size="md"
        width="100%"
        icon={<Upload size={16} aria-hidden="true" />}
        label={submitLabel}
        isLoading={isUploading}
        isDisabled={!proofDataUrl}
        onClick={() => void handleSubmitProof()}
      />
    </VStack>
  );

  if (hasExistingProof) {
    return (
      <VStack as="section" className="ck-panel" aria-labelledby="ck-deposit-title">
        <VStack gap={3} padding={4} className="rb-deposit">
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center">
              <CheckCircle2 size={20} aria-hidden="true" className="lk-cereza-text" />
              <Heading level={2} id="ck-deposit-title" className="lk-serif rb-deposit-title">
                Comprobante recibido
              </Heading>
            </HStack>
            <Text type="supporting" color="accent" weight="semibold">
              En revisión
            </Text>
          </HStack>
          <Text type="supporting" textWrap="pretty">
            Ya recibimos tu comprobante de anticipo de {displayAmount}. El equipo lo valida y te confirma por WhatsApp.
          </Text>
          {canPreviewProof && booking.paymentProofUrl ? (
            <AspectRatio ratio={16 / 9} fit="cover">
              <img
                src={booking.paymentProofUrl}
                alt="Comprobante de anticipo adjunto"
                className="ck-proof-img"
              />
            </AspectRatio>
          ) : null}
          <Collapsible
            className="rb-fold"
            defaultIsOpen={false}
            trigger={<Text weight="semibold">¿Necesitas subir otro comprobante?</Text>}
          >
            <VStack gap={3} className="rb-fold-body">
              {renderUploadBlock('Actualizar comprobante')}
            </VStack>
          </Collapsible>
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack as="section" className="ck-panel" aria-labelledby="ck-deposit-title">
      <VStack gap={3} padding={4} className="rb-deposit">
        <HStack justify="between" align="end" wrap="wrap" gap={1}>
          <Heading level={2} id="ck-deposit-title" className="lk-serif rb-deposit-title">
            Anticipo de {displayAmount}
          </Heading>
          <Text type="supporting" color="secondary">
            Se descuenta de tu total
          </Text>
        </HStack>

        {booking.status === 'pending_payment' && safeCheckoutUrl ? (
          <VStack gap={2}>
            <Text type="supporting" textWrap="pretty">
              Completa tu anticipo en línea para confirmar tu horario al instante.
            </Text>
            <Button
              label="Pagar anticipo con Mercado Pago"
              variant="primary"
              size="lg"
              width="100%"
              icon={<CreditCard size={16} aria-hidden="true" />}
              href={safeCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </VStack>
        ) : null}

        {showSpei && settings.depositClabe.trim() ? (
          <>
            <Text type="supporting">
              SPEI a {settings.depositBankName} · {beneficiary}
            </Text>

            <button
              type="button"
              className="rb-clabe"
              aria-label={`Copiar CLABE ${settings.depositClabe}`}
              onClick={() => void handleCopyClabe()}
            >
              <VStack gap={0} align="start">
                <Text type="supporting" color="secondary">
                  CLABE
                </Text>
                <Text type="code" weight="bold" hasTabularNumbers>
                  {settings.depositClabe}
                </Text>
              </VStack>
              <Text color="inherit" weight="semibold" className="rb-clabe-action">
                {clabeFeedback.message && clabeCopyOk ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {clabeFeedback.message && clabeCopyOk ? 'Copiada' : 'Copiar'}
              </Text>
            </button>
            <Text
              type="supporting"
              color={clabeCopyOk ? 'accent' : 'secondary'}
              role="status"
              aria-live="polite"
              className={clabeFeedback.message ? undefined : 'rb-sr-only'}
            >
              {clabeFeedback.message ?? ''}
            </Text>

            <RadioList
              label="¿Cómo nos mandas tu comprobante?"
              value={deliveryMethod}
              onChange={(val) =>
                setDeliveryMethod(val === 'instagram_dm' ? 'instagram_dm' : 'web_upload')
              }
            >
              <RadioListItem
                value="web_upload"
                label="Lo subo aquí"
                description="Sube tu captura PNG, JPG o WEBP directo a tu cita."
              />
              <RadioListItem
                value="instagram_dm"
                label={`Lo mando por DM a ${instagramHandle}`}
                description="Copia tus datos y envía tu captura por Instagram."
              />
            </RadioList>

            {deliveryMethod === 'web_upload' ? (
              renderUploadBlock('Subir comprobante')
            ) : (
              <VStack gap={2} padding={3} className="rb-card">
                <Text type="supporting" color="secondary" textWrap="pretty">
                  Envía tu captura junto con el código {booking.bookingCode} a {instagramHandle} para validar tu anticipo.
                </Text>
                <HStack gap={2} wrap="wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ExternalLink size={14} aria-hidden="true" />}
                    label={`Abrir ${instagramHandle}`}
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={
                      dmFeedback.message && dmCopyOk ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )
                    }
                    label={
                      dmFeedback.message && dmCopyOk
                        ? 'Resumen copiado'
                        : 'Copiar resumen para Instagram DM'
                    }
                    onClick={() => void handleCopyDmSummary()}
                  />
                </HStack>
                <Text
                  type="supporting"
                  color={dmCopyOk ? 'accent' : 'secondary'}
                  role="status"
                  aria-live="polite"
                >
                  {dmFeedback.message ?? ''}
                </Text>
              </VStack>
            )}
          </>
        ) : null}
      </VStack>
    </VStack>
  );
}
