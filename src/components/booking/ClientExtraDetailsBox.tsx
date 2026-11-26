'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import {
  formatFileSize,
  readFileAsDataUrl,
  validateClientImageFile,
} from './bookingHelpers';

interface ClientExtraDetailsBoxProps {
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  clientNotes: string;
  allowInspo: boolean;
  inspoFile: File | null;
  inspoDataUrl: string | null;
  isDisabled: boolean;
  onChangeClientInstagram: (value: string) => void;
  onChangeClientEmail: (value: string) => void;
  onChangeClientBirthday: (value: string) => void;
  onChangeClientNotes: (value: string) => void;
  onChangeInspoFile: (file: File | null, dataUrl: string | null) => void;
}

export function ClientExtraDetailsBox({
  clientInstagram,
  clientEmail,
  clientBirthday,
  clientNotes,
  allowInspo,
  inspoFile,
  inspoDataUrl,
  isDisabled,
  onChangeClientInstagram,
  onChangeClientEmail,
  onChangeClientBirthday,
  onChangeClientNotes,
  onChangeInspoFile,
}: ClientExtraDetailsBoxProps) {
  const [inspoProgress, setInspoProgress] = useState<number | null>(null);
  const [inspoError, setInspoError] = useState<string | null>(null);

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
      setInspoError('No pudimos leer esta imagen. Intenta con otra foto PNG, JPG o WEBP.');
    } finally {
      setInspoProgress(null);
    }
  };

  return (
    <Collapsible
      className="rb-fold"
      defaultIsOpen={Boolean(clientNotes.trim() || inspoFile)}
      trigger={
        <HStack justify="between" align="center" gap={2} width="100%" style={{ minHeight: '2.75rem' }}>
          <Text weight="semibold">Detalles para tu artista</Text>
          <Text type="supporting" color="secondary">
            {inspoFile ? 'Con foto de inspo' : 'Opcional'}
          </Text>
        </HStack>
      }
    >
      <VStack gap={3} className="rb-fold-body">
        <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
          <TextInput
            label="Instagram"
            placeholder="@tu.usuario"
            autoCapitalize="off"
            value={clientInstagram}
            onChange={onChangeClientInstagram}
            isDisabled={isDisabled}
            isOptional
          />
          <TextInput
            label="Correo"
            type="email"
            autoComplete="email"
            placeholder="tu@correo.com"
            description="Para mandarte la invitación de calendario"
            value={clientEmail}
            onChange={onChangeClientEmail}
            isDisabled={isDisabled}
            isOptional
          />
          <TextInput
            label="Cumpleaños (AAAA-MM-DD)"
            placeholder="1997-08-15"
            autoComplete="bday"
            description="Te mandamos una cortesía en tu mes"
            value={clientBirthday}
            onChange={onChangeClientBirthday}
            isDisabled={isDisabled}
            isOptional
          />
        </Grid>
        <TextArea
          label="Notas o alergias"
          placeholder="Ej. Almendra corta, tono cherry, traigo gel previo..."
          value={clientNotes}
          onChange={onChangeClientNotes}
          isDisabled={isDisabled}
          isOptional
          rows={3}
        />
        {allowInspo ? (
          <UploadDropzone
            label="Foto de inspiración"
            previewUrl={inspoDataUrl}
            previewAlt={
              inspoFile
                ? `Vista previa de inspiración ${inspoFile.name}`
                : 'Vista previa de inspiración'
            }
            fileName={inspoFile?.name ?? null}
            fileSizeLabel={inspoFile ? formatFileSize(inspoFile.size) : null}
            progress={inspoProgress}
            error={inspoError}
            isDisabled={isDisabled}
            isOptional
            helperText="PNG, JPG o WEBP · máximo 2.5 MB."
            placeholder="Elige o arrastra tu diseño de referencia"
            readyLabel="Foto lista"
            onSelectFile={(file) => void processInspoFile(file)}
            onClear={() => void processInspoFile(null)}
          />
        ) : null}
      </VStack>
    </Collapsible>
  );
}
