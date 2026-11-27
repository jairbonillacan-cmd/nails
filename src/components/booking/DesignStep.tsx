'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Plus } from 'lucide-react';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import {
  formatFileSize,
  prepareClientImageFile,
  readFileAsDataUrl,
} from './bookingHelpers';

interface DesignDetailsSectionProps {
  artistName: string | null;
  clientNotes: string;
  allowInspo: boolean;
  inspoFile: File | null;
  inspoDataUrl: string | null;
  isDisabled?: boolean;
  onChangeClientNotes: (value: string) => void;
  onChangeInspoFile: (file: File | null, dataUrl: string | null) => void;
}

export function DesignDetailsSection({
  artistName,
  clientNotes,
  allowInspo,
  inspoFile,
  inspoDataUrl,
  isDisabled = false,
  onChangeClientNotes,
  onChangeInspoFile,
}: DesignDetailsSectionProps) {
  const [inspoProgress, setInspoProgress] = useState<number | null>(null);
  const [inspoError, setInspoError] = useState<string | null>(null);
  const who = artistName ?? 'tu profesional';
  const hasNotes = clientNotes.trim().length > 0;
  const hasPhoto = Boolean(inspoDataUrl);

  const summarySubtitle =
    hasPhoto && hasNotes
      ? 'Foto y descripción listas · opcional'
      : hasPhoto
        ? 'Foto de inspiración lista · opcional'
        : hasNotes
          ? 'Descripción lista · opcional'
          : allowInspo
            ? 'Opcional · foto de inspiración o descripción'
            : 'Opcional · forma, largo, colores o alergias';

  const processInspoFile = async (file: File | null) => {
    if (!file) {
      setInspoError(null);
      setInspoProgress(null);
      onChangeInspoFile(null, null);
      return;
    }
    setInspoError(null);
    setInspoProgress(8);
    const prepared = await prepareClientImageFile(file);
    if (prepared.error) {
      setInspoProgress(null);
      setInspoError(prepared.error);
      return;
    }
    setInspoProgress(15);
    try {
      const url = await readFileAsDataUrl(prepared.file, setInspoProgress);
      onChangeInspoFile(prepared.file, url);
    } catch {
      setInspoError('No pudimos abrir esa foto. Prueba con otra en PNG, JPG o WEBP.');
    } finally {
      setInspoProgress(null);
    }
  };

  return (
    <Collapsible
      className="rb-extras"
      defaultIsOpen={hasNotes || hasPhoto}
      trigger={
        <HStack gap={3} align="center" className="rb-extras-trigger">
          <VStack className="rb-extras-plus" align="center" justify="center" aria-hidden="true">
            <Plus size={16} aria-hidden="true" />
          </VStack>
          <VStack gap={0} className="rb-grow">
            <Text weight="semibold">Diseño para {who}</Text>
            <Text type="supporting" color="secondary">
              {summarySubtitle}
            </Text>
          </VStack>
        </HStack>
      }
    >
      <VStack gap={4} paddingBlockStart={3} paddingBlockEnd={2}>
        <Text type="supporting" color="secondary">
          Comparte una referencia o describe lo que te gustaría; si aún no lo tienes definido, lo pueden revisar en tu cita.
        </Text>

        {allowInspo ? (
          <UploadDropzone
            label="Foto de inspiración"
            previewUrl={inspoDataUrl}
            previewAlt={inspoFile ? `Tu foto de inspiración ${inspoFile.name}` : 'Tu foto de inspiración'}
            fileName={inspoFile?.name ?? null}
            fileSizeLabel={inspoFile ? formatFileSize(inspoFile.size) : null}
            progress={inspoProgress}
            error={inspoError}
            isDisabled={isDisabled}
            isOptional
            helperText="Una sola foto. Sirve una captura de Pinterest o Instagram, o una foto de tu galería."
            placeholder="Sube la foto del diseño que te gustó"
            readyLabel="Foto lista"
            onSelectFile={(file) => void processInspoFile(file)}
            onClear={() => void processInspoFile(null)}
          />
        ) : null}

        <TextArea
          label="Descripción del diseño"
          placeholder="Ej. Almendra corta en tono cherry, con un detalle dorado. Traigo gel de otro salón."
          description="Forma, largo, colores, si traes algo puesto o si tienes alguna alergia."
          value={clientNotes}
          onChange={onChangeClientNotes}
          isDisabled={isDisabled}
          isOptional
          rows={4}
        />
      </VStack>
    </Collapsible>
  );
}
