'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import {
  formatFileSize,
  readFileAsDataUrl,
  validateClientImageFile,
} from './bookingHelpers';

interface DesignStepProps {
  artistName: string | null;
  clientNotes: string;
  allowInspo: boolean;
  inspoFile: File | null;
  inspoDataUrl: string | null;
  onChangeClientNotes: (value: string) => void;
  onChangeInspoFile: (file: File | null, dataUrl: string | null) => void;
}

export function DesignStep({
  artistName,
  clientNotes,
  allowInspo,
  inspoFile,
  inspoDataUrl,
  onChangeClientNotes,
  onChangeInspoFile,
}: DesignStepProps) {
  const [inspoProgress, setInspoProgress] = useState<number | null>(null);
  const [inspoError, setInspoError] = useState<string | null>(null);
  const who = artistName ?? 'tu profesional';

  const processInspoFile = async (file: File | null) => {
    if (!file) {
      setInspoError(null);
      setInspoProgress(null);
      onChangeInspoFile(null, null);
      return;
    }
    setInspoError(null);
    const validationError = await validateClientImageFile(file);
    if (validationError) {
      setInspoProgress(null);
      setInspoError(validationError);
      return;
    }
    setInspoProgress(15);
    try {
      const url = await readFileAsDataUrl(file, setInspoProgress);
      onChangeInspoFile(file, url);
    } catch {
      setInspoError('No pudimos abrir esa foto. Prueba con otra en PNG, JPG o WEBP.');
    } finally {
      setInspoProgress(null);
    }
  };

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          Cuéntale a {who} qué quieres
        </Heading>
        <Text color="secondary">
          Es opcional. Si aún no lo tienes claro, lo platican en tu cita.
        </Text>
      </VStack>

      {allowInspo ? (
        <UploadDropzone
          label="Foto de inspiración"
          previewUrl={inspoDataUrl}
          previewAlt={inspoFile ? `Tu foto de inspiración ${inspoFile.name}` : 'Tu foto de inspiración'}
          fileName={inspoFile?.name ?? null}
          fileSizeLabel={inspoFile ? formatFileSize(inspoFile.size) : null}
          progress={inspoProgress}
          error={inspoError}
          isDisabled={false}
          isOptional
          helperText="Una sola foto. Sirve una captura de Pinterest o Instagram (hasta 2.5 MB)."
          placeholder="Sube la foto del diseño que te gustó"
          readyLabel="Foto lista"
          onSelectFile={(file) => void processInspoFile(file)}
          onClear={() => void processInspoFile(null)}
        />
      ) : null}

      <TextArea
        label="¿Qué te gustaría?"
        placeholder="Ej. Almendra corta en tono cherry, con un detalle dorado. Traigo gel de otro salón."
        description="Forma, largo, colores, si traes algo puesto o si tienes alguna alergia."
        value={clientNotes}
        onChange={onChangeClientNotes}
        isOptional
        rows={5}
      />
    </VStack>
  );
}
