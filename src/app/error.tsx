'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Home, RotateCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const referenceCode = error.digest?.trim();

  return (
    <VStack as="main" className="lk-root lk-boundary" gap={0}>
      <VStack className="lk-boundary-card fx-fade-up" gap={5} align="center">
        <img
          src="/landing/logo-negro.svg"
          alt="LAIKONA NAILS"
          width={132}
          height={36}
          className="lk-boundary-logo"
        />

        <VStack gap={2} align="center">
          <Text className="lk-boundary-code">
            {referenceCode ? `Ref · ${referenceCode}` : 'Interrupción temporal'}
          </Text>
          <Heading level={1} className="lk-serif" justify="center">
            Algo salió mal
          </Heading>
          <Text color="secondary" justify="center">
            No pudimos completar esta vista en este momento. Tus datos y citas siguen a salvo;
            intenta recargar o vuelve al inicio.
          </Text>
        </VStack>

        <HStack gap={2} justify="center" wrap="wrap" width="100%">
          <Button
            label="Intentar de nuevo"
            variant="primary"
            size="md"
            icon={<RotateCcw size={16} aria-hidden="true" />}
            onClick={reset}
          />
          <Button
            label="Volver al inicio"
            variant="secondary"
            size="md"
            icon={<Home size={16} aria-hidden="true" />}
            href="/"
          />
        </HStack>
      </VStack>
    </VStack>
  );
}
