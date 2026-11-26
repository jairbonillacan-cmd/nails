'use client';

import type React from 'react';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { FileInput } from '@astryxdesign/core/FileInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Check, Copy, ExternalLink, Info, RefreshCw, Trash2, Upload } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatCurrency } from '@/lib/format';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import {
  buildInstagramDmSummary,
  formatFileSize,
  normalizeInstagramHandle,
  readFileAsDataUrl,
  resolveInstagramUrl,
  validateClientImageFile,
  type ProofDeliveryMethod,
} from './bookingHelpers';

interface DepositCardProps {
  settings: PublicSettingsDTO;
  depositAmountCents: number;
  primaryService: PublicServiceDTO | undefined;
  extraServices: PublicServiceDTO[];
  addons: ServiceAddon[];
  selectedSlot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  clientName: string;
  clientInstagram: string;
  proofDeliveryMethod: ProofDeliveryMethod;
  proofFile: File | null;
  proofDataUrl: string | null;
  isDisabled?: boolean;
  noShowNotice?: string | null;
  onChangeProofMethod: (method: ProofDeliveryMethod) => void;
  onChangeProofFile: (file: File | null, dataUrl: string | null) => void;
}

export function DepositCard({
  settings,
  depositAmountCents,
  primaryService,
  extraServices,
  addons,
  selectedSlot,
  timeFormat,
  totalDurationMinutes,
  clientName,
  clientInstagram,
  proofDeliveryMethod,
  proofFile,
  proofDataUrl,
  isDisabled = false,
  noShowNotice = null,
  onChangeProofMethod,
  onChangeProofFile,
}: DepositCardProps) {
  const clabeFeedback = useEphemeralMessage(3000);
  const dmFeedback = useEphemeralMessage(2500);
  const [clabeCopyOk, setClabeCopyOk] = useState(false);
  const [dmCopyOk, setDmCopyOk] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const displayAmount = formatCurrency(
    depositAmountCents > 0 ? depositAmountCents : 20000,
    settings.currency,
  );
  const beneficiary = settings.depositBeneficiary || settings.depositAccountHolder;
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const activeMethod: 'web_upload' | 'instagram_dm' =
    proofDeliveryMethod === 'instagram_dm' ? 'instagram_dm' : 'web_upload';

  const handleCopyClabe = async () => {
    const cleanClabe = settings.depositClabe.replace(/\s+/g, '');
    if (!cleanClabe) return;
    try {
      await navigator.clipboard.writeText(cleanClabe);
      setClabeCopyOk(true);
      clabeFeedback.show('CLABE copiada ✓');
    } catch {
      setClabeCopyOk(false);
      clabeFeedback.show('No se pudo copiar automáticamente; selecciona la CLABE.');
    }
  };

  const handleCopyDmSummary = async () => {
    const summary = buildInstagramDmSummary({
      settings,
      primaryService,
      extraServices,
      addons,
      slot: selectedSlot,
      timeFormat,
      totalDurationMinutes,
      depositAmountCents,
      clientName,
      clientInstagram,
    });
    try {
      await navigator.clipboard.writeText(summary);
      setDmCopyOk(true);
      dmFeedback.show('Resumen copiado para pegar en Instagram DM');
    } catch {
      setDmCopyOk(false);
      dmFeedback.show('No se pudo copiar automáticamente; envía tu captura por DM.');
    }
  };

  const processProofFile = async (file: File | null) => {
    if (!file) {
      setUploadError(null);
      setUploadProgress(null);
      onChangeProofFile(null, null);
      return;
    }
    setUploadError(null);
    const validationError = await validateClientImageFile(file);
    if (validationError) {
      setUploadProgress(null);
      setUploadError(validationError);
      return;
    }
    setUploadProgress(15);
    try {
      const url = await readFileAsDataUrl(file, setUploadProgress);
      onChangeProofFile(file, url);
    } catch {
      setUploadError('No pudimos leer esta imagen. Intenta con otra captura PNG, JPG o WEBP.');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleReplaceInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (nextFile) {
      void processProofFile(nextFile);
    }
  };

  const isClabeCopied = Boolean(clabeFeedback.message && clabeCopyOk);

  return (
    <VStack gap={3} padding={4} className="rb-deposit">
      <HStack justify="between" align="end" wrap="wrap" gap={1}>
        <Heading level={3} className="lk-serif rb-deposit-title">
          Anticipo de {displayAmount}
        </Heading>
        <Text type="supporting" color="secondary">
          Se descuenta de tu total
        </Text>
      </HStack>
      <Text type="supporting">
        SPEI a {settings.depositBankName} · {beneficiary}
      </Text>

      {noShowNotice ? (
        <HStack gap={2} align="start" className="rb-note">
          <Info size={16} aria-hidden="true" className="ck-icon lk-cereza-text" />
          <Text type="supporting" color="primary" textWrap="pretty">
            {noShowNotice}
          </Text>
        </HStack>
      ) : (
        <HStack gap={2} align="start" className="rb-card" padding={3}>
          <Info size={15} aria-hidden="true" className="ck-icon lk-cereza-text" />
          <Text type="supporting" color="secondary" textWrap="pretty">
            Para cuidar el tiempo de tu artista, el anticipo confirma tu lugar y se aplica de forma automática en cuentas con inasistencias previas.
          </Text>
        </HStack>
      )}

      <VStack gap={1.5}>
        <button
          type="button"
          className="rb-clabe fx-press"
          data-copied={isClabeCopied ? 'true' : 'false'}
          aria-label={`Copiar CLABE ${settings.depositClabe}`}
          onClick={() => void handleCopyClabe()}
        >
          <VStack gap={0} align="start" className="rb-grow">
            <Text type="supporting" color="secondary">
              CLABE
            </Text>
            <Text type="code" weight="bold" hasTabularNumbers>
              {settings.depositClabe}
            </Text>
          </VStack>
          <Text color="inherit" weight="semibold" className="rb-clabe-action">
            {isClabeCopied ? (
              <Check size={14} aria-hidden="true" className="fx-pop" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            {isClabeCopied ? 'Copiada ✓' : 'Copiar'}
          </Text>
        </button>

        {isClabeCopied ? (
          <HStack align="center" gap={2} wrap="wrap">
            <Text
              type="supporting"
              className="fx-save-pill"
              data-tone="success"
              role="status"
              aria-live="polite"
            >
              <Check size={13} aria-hidden="true" />
              CLABE copiada ✓
            </Text>
            <Text type="supporting" color="secondary">
              Lista para pegar en tu app bancaria.
            </Text>
          </HStack>
        ) : (
          <Text
            type="supporting"
            color="secondary"
            role="status"
            aria-live="polite"
            className={clabeFeedback.message ? 'fx-fade-up' : 'rb-sr-only'}
          >
            {clabeFeedback.message ?? ''}
          </Text>
        )}
      </VStack>

      <RadioList
        label="¿Cómo nos mandas tu comprobante?"
        value={activeMethod}
        onChange={(val) =>
          onChangeProofMethod(val === 'instagram_dm' ? 'instagram_dm' : 'web_upload')
        }
      >
        <RadioListItem
          value="web_upload"
          label="Lo subo ahora"
          description="Captura PNG, JPG o WEBP (máx. 2.5 MB)."
        />
        <RadioListItem
          value="instagram_dm"
          label={`Lo mando por DM a ${instagramHandle}`}
          description="Apartas ya y lo envías después."
        />
      </RadioList>

      {activeMethod === 'web_upload' ? (
        <VStack gap={2}>
          {proofFile && proofDataUrl ? (
            <VStack gap={2} padding={3} className="rb-card fx-fade-up">
              <HStack gap={3} align="center">
                <img
                  src={proofDataUrl}
                  alt={`Vista previa de ${proofFile.name}`}
                  className="fx-upload-thumb"
                />
                <VStack gap={1} className="rb-grow">
                  <HStack gap={1.5} align="center" wrap="wrap">
                    <Text type="supporting" className="fx-save-pill" data-tone="success">
                      <Check size={13} aria-hidden="true" />
                      Comprobante listo
                    </Text>
                  </HStack>
                  <Text
                    type="supporting"
                    weight="semibold"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {proofFile.name}
                  </Text>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {formatFileSize(proofFile.size)}
                  </Text>
                </VStack>
              </HStack>

              <VStack
                className="fx-upload-track"
                role="progressbar"
                aria-label="Comprobante cargado"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={100}
              >
                <VStack
                  className="fx-upload-bar"
                  data-tone="success"
                  style={{ transform: 'scaleX(1)' }}
                />
              </VStack>

              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  label="Cambiar"
                  icon={<RefreshCw size={14} aria-hidden="true" />}
                  className="fx-press"
                  isDisabled={isDisabled || uploadProgress !== null}
                  onClick={() => replaceInputRef.current?.click()}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  label="Quitar"
                  icon={<Trash2 size={14} aria-hidden="true" />}
                  className="fx-press"
                  isDisabled={isDisabled || uploadProgress !== null}
                  onClick={() => void processProofFile(null)}
                />
              </HStack>
              <input
                ref={replaceInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="rb-sr-only"
                aria-label="Cambiar comprobante de transferencia"
                onChange={handleReplaceInput}
              />
            </VStack>
          ) : (
            <FileInput
              label="Comprobante de transferencia"
              placeholder="Elige o arrastra tu captura"
              description="PNG, JPG o WEBP · máximo 2.5 MB."
              mode="dropzone"
              accept="image/png,image/jpeg,image/webp"
              isOptional
              isDisabled={isDisabled}
              isLoading={uploadProgress !== null}
              value={proofFile}
              status={uploadError ? { type: 'error', message: uploadError } : undefined}
              onChange={(files) => {
                const file = Array.isArray(files) ? (files[0] ?? null) : files;
                void processProofFile(file);
              }}
            />
          )}

          {uploadProgress !== null ? (
            <VStack gap={1} className="fx-fade-up">
              <HStack justify="between" align="center">
                <Text type="supporting" color="secondary" role="status" aria-live="polite">
                  Procesando comprobante…
                </Text>
                <Text type="supporting" color="accent" weight="semibold" hasTabularNumbers>
                  {uploadProgress}%
                </Text>
              </HStack>
              <VStack
                className="fx-upload-track"
                role="progressbar"
                aria-label="Progreso de carga del comprobante"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <VStack
                  className="fx-upload-bar"
                  style={{
                    transform: `scaleX(${Math.max(0.08, Math.min(1, uploadProgress / 100))})`,
                  }}
                />
              </VStack>
            </VStack>
          ) : null}

          {uploadError && proofFile ? (
            <Text type="supporting" color="accent" role="alert">
              {uploadError}
            </Text>
          ) : null}
        </VStack>
      ) : (
        <VStack gap={2} padding={3} className="rb-card">
          <VStack gap={2}>
            <HStack gap={1.5} align="center">
              <Upload size={15} aria-hidden="true" />
              <Text weight="medium">Envío por Instagram DM</Text>
            </HStack>
            <Text type="supporting" color="secondary">
              Al confirmar tu cita apartaremos tu horario y podrás mandar tu comprobante a {instagramHandle}.
            </Text>
            <HStack gap={2} wrap="wrap">
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
              <Button
                type="button"
                variant="ghost"
                size="md"
                className="fx-press"
                icon={
                  dmFeedback.message && dmCopyOk ? (
                    <Check size={15} aria-hidden="true" className="fx-pop" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
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
              className={dmFeedback.message ? 'fx-fade-up' : 'rb-sr-only'}
            >
              {dmFeedback.message ?? ''}
            </Text>
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}
