'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Clock, Home, RotateCcw } from 'lucide-react';
import { LANDING_ASSETS } from '@/components/landing/landingContent';

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
            {referenceCode ? `Ref · ${referenceCode}` : 'Interrupción temporal'}
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
              Algo salió mal
            </Heading>
            <Text color="secondary" justify="center" textWrap="pretty">
              No pudimos completar esta vista en este momento. Tus datos y citas siguen a salvo;
              intenta recargar o vuelve al inicio.
            </Text>
          </VStack>

          <HStack gap={2} justify="center" wrap="wrap" width="100%">
            <Button
              type="button"
              label="Intentar de nuevo"
              variant="primary"
              size="lg"
              className="fx-press"
              icon={<RotateCcw size={16} aria-hidden="true" />}
              onClick={reset}
            />
            <Button
              label="Volver al inicio"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<Home size={16} aria-hidden="true" />}
              href="/"
            />
          </HStack>

          <HStack gap={2} justify="center" wrap="wrap">
            <Button
              label="Consultar mis citas"
              variant="ghost"
              size="md"
              className="fx-press"
              icon={<Clock size={15} aria-hidden="true" />}
              href="/mis-citas"
            />
          </HStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
