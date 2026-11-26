'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Clock, Lock } from 'lucide-react';
import { CopyableField, StatusTag, SurfaceCard } from '@/components/ui';
import {
  formatServicePriceLabel,
  ServiceThumbnail,
} from '@/components/admin/servicios/ServiceThumbnail';
import { formatCurrency, formatDuration } from '@/lib/format';
import type { Service } from '@/lib/types';

interface ServiceLivePreviewProps {
  draft: Partial<Service>;
  categoryName: string | null;
  currency: 'MXN' | 'USD';
  appUrl: string;
}

export function ServiceLivePreview({
  draft,
  categoryName,
  currency,
  appUrl,
}: ServiceLivePreviewProps) {
  const baseOrigin = (
    appUrl.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://laikona.nails')
  ).replace(/\/+$/, '');
  const directUrl = draft.slug ? `${baseOrigin}/reservar/${draft.slug}` : null;

  return (
    <SurfaceCard
      id="service-preview-heading"
      tone="subtle"
      padded
      title="Vista previa en vivo"
      subtitle="Así lo verá tu clienta al elegir su servicio."
      badge={<StatusDot variant="success" label="Vista previa activa" isPulsing />}
    >
      <VStack gap={3} paddingBlockStart={2}>
        <HStack justify="between" align="start" gap={3}>
          <HStack gap={3} align="center" className="rb-grow">
            <ServiceThumbnail
              slug={draft.slug || 'rubber'}
              imageUrl={draft.imageUrl ?? null}
              size="preview"
            />
            <VStack gap={0.5} className="rb-grow">
              {categoryName ? (
                <Text type="supporting" color="accent" weight="semibold" size="sm">
                  {categoryName}
                </Text>
              ) : null}
              <Heading level={3} className="lk-serif ad-h3">
                {draft.name || 'Nombre del servicio'}
              </Heading>
              <Text weight="bold" size="base" className="fx-tabular" hasTabularNumbers>
                {formatServicePriceLabel(
                  draft.priceCents ?? 0,
                  draft.isStartingPrice,
                  currency,
                )}
              </Text>
            </VStack>
          </HStack>
        </HStack>

        <HStack gap={1.5} wrap="wrap">
          <StatusTag
            tone="neutral"
            icon={<Clock size={12} aria-hidden="true" />}
            label={formatDuration(draft.durationMinutes ?? 60)}
            hasTabularNumbers
          />
          {draft.depositRequired ? (
            <StatusTag
              tone="warning"
              label={`Anticipo ${formatCurrency(draft.depositAmountCents ?? 0, currency)}`}
              hasTabularNumbers
            />
          ) : null}
          {draft.isPrivate ? (
            <StatusTag
              tone="accent"
              icon={<Lock size={12} aria-hidden="true" />}
              label="Solo link privado"
            />
          ) : null}
        </HStack>

        {draft.description ? (
          <Text type="supporting" color="secondary">
            {draft.description}
          </Text>
        ) : null}

        {directUrl ? (
          <CopyableField
            label="Link directo del servicio"
            value={directUrl}
            displayValue={`/reservar/${draft.slug}`}
            copyLabel="Copiar link"
            copiedLabel="Link copiado"
            feedbackMessage={`Link directo copiado: /reservar/${draft.slug}`}
            monospace
          />
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
