'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Sparkles } from 'lucide-react';
import { CopyableField, StatusTag, SurfaceCard } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { SalonSettings } from '@/lib/types';

type ActiveServiceMode = NonNullable<SalonSettings['serviceMode']>;

interface BrandGallerySectionProps {
  draft: SalonSettings;
  brandLogo: string;
  activeServiceMode: ActiveServiceMode;
  isDepositEnabled: boolean;
  depositAmountCents: number;
  depositBeneficiary: string;
}

function serviceModeLabel(mode: ActiveServiceMode): string {
  if (mode === 'home') return 'A domicilio';
  if (mode === 'online') return 'Solo en línea';
  return 'En estudio';
}

export function BrandGallerySection({
  draft,
  brandLogo,
  activeServiceMode,
  isDepositEnabled,
  depositAmountCents,
  depositBeneficiary,
}: BrandGallerySectionProps) {
  return (
    <SurfaceCard
      id="brand-live-preview-heading"
      tone="subtle"
      padded
      icon={<Sparkles size={16} aria-hidden="true" />}
      title="Vista previa en vivo"
      subtitle="Así ven tu salón tus clientas mientras cambias los colores."
      badge={<StatusDot variant="success" label="Vista previa activa" isPulsing />}
    >
      <SurfaceCard padded className="fx-card-lift">
        <VStack gap={3}>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center">
              <img
                src={brandLogo}
                alt=""
                width={88}
                height={25}
                className="ad-logo-sm"
              />
              <VStack gap={0}>
                <Text weight="bold" size="sm">
                  {draft.name}
                </Text>
                <Text type="supporting" color="secondary">
                  {draft.city || 'Puebla, México'}
                </Text>
              </VStack>
            </HStack>
            <Button label="Agendar cita" variant="primary" size="sm" href="/reservar" />
          </HStack>
          <Divider />
          <VStack gap={1.5}>
            <HStack gap={1.5} wrap="wrap">
              <Token size="sm" label={draft.landingContent.heroEyebrow} />
              <StatusTag tone="neutral" label={serviceModeLabel(activeServiceMode)} />
            </HStack>
            <Heading level={3} className="lk-serif ad-h2">
              {draft.landingContent.heroTitle}
            </Heading>
            <Text type="supporting" color="secondary">
              {draft.landingContent.heroSubtitle}
            </Text>
          </VStack>
          <HStack gap={2} wrap="wrap">
            <Button label="Agendar ahora" variant="primary" size="sm" href="/reservar" />
            <Button label="Ver servicios" variant="secondary" size="sm" href="/" />
          </HStack>
          {isDepositEnabled ? (
            <VStack className="ad-subpanel" gap={2}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text type="label" color="accent" weight="semibold" hasTabularNumbers>
                  ANTICIPO SPEI ({formatCurrency(depositAmountCents, draft.currency)})
                </Text>
                <StatusTag
                  tone="neutral"
                  label={draft.depositBankName || 'Mercado Pago'}
                />
              </HStack>
              <Text type="supporting">Titular: {depositBeneficiary}</Text>
              <CopyableField
                label="CLABE"
                value={draft.depositClabe}
                copyLabel="Copiar CLABE"
                copiedLabel="Copiada"
                feedbackMessage="CLABE copiada al portapapeles."
                monospace
              />
            </VStack>
          ) : null}
          <Text type="supporting" color="secondary">
            {draft.address} · {draft.instagramHandle}
          </Text>
        </VStack>
      </SurfaceCard>
    </SurfaceCard>
  );
}
