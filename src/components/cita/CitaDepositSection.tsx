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
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Trash2,
  Upload,
} from 'lucide-react';
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
  formatFileSize,
  isDisplayableMediaUrl,
  MAX_PROOF_FILE_BYTES,
  resolveSafeHttpUrl,
  validateProofImageFile,
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

function appendManageTokenToMediaUrl(
  url: string | null | undefined,
  manageToken: string,
): string | null {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return null;
  const cleanToken = manageToken.trim();
  if (!trimmed.startsWith('/api/media/') || !cleanToken) {
    return trimmed;
  }
  if (/(?:^|[?&])token=/.test(trimmed)) {
    return trimmed;
  }
  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}token=${encodeURIComponent(cleanToken)}`;
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
  justUploadedMessage = null,
  onUploadProof,
}: CitaDepositSectionProps) {
  const clabeFeedback = useEphemeralMessage(2600);
  const dmFeedback = useEphemeralMessage(2600);
  const lastCopyMsgRef = useRef('');
  const submitLockRef = useRef(false);
  const [clabeCopyOk, setClabeCopyOk] = useState(false);
  const [dmCopyOk, setDmCopyOk] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'web_upload' | 'instagram_dm'>(
    booking.proofDeliveryMethod === 'instagram_dm' ? 'instagram_dm' : 'web_upload',
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const isPendingDeposit =
    booking.status === 'pending_confirmation' || booking.status === 'pending_payment';
  if (!isPendingDeposit) {
    return null;
  }

  const safeCheckoutUrl = resolveSafeHttpUrl(booking.checkoutUrl);
  const showSpei = hasConfiguredDeposit(settings, booking.depositAmountCents);

  if (!showSpei && !safeCheckoutUrl) {
    return (
      <VStack as="section" className="ck-panel fx-fade-up" aria-labelledby="ck-deposit-title">
        <VStack gap={3} padding={4} className="rb-deposit">
          <HStack gap={2} align="center">
            <Clock size={18} aria-hidden="true" className="lk-cereza-text" />
            <Text type="label" color="accent" weight="semibold">
              Siguiente paso · En revisión por el estudio
            </Text>
          </HStack>
          <Heading level={2} id="ck-deposit-title" className="lk-serif rb-deposit-title">
            Tu solicitud está en revisión
          </Heading>
          <Text type="supporting" textWrap="pretty">
            Ya recibimos tu cita en {settings.name}. En breve confirmaremos tu horario y te avisaremos por WhatsApp.
          </Text>
        </VStack>
      </VStack>
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
  const authorizedProofUrl = appendManageTokenToMediaUrl(
    booking.paymentProofUrl,
    booking.manageToken,
  );
  const canPreviewProof = isDisplayableMediaUrl(authorizedProofUrl);
  const dmSummaryText = buildBookingDmSummary(booking, settings, timezone);

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
    try {
      await navigator.clipboard.writeText(dmSummaryText);
      setDmCopyOk(true);
      announce(dmFeedback, 'Mensaje copiado para pegar en Instagram DM');
    } catch {
      setDmCopyOk(false);
      announce(dmFeedback, 'No se pudo copiar automáticamente; envía tu captura por DM.');
    }
  };

  const handleClearProof = () => {
    if (isUploading || isReadingFile) return;
    setProofFile(null);
    setProofDataUrl(null);
    setFileError(null);
  };

  const handleSelectProofFile = async (files: File | File[] | null) => {
    setFileError(null);
    const selected = Array.isArray(files) ? (files[0] ?? null) : files;
    if (!selected) {
      setProofFile(null);
      setProofDataUrl(null);
      return;
    }
    const validationError = validateProofImageFile(selected);
    if (validationError) {
      setProofFile(null);
      setProofDataUrl(null);
      setFileError(validationError);
      return;
    }
    setIsReadingFile(true);
    try {
      const dataUrl = await readFileAsDataUrl(selected);
      if (!dataUrl.startsWith('data:image/')) {
        setProofFile(null);
        setProofDataUrl(null);
        setFileError('No pudimos validar esa imagen. Intenta con PNG, JPG o WEBP.');
        return;
      }
      setProofFile(selected);
      setProofDataUrl(dataUrl);
    } catch {
      setProofFile(null);
      setProofDataUrl(null);
      setFileError('No pudimos leer esa imagen. Intenta con PNG, JPG o WEBP.');
    } finally {
      setIsReadingFile(false);
    }
  };

  const handleSubmitProof = async () => {
    if (submitLockRef.current || isUploading || isReadingFile) return;
    if (!proofDataUrl || !proofFile) {
      setFileError('Primero elige la captura de tu transferencia.');
      return;
    }
    const validationError = validateProofImageFile(proofFile);
    if (validationError) {
      setFileError(validationError);
      return;
    }
    submitLockRef.current = true;
    setFileError(null);
    try {
      const ok = await onUploadProof(proofDataUrl);
      if (ok) {
        setProofFile(null);
        setProofDataUrl(null);
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  const isBusyUpload = isUploading || isReadingFile;

  const renderUploadBlock = (submitLabel: string) => (
    <VStack
      gap={3}
      className="fx-busy"
      data-busy={isUploading ? 'true' : 'false'}
      aria-busy={isBusyUpload}
    >
      <FileInput
        label="Comprobante de transferencia"
        description="Captura PNG, JPG o WEBP hasta 2.5 MB."
        mode="dropzone"
        accept="image/png,image/jpeg,image/webp"
        maxSize={MAX_PROOF_FILE_BYTES}
        value={proofFile}
        isDisabled={isBusyUpload}
        status={fileError ? { type: 'error', message: fileError } : undefined}
        onChange={(f) => void handleSelectProofFile(f)}
      />

      {isBusyUpload ? (
        <VStack gap={1.5} role="status" aria-live="polite">
          <HStack justify="between" align="center" gap={2}>
            <Text type="supporting" color="accent" weight="semibold">
              {isUploading ? 'Subiendo comprobante a tu cita...' : 'Procesando imagen...'}
            </Text>
          </HStack>
          <VStack className="fx-upload-track" aria-hidden="true">
            <VStack className="fx-upload-bar" data-indeterminate="true" />
          </VStack>
        </VStack>
      ) : null}

      {proofDataUrl && proofFile ? (
        <HStack gap={3} align="center" wrap="wrap" padding={3} className="rb-card fx-fade-up">
          <VStack className="fx-upload-thumb">
            <img
              src={proofDataUrl}
              alt="Vista previa del comprobante seleccionado"
              decoding="async"
            />
          </VStack>
          <VStack gap={1} className="rb-grow" style={{ minWidth: 0 }}>
            <Text weight="semibold" style={{ overflowWrap: 'anywhere' }}>
              {proofFile.name}
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {formatFileSize(proofFile.size)} · Lista para enviar
            </Text>
            <HStack>
              <Button
                type="button"
                label="Quitar imagen"
                variant="ghost"
                size="md"
                className="fx-press"
                isDisabled={isBusyUpload}
                icon={<Trash2 size={14} aria-hidden="true" />}
                onClick={handleClearProof}
              />
            </HStack>
          </VStack>
        </HStack>
      ) : null}

      <Button
        type="button"
        variant="primary"
        size="md"
        width="100%"
        className="fx-press"
        icon={<Upload size={16} aria-hidden="true" />}
        label={isUploading ? 'Subiendo comprobante...' : submitLabel}
        isLoading={isUploading}
        isDisabled={!proofDataUrl || isBusyUpload}
        onClick={() => void handleSubmitProof()}
      />
    </VStack>
  );

  if (hasExistingProof) {
    return (
      <VStack as="section" className="ck-panel fx-fade-up" aria-labelledby="ck-deposit-title">
        <VStack gap={3} padding={4} className="rb-deposit">
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center" style={{ minWidth: 0 }}>
              <CheckCircle2 size={20} aria-hidden="true" className="lk-cereza-text fx-pop" />
              <Heading level={2} id="ck-deposit-title" className="lk-serif rb-deposit-title">
                Comprobante recibido · En revisión por el estudio
              </Heading>
            </HStack>
            {justUploadedMessage ? (
              <HStack className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
                <Check size={13} aria-hidden="true" />
                <Text type="supporting" color="inherit" weight="semibold">
                  {justUploadedMessage}
                </Text>
              </HStack>
            ) : null}
          </HStack>
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
              <HStack
                justify="between"
                align="center"
                gap={2}
                width="100%"
                style={{ minHeight: '2.75rem' }}
              >
                <Text weight="semibold">Reemplazar comprobante</Text>
              </HStack>
            }
          >
            <VStack gap={3} className="rb-fold-body">
              {renderUploadBlock('Reemplazar comprobante')}
            </VStack>
          </Collapsible>
        </VStack>
      </VStack>
    );
  }

  const isClabeCopied = Boolean(clabeFeedback.message && clabeCopyOk);
  const isDmCopied = Boolean(dmFeedback.message && dmCopyOk);

  return (
    <VStack as="section" className="ck-panel fx-fade-up" aria-labelledby="ck-deposit-title">
      <VStack gap={3} padding={4} className="rb-deposit">
        <HStack gap={1.5} align="center">
          <Clock size={15} aria-hidden="true" className="lk-cereza-text" />
          <Text type="label" color="accent" weight="semibold">
            Siguiente paso · Confirma tu horario
          </Text>
        </HStack>

        <HStack justify="between" align="end" wrap="wrap" gap={1}>
          <Heading level={2} id="ck-deposit-title" className="lk-serif rb-deposit-title">
            Anticipo de {displayAmount}
          </Heading>
          <Text type="supporting" color="secondary">
            Se descuenta de tu total
          </Text>
        </HStack>

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

        {showSpei && settings.depositClabe.trim() ? (
          <>
            <Text type="supporting" textWrap="pretty">
              SPEI a {settings.depositBankName} · {beneficiary}
            </Text>

            <button
              type="button"
              className="rb-clabe fx-press"
              data-copied={isClabeCopied ? 'true' : 'false'}
              aria-label={`Copiar CLABE ${settings.depositClabe}`}
              onClick={() => void handleCopyClabe()}
            >
              <VStack gap={0} align="start" style={{ minWidth: 0 }}>
                <Text type="supporting" color="secondary">
                  CLABE
                </Text>
                <Text
                  type="code"
                  weight="bold"
                  hasTabularNumbers
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {settings.depositClabe}
                </Text>
              </VStack>
              <Text color="inherit" weight="semibold" className="rb-clabe-action">
                {isClabeCopied ? (
                  <Check size={14} aria-hidden="true" className="fx-pop" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                {isClabeCopied ? 'CLABE copiada ✓' : 'Copiar CLABE'}
              </Text>
            </button>
            <Text
              type="supporting"
              color={clabeCopyOk ? 'accent' : 'secondary'}
              role="status"
              aria-live="polite"
              className={clabeFeedback.message && !clabeCopyOk ? 'fx-fade-up' : 'rb-sr-only'}
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
              renderUploadBlock('Subir comprobante')
            ) : (
              <VStack gap={3} padding={3} className="rb-card fx-fade-up">
                <Text type="supporting" color="secondary" textWrap="pretty">
                  Copia el mensaje con tu código {booking.bookingCode} y envía la captura de tu transferencia a {instagramHandle}.
                </Text>
                <VStack gap={1} padding={3} className="rb-deposit">
                  <Text type="supporting" color="secondary" weight="semibold">
                    Mensaje listo para pegar en DM
                  </Text>
                  <Text
                    type="supporting"
                    style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
                  >
                    {dmSummaryText}
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap" align="center">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    className="fx-press"
                    icon={
                      isDmCopied ? (
                        <Check size={15} aria-hidden="true" className="fx-pop" />
                      ) : (
                        <Copy size={15} aria-hidden="true" />
                      )
                    }
                    label={isDmCopied ? 'Mensaje copiado ✓' : 'Copiar mensaje para DM'}
                    onClick={() => void handleCopyDmSummary()}
                  />
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
                  {dmFeedback.message ? (
                    <HStack
                      className="fx-save-pill"
                      data-state={dmCopyOk ? 'saved' : 'error'}
                      role="status"
                      aria-live="polite"
                    >
                      <Text type="supporting" color="inherit" weight="semibold">
                        {dmCopyOk ? 'Copiado al portapapeles ✓' : 'Copia manual requerida'}
                      </Text>
                    </HStack>
                  ) : null}
                </HStack>
              </VStack>
            )}
          </>
        ) : null}
      </VStack>
    </VStack>
  );
}
