'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Check, Copy, ExternalLink, Info, Upload } from 'lucide-react';
import { CopyableField } from '@/components/ui/CopyableField';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatCurrency } from '@/lib/format';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
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
  const dmClipboard = useCopyToClipboard(2500);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displayAmount = formatCurrency(
    depositAmountCents > 0 ? depositAmountCents : 20000,
    settings.currency,
  );
  const beneficiary = settings.depositBeneficiary || settings.depositAccountHolder;
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const cleanClabe = settings.depositClabe.replace(/\s+/g, '');
  const activeMethod: 'web_upload' | 'instagram_dm' =
    proofDeliveryMethod === 'instagram_dm' ? 'instagram_dm' : 'web_upload';

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
    await dmClipboard.copy(
      summary,
      'Resumen copiado para pegar en Instagram DM',
      'No se pudo copiar automáticamente; envía tu captura por DM.',
    );
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

  return (
    <SurfaceCard
      tone="accent"
      padded
      headingLevel={3}
      title={`Anticipo de ${displayAmount}`}
      subtitle="Se descuenta de tu total"
      className="rb-deposit"
    >
      <VStack gap={3}>
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

        {cleanClabe ? (
          <CopyableField
            label="CLABE"
            value={settings.depositClabe}
            copyValue={cleanClabe}
            copyLabel="Copiar"
            copiedLabel="Copiada ✓"
            feedbackMessage="CLABE copiada ✓ · Lista para pegar en tu app bancaria."
            monospace
          />
        ) : null}

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
          <UploadDropzone
            label="Comprobante de transferencia"
            previewUrl={proofDataUrl}
            previewAlt={
              proofFile ? `Vista previa de ${proofFile.name}` : 'Vista previa de comprobante'
            }
            fileName={proofFile?.name ?? null}
            fileSizeLabel={proofFile ? formatFileSize(proofFile.size) : null}
            progress={uploadProgress}
            error={uploadError}
            isDisabled={isDisabled}
            isOptional
            helperText="PNG, JPG o WEBP · máximo 2.5 MB."
            placeholder="Elige o arrastra tu captura"
            readyLabel="Comprobante listo"
            onSelectFile={(file) => void processProofFile(file)}
            onClear={() => void processProofFile(null)}
          />
        ) : (
          <SurfaceCard tone="default" padded className="rb-card">
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
                    dmClipboard.copied ? (
                      <Check size={15} aria-hidden="true" className="fx-pop" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )
                  }
                  label={
                    dmClipboard.copied
                      ? 'Resumen copiado'
                      : 'Copiar resumen para Instagram DM'
                  }
                  onClick={() => void handleCopyDmSummary()}
                />
              </HStack>
              <Text
                type="supporting"
                color={dmClipboard.copied ? 'accent' : 'secondary'}
                role="status"
                aria-live="polite"
                className={dmClipboard.feedback ? 'fx-fade-up' : 'rb-sr-only'}
              >
                {dmClipboard.feedback ?? ''}
              </Text>
            </VStack>
          </SurfaceCard>
        )}
      </VStack>
    </SurfaceCard>
  );
}
