import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CalendarDays, Home } from 'lucide-react';

export default function NotFound() {
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
          <Text className="lk-boundary-code">Error 404</Text>
          <Heading level={1} className="lk-serif" justify="center">
            No encontramos esta página
          </Heading>
          <Text color="secondary" justify="center">
            El enlace pudo haber cambiado o ya no está disponible. Puedes agendar una cita en línea
            o regresar a la página principal del estudio.
          </Text>
        </VStack>

        <HStack gap={2} justify="center" wrap="wrap" width="100%">
          <Button
            label="Agendar cita"
            variant="primary"
            size="md"
            icon={<CalendarDays size={16} aria-hidden="true" />}
            href="/reservar"
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
