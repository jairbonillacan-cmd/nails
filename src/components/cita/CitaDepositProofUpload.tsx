'use client';

import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Upload } from 'lucide-react';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import { readFileAsDataUrl } from '../booking/bookingHelpers';
import { formatFileSize, validateProofImageFile } from './types';

interface CitaDepositProofUploadProps {
  submitLabel: string;
  isUploading: boolean;
  onUploadProof: (dataUrl: string) => Promise<boolean>;
}

export function CitaDepositProofUpload({
  submitLabel,
  isUploading,
  onUploadProof,
}: CitaDepositProofUploadProps) {
  const submitLockRef = useRef(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [readProgress, setReadProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const isBusyUpload = isUploading || readProgress !== null;

  const handleClearProof = () => {
    if (isBusyUpload) return;
    setProofFile(null);
    setProofDataUrl(null);
    setFileError(null);
  };

  const handleSelectProofFile = async (selected: File | null) => {
    setFileError(null);
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
    setReadProgress(15);
    try {
      const dataUrl = await readFileAsDataUrl(selected, setReadProgress);
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
      setReadProgress(null);
    }
  };

  const handleSubmitProof = async () => {
    if (submitLockRef.current || isBusyUpload) return;
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

  return (
    <VStack gap={3} className="fx-busy" data-busy={isUploading ? 'true' : 'false'} aria-busy={isBusyUpload}>
      <UploadDropzone
        label="Comprobante de transferencia"
        previewUrl={proofDataUrl}
        previewAlt="Vista previa del comprobante seleccionado"
        fileName={proofFile?.name ?? null}
        fileSizeLabel={proofFile ? `${formatFileSize(proofFile.size)} · Lista para enviar` : null}
        progress={isUploading ? 80 : readProgress}
        error={fileError}
        isDisabled={isBusyUpload}
        helperText="Captura PNG, JPG o WEBP hasta 2.5 MB."
        placeholder="Elige o arrastra tu captura"
        readyLabel="Lista para enviar"
        clearLabel="Quitar imagen"
        onSelectFile={(file) => void handleSelectProofFile(file)}
        onClear={handleClearProof}
      />

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
}
