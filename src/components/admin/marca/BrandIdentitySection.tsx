'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { ExternalLink, Store } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { SalonSettings } from '@/lib/types';

type ActiveServiceMode = NonNullable<SalonSettings['serviceMode']>;

interface BrandIdentitySectionProps {
  draft: SalonSettings;
  brandLogo: string;
  activeServiceMode: ActiveServiceMode;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
}

function serviceModeLabel(mode: ActiveServiceMode): string {
  if (mode === 'home') return 'A domicilio';
  if (mode === 'online') return 'Solo en línea';
  return 'En estudio';
}

export function BrandIdentitySection({
  draft,
  brandLogo,
  activeServiceMode,
  onUpdateDraft,
}: BrandIdentitySectionProps) {
  return (
    <SurfaceCard
      id="brand-identity-heading"
      icon={<Store size={16} aria-hidden="true" />}
      title="Nombre, logo y datos del salón"
      subtitle="Así aparece tu estudio en tu página de reservas y en tus recordatorios."
      badge={<StatusTag tone="neutral" label={serviceModeLabel(activeServiceMode)} />}
    >
      <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
        <HStack
          className="ad-subpanel"
          justify="between"
          align="center"
          gap={3}
          wrap="wrap"
        >
          <HStack gap={3} align="center">
            <img
              src={brandLogo}
              alt={draft.name}
              width={118}
              height={34}
              className="ad-logo"
            />
            <VStack gap={0}>
              <Text weight="semibold" size="sm">
                Logo del salón
              </Text>
              <Text type="supporting" color="secondary">
                Se adapta solo a modo claro y oscuro.
              </Text>
            </VStack>
          </HStack>
          <Button
            label="Ver mi página"
            variant="secondary"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href="/"
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>

        <TextInput
          label="Nombre del salón"
          value={draft.name}
          onChange={(v) => onUpdateDraft({ name: v })}
          isRequired
        />
        <TextInput
          label="Frase corta debajo del nombre"
          value={draft.tagline}
          onChange={(v) => onUpdateDraft({ tagline: v })}
        />
        <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
          <TextInput
            label="Instagram del salón"
            placeholder="@laikona.nailsss"
            value={draft.instagramHandle}
            onChange={(v) => onUpdateDraft({ instagramHandle: v })}
          />
          <TextInput
            label="WhatsApp del salón (+52...)"
            value={draft.whatsappNumber}
            onChange={(v) => onUpdateDraft({ whatsappNumber: v })}
          />
        </Grid>
        <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
          <TextInput
            label="Ciudad"
            placeholder="Puebla, México"
            value={draft.city ?? ''}
            onChange={(v) => onUpdateDraft({ city: v })}
            isOptional
          />
          <Selector
            label="Dónde atiendes"
            value={activeServiceMode}
            onChange={(v) => {
              if (v === 'studio' || v === 'home' || v === 'online') {
                onUpdateDraft({ serviceMode: v });
              }
            }}
            options={[
              { value: 'studio', label: 'En mi estudio' },
              { value: 'home', label: 'A domicilio' },
              { value: 'online', label: 'Solo en línea' },
            ]}
          />
        </Grid>
        <TextInput
          label="Dirección del salón"
          value={draft.address}
          onChange={(v) => onUpdateDraft({ address: v })}
        />
        <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
          <TextInput
            label="Link de Google Maps"
            value={draft.mapsUrl}
            onChange={(v) => onUpdateDraft({ mapsUrl: v })}
          />
          <TextInput
            label="Link de Instagram"
            placeholder="https://www.instagram.com/laikona.nailsss/"
            value={draft.instagramUrl ?? ''}
            onChange={(v) => onUpdateDraft({ instagramUrl: v })}
            isOptional
          />
        </Grid>
      </VStack>
    </SurfaceCard>
  );
}
