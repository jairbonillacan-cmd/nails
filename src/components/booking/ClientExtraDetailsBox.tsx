'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Cake, Plus } from 'lucide-react';

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
  const hasAnyValue = Boolean(clientInstagram.trim() || clientEmail.trim() || clientBirthday.trim());
  const hasError = Boolean(emailError || birthdayError);
  const filledCount = [clientInstagram, clientEmail, clientBirthday].filter((v) => v.trim()).length;

  return (
    <Collapsible
      key={hasError ? 'extras-error' : 'extras'}
      className="rb-extras"
      defaultIsOpen={hasAnyValue || hasError}
      trigger={
        <HStack gap={3} align="center" className="rb-extras-trigger">
          <VStack className="rb-extras-plus" align="center" justify="center" aria-hidden="true">
            <Plus size={16} aria-hidden="true" />
          </VStack>
          <VStack gap={0} className="rb-grow">
            <Text weight="semibold">Agrega más (opcional)</Text>
            <Text type="supporting" color="secondary">
              {filledCount > 0
                ? `${filledCount} de 3 agregados`
                : 'Instagram, correo y cumpleaños'}
            </Text>
          </VStack>
        </HStack>
      }
    >
      <VStack gap={4} paddingBlockStart={3} paddingBlockEnd={1}>
        <TextInput
          htmlName="clientInstagram"
          label="Instagram"
          placeholder="tu.usuario"
          autoCapitalize="off"
          hasAutoCorrect={false}
          startIcon={<BrandIcon name="instagram" size={1.25} />}
          description="Para etiquetarte cuando subamos tus uñas."
          value={clientInstagram}
          onChange={onChangeClientInstagram}
          isDisabled={isDisabled}
        />
        <TextInput
          htmlName="clientEmail"
          label="Correo"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          hasAutoCorrect={false}
          startIcon={<BrandIcon name="contacto" size={1.25} />}
          description="Te mandamos la cita para agregarla a tu calendario."
          value={clientEmail}
          onChange={onChangeClientEmail}
          isDisabled={isDisabled}
          status={emailError ? { type: 'error', message: emailError } : undefined}
          statusVariant="detached"
        />
        <TextInput
          htmlName="clientBirthday"
          label="Cumpleaños"
          placeholder="DD/MM/AAAA"
          inputMode="numeric"
          autoComplete="bday"
          startIcon={<Cake size={16} aria-hidden="true" />}
          description="En tu mes te llega un detalle de nuestra parte."
          value={clientBirthday}
          onChange={onChangeClientBirthday}
          isDisabled={isDisabled}
          status={birthdayError ? { type: 'error', message: birthdayError } : undefined}
          statusVariant="detached"
        />
      </VStack>
    </Collapsible>
  );
}
