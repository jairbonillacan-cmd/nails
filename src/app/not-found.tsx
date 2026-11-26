import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CalendarDays, Clock, Home, Sparkles } from 'lucide-react';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

export default function NotFound() {
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
            Error 404
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
              No encontramos esta página
            </Heading>
            <Text color="secondary" justify="center" textWrap="pretty">
              El enlace pudo haber cambiado o ya no está disponible. Puedes agendar tu próxima cita,
              consultar tus visitas o volver al inicio del estudio.
            </Text>
          </VStack>

          <HStack gap={2} justify="center" wrap="wrap" width="100%">
            <Button
              label="Agendar cita"
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<CalendarDays size={16} aria-hidden="true" />}
              href="/reservar"
            />
            <Button
              label="Mis citas"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<Clock size={16} aria-hidden="true" />}
              href="/mis-citas"
            />
          </HStack>

          <HStack gap={2} justify="center" wrap="wrap">
            <Button
              label="Volver al inicio"
              variant="ghost"
              size="md"
              className="fx-press"
              icon={<Home size={15} aria-hidden="true" />}
              href="/"
            />
            <Button
              label="Accesos rápidos"
              variant="ghost"
              size="md"
              className="fx-press"
              icon={<Sparkles size={15} aria-hidden="true" />}
              href="/links"
            />
          </HStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
