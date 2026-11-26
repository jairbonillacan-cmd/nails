'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Info, Link2 } from 'lucide-react';
import { CopyableField } from '@/components/ui/CopyableField';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
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
  const activeMethod: 'web_upload' | 'none' =
    proofDeliveryMethod === 'none' ? 'none' : 'web_upload';

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
            if (val === 'none') {
              void processProofFile(null);
              onChangeProofMethod('none');
              return;
            }
            onChangeProofMethod('web_upload');
          }}
        >
          <RadioListItem
            value="web_upload"
            label="Sí, subo mi comprobante"
            description="Una captura de tu app del banco."
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
        ) : (
          <HStack gap={2} align="start" className="rb-card fx-fade-up" padding={3}>
            <Link2 size={15} aria-hidden="true" className="ck-icon lk-cereza-text" />
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
