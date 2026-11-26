'use client';

import { useRef, type ChangeEvent, type CSSProperties } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { FileInput } from '@astryxdesign/core/FileInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { RefreshCw, Trash2 } from 'lucide-react';
import { StatusTag } from './StatusTag';

interface UploadDropzoneProps {
  label: string;
  accept?: string;
  previewUrl: string | null;
  previewAlt: string;
  fileName?: string | null;
  fileSizeLabel?: string | null;
  progress?: number | null;
  error?: string | null;
  isDisabled?: boolean;
  isOptional?: boolean;
  helperText?: string;
  placeholder?: string;
  readyLabel?: string;
  replaceLabel?: string;
  clearLabel?: string;
  onSelectFile: (file: File | null) => void;
  onClear: () => void;
  className?: string;
}

const HIDDEN_INPUT_STYLE: CSSProperties = {
  position: 'absolute',
  width: '0.0625rem',
  height: '0.0625rem',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

const PREVIEW_BOX_STYLE: CSSProperties = {
  position: 'relative',
  borderRadius: 'var(--radius-container)',
  background: 'var(--ad-surface-alt, var(--color-background-surface))',
  border: '0.0625rem solid var(--ad-border, var(--color-border))',
  minWidth: 0,
};

const PREVIEW_IMG_STYLE: CSSProperties = {
  width: '4.5rem',
  height: '4.5rem',
  objectFit: 'cover',
  borderRadius: 'var(--radius-element)',
  flex: '0 0 auto',
  border: '0.0625rem solid var(--ad-border, var(--color-border))',
};

export function UploadDropzone({
  label,
  accept = 'image/png,image/jpeg,image/webp',
  previewUrl,
  previewAlt,
  fileName = null,
  fileSizeLabel = null,
  progress = null,
  error = null,
  isDisabled = false,
  isOptional = false,
  helperText = 'PNG, JPG o WEBP · máximo 2.5 MB.',
  placeholder = 'Elige o arrastra tu imagen',
  readyLabel = 'Archivo listo',
  replaceLabel = 'Cambiar',
  clearLabel = 'Quitar',
  onSelectFile,
  onClear,
  className,
}: UploadDropzoneProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const hasProgress = typeof progress === 'number';
  const clampedProgress = hasProgress ? Math.max(0, Math.min(100, progress)) : 0;

  const handleFileInputChange = (files: File | File[] | null) => {
    onSelectFile(Array.isArray(files) ? (files[0] ?? null) : files);
  };

  const handleReplaceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (nextFile) onSelectFile(nextFile);
  };

  return (
    <VStack gap={2} className={className} style={{ width: '100%', minWidth: 0 }}>
      {previewUrl ? (
        <VStack gap={3} padding={3} style={PREVIEW_BOX_STYLE}>
          <HStack gap={3} align="center">
            <img src={previewUrl} alt={previewAlt} className="fx-upload-thumb" style={PREVIEW_IMG_STYLE} />
            <VStack gap={1} style={{ minWidth: 0, flex: '1 1 0%' }}>
              <HStack gap={1.5} align="center" wrap="wrap">
                <StatusTag label={readyLabel} tone="success" size="sm" />
              </HStack>
              {fileName ? (
                <Text type="supporting" weight="semibold" style={{ overflowWrap: 'anywhere' }}>
                  {fileName}
                </Text>
              ) : null}
              {fileSizeLabel ? (
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {fileSizeLabel}
                </Text>
              ) : null}
            </VStack>
          </HStack>

          {hasProgress ? (
            <ProgressBar label={`Progreso de ${label}`} value={clampedProgress} max={100} hasValueLabel variant="accent" />
          ) : null}

          <HStack gap={2} wrap="wrap">
            <Button
              type="button"
              variant="secondary"
              size="md"
              label={replaceLabel}
              icon={<RefreshCw size={14} aria-hidden="true" />}
              isDisabled={isDisabled || hasProgress}
              onClick={() => replaceInputRef.current?.click()}
              style={{ minHeight: '2.75rem' }}
            />
            <Button
              type="button"
              variant="ghost"
              size="md"
              label={clearLabel}
              icon={<Trash2 size={14} aria-hidden="true" />}
              isDisabled={isDisabled || hasProgress}
              onClick={onClear}
              style={{ minHeight: '2.75rem' }}
            />
          </HStack>

          <input
            ref={replaceInputRef}
            type="file"
            accept={accept}
            aria-label={`${replaceLabel} ${label}`}
            onChange={handleReplaceChange}
            style={HIDDEN_INPUT_STYLE}
          />
        </VStack>
      ) : (
        <FileInput
          label={label}
          placeholder={placeholder}
          description={helperText}
          mode="dropzone"
          accept={accept}
          isOptional={isOptional}
          isDisabled={isDisabled}
          isLoading={hasProgress}
          width="100%"
          value={null}
          status={error ? { type: 'error', message: error } : undefined}
          onChange={handleFileInputChange}
        />
      )}

      {!previewUrl && hasProgress ? (
        <ProgressBar label={`Procesando ${label}`} value={clampedProgress} max={100} hasValueLabel variant="accent" />
      ) : null}

      {previewUrl && error ? <Banner status="error" role="alert" title={error} /> : null}
    </VStack>
  );
}
