import '../../cita.css';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CalendarDays, Clock, Home } from 'lucide-react';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

export default function CitaNotFound() {
  return (
    <VStack as="main" className="lk-root lk-boundary" gap={0}>
      <VStack className="lk-boundary-card fx-fade-up" gap={0}>
        <VStack className="lk-boundary-hero" gap={3} align="center">
          <img
            src={LANDING_ASSETS.logoWhite}
            alt="LAIKONA NAILS"
            width={136}
            height={38}
            className="lk-boundary-logo"
          />
          <Text color="inherit" className="lk-boundary-code-on-cherry">
            Enlace de cita no encontrado
          </Text>
          <img
            src={LANDING_ASSETS.strokePorcelain}
            alt=""
            aria-hidden="true"
            width={136}
            height={16}
            className="lk-boundary-stroke"
          />
          <svg
            className="lk-boundary-wave"
            viewBox="0 0 1440 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
          </svg>
        </VStack>

        <VStack className="lk-boundary-body" gap={5} align="center">
          <VStack gap={2} align="center">
            <Heading level={1} className="lk-serif lk-boundary-title" justify="center">
              No encontramos esta cita
            </Heading>
            <Text color="secondary" justify="center" textWrap="pretty">
              Revisa que el enlace de WhatsApp o correo esté completo. También puedes ver todas tus
              visitas y tu tarjeta de sellos con tu número de celular.
            </Text>
          </VStack>

          <HStack gap={2} justify="center" wrap="wrap" width="100%">
            <Button
              label="Buscar en Mis citas"
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<Clock size={16} aria-hidden="true" />}
              href="/mis-citas"
            />
            <Button
              label="Agendar nueva cita"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<CalendarDays size={16} aria-hidden="true" />}
              href="/reservar"
            />
          </HStack>

          <Button
            label="Volver al inicio"
            variant="ghost"
            size="md"
            className="fx-press"
            icon={<Home size={15} aria-hidden="true" />}
            href="/"
          />
        </VStack>
      </VStack>
    </VStack>
  );
}
