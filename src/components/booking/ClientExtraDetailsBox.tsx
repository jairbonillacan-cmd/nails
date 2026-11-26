'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';

interface ClientExtraDetailsBoxProps {
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  emailError: string | null;
  birthdayError: string | null;
  isDisabled: boolean;
  onChangeClientInstagram: (value: string) => void;
  onChangeClientEmail: (value: string) => void;
  onChangeClientBirthday: (value: string) => void;
}

export function ClientExtraDetailsBox({
  clientInstagram,
  clientEmail,
  clientBirthday,
  emailError,
  birthdayError,
  isDisabled,
  onChangeClientInstagram,
  onChangeClientEmail,
  onChangeClientBirthday,
}: ClientExtraDetailsBoxProps) {
  return (
    <VStack as="fieldset" gap={3} className="rb-fieldset">
      <legend className="rb-legend">Opcional</legend>
      <Text type="supporting" color="secondary">
        Puedes dejarlos en blanco.
      </Text>
      <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
        <TextInput
          htmlName="clientInstagram"
          label="Instagram"
          placeholder="@tu.usuario"
          autoCapitalize="off"
          hasAutoCorrect={false}
          description="Para etiquetarte cuando subamos tus uñas"
          value={clientInstagram}
          onChange={onChangeClientInstagram}
          isDisabled={isDisabled}
          isOptional
        />
        <TextInput
          htmlName="clientEmail"
          label="Correo"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          hasAutoCorrect={false}
          description="Te mandamos la cita para tu calendario"
          value={clientEmail}
          onChange={onChangeClientEmail}
          isDisabled={isDisabled}
          isOptional
          status={emailError ? { type: 'error', message: emailError } : undefined}
          statusVariant="detached"
        />
        <TextInput
          htmlName="clientBirthday"
          label="Cumpleaños"
          placeholder="DD/MM/AAAA"
          inputMode="numeric"
          autoComplete="bday"
          description="En tu mes te llega un detalle de nuestra parte"
          value={clientBirthday}
          onChange={onChangeClientBirthday}
          isDisabled={isDisabled}
          isOptional
          status={birthdayError ? { type: 'error', message: birthdayError } : undefined}
          statusVariant="detached"
        />
      </Grid>
    </VStack>
  );
}
