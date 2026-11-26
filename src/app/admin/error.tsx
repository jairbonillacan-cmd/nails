'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CalendarDays, LayoutDashboard, RotateCcw } from 'lucide-react';
import { LANDING_ASSETS } from '@/components/landing/landingContent';
import { useSalonAppearance } from '@/components/SalonThemeProvider';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { settings } = useSalonAppearance();
  const referenceCode = error.digest?.trim();

  return (
    <VStack as="main" className="ad-login-wrap" gap={0}>
      <VStack className="ad-login-card ad-boundary-card fx-fade-up" gap={0}>
        <VStack className="ad-boundary-hero" gap={3} align="center">
          <img
            src={LANDING_ASSETS.logoWhite}
            alt={settings.name}
            width={136}
            height={38}
            className="lk-boundary-logo"
          />
          <Text color="inherit" className="ad-boundary-code">
            {referenceCode ? `Ref · ${referenceCode}` : 'Aviso temporal'}
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
            className="ad-boundary-wave"
            viewBox="0 0 1440 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
          </svg>
        </VStack>

        <VStack className="ad-boundary-body" gap={5} align="center">
          <VStack gap={2} align="center">
            <Heading level={1} className="lk-serif lk-boundary-title" justify="center">
              No pudimos abrir esta vista
            </Heading>
            <Text color="secondary" justify="center" textWrap="pretty">
              Tus citas, clientas y cobros siguen a salvo. Intenta recargar esta pantalla o regresa al
              inicio del panel.
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
              label="Inicio del panel"
              variant="secondary"
              size="lg"
              className="fx-press"
              icon={<LayoutDashboard size={16} aria-hidden="true" />}
              href="/admin"
            />
          </HStack>

          <Button
            label="Ver agenda"
            variant="ghost"
            size="md"
            className="fx-press"
            icon={<CalendarDays size={15} aria-hidden="true" />}
            href="/admin/citas"
          />
        </VStack>
      </VStack>
    </VStack>
  );
}
