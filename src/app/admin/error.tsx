'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
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
      <VStack className="ad-boundary-card" gap={0}>
        <VStack className="ad-boundary-hero" gap={3} align="center">
          <img
            src={LANDING_ASSETS.logoWhite}
            alt={settings.name}
            width={132}
            height={36}
            className="lk-boundary-logo"
          />
          <Text color="inherit" className="ad-boundary-code">
            {referenceCode ? `Referencia · ${referenceCode}` : 'Interrupción temporal'}
          </Text>
        </VStack>

        <VStack className="ad-boundary-body" gap={5} align="center">
          <VStack gap={2} align="center">
            <Heading level={1} className="lk-serif lk-boundary-title" justify="center">
              No pudimos abrir esta vista
            </Heading>
            <Text color="secondary" justify="center" textWrap="pretty">
              Tus citas, clientas y cobros siguen a salvo. Recarga esta vista o vuelve al resumen del
              salón.
            </Text>
          </VStack>

          <Divider />

          <HStack gap={2} justify="center" wrap="wrap" width="100%">
            <Button
              type="button"
              label="Intentar de nuevo"
              variant="primary"
              size="md"
              className="fx-press"
              icon={<RotateCcw size={15} aria-hidden="true" />}
              onClick={reset}
            />
            <Button
              label="Ir al resumen"
              variant="secondary"
              size="md"
              className="fx-press"
              icon={<LayoutDashboard size={15} aria-hidden="true" />}
              href="/admin"
            />
            <Button
              label="Ver agenda"
              variant="ghost"
              size="md"
              className="fx-press"
              icon={<CalendarDays size={15} aria-hidden="true" />}
              href="/admin/citas"
            />
          </HStack>
        </VStack>
      </VStack>
    </VStack>
  );
}
