'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Info } from 'lucide-react';
import { CopyableField } from '@/components/ui/CopyableField';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import { isSafeExternalProofUrl } from '@/lib/contracts';
import { formatCurrency } from '@/lib/format';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import {
  formatFileSize,
  prepareClientImageFile,
  readFileAsDataUrl,
  type ProofDeliveryMethod,
} from './bookingHelpers';

interface DepositCardProps {
  settings: PublicSettingsDTO;
  depositAmountCents: number;
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
  proofDeliveryMethod,
  proofFile,
  proofDataUrl,
  isDisabled = false,
  noShowNotice = null,
  onChangeProofMethod,
  onChangeProofFile,
}: DepositCardProps) {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displayAmount = formatCurrency(
    depositAmountCents > 0 ? depositAmountCents : 20000,
    settings.currency,
  );
  const beneficiary = settings.depositBeneficiary || settings.depositAccountHolder;
  const cleanClabe = settings.depositClabe.replace(/\s+/g, '');
  const activeMethod: 'web_upload' | 'web_link' | 'none' =
    proofDeliveryMethod === 'none'
      ? 'none'
      : proofDeliveryMethod === 'web_link'
        ? 'web_link'
        : 'web_upload';
  const linkDraft = activeMethod === 'web_link' ? (proofDataUrl ?? '') : '';

  const processProofFile = async (file: File | null) => {
    if (!file) {
      setUploadError(null);
      setUploadProgress(null);
      onChangeProofFile(null, null);
      return;
    }
    setUploadError(null);
    setUploadProgress(8);
    const prepared = await prepareClientImageFile(file);
    if (prepared.error) {
      setUploadProgress(null);
      setUploadError(prepared.error);
      return;
    }
    setUploadProgress(15);
    try {
      const url = await readFileAsDataUrl(prepared.file, setUploadProgress);
      onChangeProofFile(prepared.file, url);
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
          Transferencia a {settings.depositBankName} · {beneficiary}
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
              Con el anticipo tu lugar queda apartado. Si no puedes venir, avísanos con tiempo y lo movemos a otro día.
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
          label="¿Ya hiciste la transferencia?"
          value={activeMethod}
          onChange={(val) => {
            setUploadError(null);
            if (val === 'none') {
              void processProofFile(null);
              onChangeProofMethod('none');
              return;
            }
            if (val === 'web_link') {
              onChangeProofFile(null, null);
              onChangeProofMethod('web_link');
              return;
            }
            onChangeProofFile(null, null);
            onChangeProofMethod('web_upload');
          }}
        >
          <RadioListItem
            value="web_upload"
            label="Sí, subo captura"
            description="Se ajusta sola desde tu teléfono."
          />
          <RadioListItem
            value="web_link"
            label="Sí, pego el enlace del recibo"
            description="El link que te da tu banco o Mercado Pago al pagar."
          />
          <RadioListItem
            value="none"
            label="La hago después"
            description="Apartas ya y lo subes desde el link de tu cita."
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
            helperText="Sirve cualquier captura o foto; la ajustamos sola."
            placeholder="Elige o arrastra tu captura"
            readyLabel="Comprobante listo"
            onSelectFile={(file) => void processProofFile(file)}
            onClear={() => void processProofFile(null)}
          />
        ) : activeMethod === 'web_link' ? (
          <TextInput
            label="Link del comprobante"
            type="url"
            placeholder="https://..."
            value={linkDraft}
            isDisabled={isDisabled}
            isOptional
            status={
              linkDraft.trim() && !isSafeExternalProofUrl(linkDraft)
                ? {
                    type: 'error',
                    message:
                      'Ese link no parece de un banco. Pega el que te dio tu banco, Mercado Pago o Google Drive, o mejor sube una captura.',
                  }
                : undefined
            }
            description="De tu banco, Mercado Pago o Google Drive. También puedes subirlo después desde tu cita."
            onChange={(val) => {
              const trimmed = val.trim();
              onChangeProofFile(null, trimmed || null);
            }}
          />
        ) : (
          <HStack gap={2} align="start" className="rb-card fx-fade-up" padding={3}>
            <BrandIcon name="pago-despues" size={1.125} className="ck-icon lk-cereza-text" />
            <Text type="supporting" color="secondary" textWrap="pretty">
              Al terminar te damos el link de tu cita. Cuando hagas la transferencia, entras
              ahí y subes la captura. No hace falta escribirnos.
            </Text>
          </HStack>
        )}
      </VStack>
    </SurfaceCard>
  );
}
