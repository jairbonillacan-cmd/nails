'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Link2 } from 'lucide-react';
import { FilterPillBar, type FilterPillOption } from '@/components/ui/FilterPillBar';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import { isSafeExternalProofUrl } from '@/lib/contracts';
import { prepareClientImageFile, readFileAsDataUrl } from '../booking/bookingHelpers';
import { formatFileSize, validateProofImageFile } from './types';

type ProofUploadMode = 'image' | 'link';

const MODE_OPTIONS: Array<FilterPillOption<ProofUploadMode>> = [
  { value: 'image', label: 'Subir captura' },
  { value: 'link', label: 'Pegar enlace' },
];

interface CitaDepositProofUploadProps {
  submitLabel: string;
  isUploading: boolean;
  onUploadProof: (proofValue: string) => Promise<boolean>;
}

export function CitaDepositProofUpload({
  submitLabel,
  isUploading,
  onUploadProof,
}: CitaDepositProofUploadProps) {
  const submitLockRef = useRef(false);
  const [mode, setMode] = useState<ProofUploadMode>('image');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofLink, setProofLink] = useState('');
  const [readProgress, setReadProgress] = useState<number | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const isBusyUpload = isUploading || readProgress !== null;

  const handleClearProof = () => {
    if (isBusyUpload) return;
    setProofFile(null);
    setProofDataUrl(null);
    setFileError(null);
  };

  const submitProofValue = async (value: string): Promise<boolean> => {
    if (submitLockRef.current) return false;
    submitLockRef.current = true;
    setFileError(null);
    try {
      const ok = await onUploadProof(value);
      if (ok) {
        setProofFile(null);
        setProofDataUrl(null);
        setProofLink('');
      }
      return ok;
    } finally {
      submitLockRef.current = false;
    }
  };

  const handleSelectProofFile = async (selected: File | null) => {
    setFileError(null);
    if (!selected) {
      setProofFile(null);
      setProofDataUrl(null);
      return;
    }
    setReadProgress(8);
    const prepared = await prepareClientImageFile(selected);
    const validationError = prepared.error ?? validateProofImageFile(prepared.file);
    if (validationError) {
      setReadProgress(null);
      setProofFile(null);
      setProofDataUrl(null);
      setFileError(validationError);
      return;
    }
    const ready = prepared.file;
    setReadProgress(25);
    try {
      const dataUrl = await readFileAsDataUrl(ready, setReadProgress);
      if (!dataUrl.startsWith('data:image/')) {
        setProofFile(null);
        setProofDataUrl(null);
        setFileError('No pudimos validar esa imagen. Intenta con PNG, JPG o WEBP.');
        return;
      }
      setProofFile(ready);
      setProofDataUrl(dataUrl);
      setReadProgress(null);
      await submitProofValue(dataUrl);
    } catch {
      setProofFile(null);
      setProofDataUrl(null);
      setFileError('No pudimos leer esa imagen. Intenta con PNG, JPG o WEBP.');
    } finally {
      setReadProgress(null);
    }
  };

  const handleRetryImageUpload = async () => {
    if (isBusyUpload || !proofDataUrl) return;
    await submitProofValue(proofDataUrl);
  };

  const handleSubmitLink = async () => {
    if (isBusyUpload) return;
    const trimmed = proofLink.trim();
    if (!isSafeExternalProofUrl(trimmed)) {
      setFileError(
        'Usa un enlace HTTPS de Mercado Pago, CEP Banxico, tu banco (BBVA, Nu, Santander, etc.) o Google Drive.',
      );
      return;
    }
    await submitProofValue(trimmed);
  };

  return (
    <VStack
      gap={3}
      className="fx-busy"
      data-busy={isUploading ? 'true' : 'false'}
      aria-busy={isBusyUpload}
    >
      <HStack justify="start">
        <FilterPillBar
          ariaLabel="Forma de enviar comprobante"
          mode="segmented"
          size="sm"
          value={mode}
          options={MODE_OPTIONS}
          onChange={(next) => {
            setMode(next);
            setFileError(null);
          }}
        />
      </HStack>

      {mode === 'image' ? (
        <>
          <UploadDropzone
            label="Comprobante de transferencia"
            previewUrl={proofDataUrl}
            previewAlt="Vista previa del comprobante seleccionado"
            fileName={proofFile?.name ?? null}
            fileSizeLabel={
              proofFile
                ? `${formatFileSize(proofFile.size)} · ${isUploading ? 'Enviando...' : 'Listo'}`
                : null
            }
            progress={isUploading ? 85 : readProgress}
            error={fileError}
            isDisabled={isBusyUpload}
            helperText="Al elegir tu captura se comprime y se envía en un solo paso."
            placeholder="Elige o arrastra tu captura"
            readyLabel="Enviando comprobante"
            clearLabel="Quitar imagen"
            onSelectFile={(file) => void handleSelectProofFile(file)}
            onClear={handleClearProof}
          />
          {proofDataUrl && !isBusyUpload ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              width="100%"
              className="fx-press"
              icon={<BrandIcon name="comprobante" size={1.25} />}
              label={submitLabel}
              onClick={() => void handleRetryImageUpload()}
            />
          ) : null}
        </>
      ) : (
        <VStack gap={3}>
          <TextInput
            label="Enlace de tu comprobante (HTTPS)"
            type="url"
            placeholder="https://..."
            value={proofLink}
            onChange={(val) => {
              setProofLink(val);
              if (fileError) setFileError(null);
            }}
            status={fileError ? { type: 'error', message: fileError } : undefined}
            isDisabled={isBusyUpload}
            description="Enlace de Mercado Pago, CEP Banxico, tu banco o Google Drive."
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            width="100%"
            className="fx-press"
            icon={<Link2 size={15} aria-hidden="true" />}
            label={isUploading ? 'Enviando enlace...' : 'Enviar enlace de comprobante'}
            isLoading={isUploading}
            isDisabled={!proofLink.trim() || isBusyUpload}
            onClick={() => void handleSubmitLink()}
          />
        </VStack>
      )}
    </VStack>
  );
}
