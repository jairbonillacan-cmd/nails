'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Clock,
  Image as ImageIcon,
  LayoutGrid,
  Megaphone,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import { UploadDropzone } from '@/components/ui/UploadDropzone';
import {
  formatFileSize,
  readFileAsDataUrl,
  validateClientImageFile,
} from '@/components/booking/bookingHelpers';
import {
  DEFAULT_HERO_DESKTOP_IMAGE,
  DEFAULT_HERO_MOBILE_IMAGE,
  resolveLandingContent,
} from '@/lib/landing-config';
import { formatCurrency } from '@/lib/format';
import type {
  LandingContent,
  LandingSectionToggles,
  SalonSettings,
} from '@/lib/types';

interface LandingContentEditorSectionProps {
  draft: SalonSettings;
  defaultLogo: string;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
}

const SECTION_SWITCHES: ReadonlyArray<{
  key: keyof LandingSectionToggles;
  label: string;
  description: string;
}> = [
  {
    key: 'showMenu',
    label: 'Menú de servicios',
    description: 'Lista de precios, tiempos y categorías.',
  },
  {
    key: 'showCreations',
    label: 'Galería de creaciones',
    description: 'Carrusel visual con tus mejores sets.',
  },
  {
    key: 'showReviews',
    label: 'Reseñas de clientas',
    description: 'Opiniones y calificación en estrellas.',
  },
  {
    key: 'showTeam',
    label: 'Equipo de profesionales',
    description: 'Perfiles de profesionales y acceso directo.',
  },
  {
    key: 'showConnect',
    label: 'Sección de Instagram',
    description: 'Invitación para seguirte y guardar ideas.',
  },
  {
    key: 'showFaq',
    label: 'Preguntas frecuentes',
    description: 'Dudas de anticipo, retoque y cancelaciones.',
  },
  {
    key: 'showVisit',
    label: 'Dirección y horarios',
    description: 'Tarjeta de ubicación, horario y botón de ruta.',
  },
  {
    key: 'showMapEmbed',
    label: 'Mapa de Google',
    description: 'Mapa interactivo junto a la dirección.',
  },
];

export function LandingContentEditorSection({
  draft,
  defaultLogo,
  onUpdateDraft,
}: LandingContentEditorSectionProps) {
  const resolved = resolveLandingContent(draft);
  const [desktopUploadError, setDesktopUploadError] = useState<string | null>(null);
  const [desktopFileMeta, setDesktopFileMeta] = useState<{ name: string; size: string } | null>(
    null,
  );
  const [mobileUploadError, setMobileUploadError] = useState<string | null>(null);
  const [mobileFileMeta, setMobileFileMeta] = useState<{ name: string; size: string } | null>(
    null,
  );
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [logoFileMeta, setLogoFileMeta] = useState<{ name: string; size: string } | null>(null);

  const patchLanding = (patch: Partial<LandingContent>) => {
    onUpdateDraft({
      landingContent: {
        ...draft.landingContent,
        ...patch,
      },
    });
  };

  const toggleSection = (key: keyof LandingSectionToggles, value: boolean) => {
    patchLanding({
      sections: {
        ...draft.landingContent.sections,
        [key]: value,
      },
    });
  };

  const handleImagePick = async (
    file: File | null,
    target: 'desktop' | 'mobile' | 'logo',
  ) => {
    if (!file) return;
    const setErr =
      target === 'desktop'
        ? setDesktopUploadError
        : target === 'mobile'
          ? setMobileUploadError
          : setLogoUploadError;
    const setMeta =
      target === 'desktop'
        ? setDesktopFileMeta
        : target === 'mobile'
          ? setMobileFileMeta
          : setLogoFileMeta;

    setErr(null);
    const validationErr = await validateClientImageFile(file);
    if (validationErr) {
      setErr(validationErr);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setMeta({ name: file.name, size: formatFileSize(file.size) });
      if (target === 'desktop') {
        onUpdateDraft({
          coverImageUrl: dataUrl,
          landingContent: {
            ...draft.landingContent,
            heroImageDesktopUrl: dataUrl,
          },
        });
      } else if (target === 'mobile') {
        patchLanding({ heroImageMobileUrl: dataUrl });
      } else {
        onUpdateDraft({ logoUrl: dataUrl });
      }
    } catch {
      setErr('No se pudo leer la imagen seleccionada. Intenta con otro archivo.');
    }
  };

  const customDesktopHero =
    draft.landingContent.heroImageDesktopUrl ?? draft.coverImageUrl ?? null;
  const customMobileHero = draft.landingContent.heroImageMobileUrl ?? null;
  const customLogo = draft.logoUrl ?? null;
  const marqueeList = draft.landingContent.marqueeItems ?? [];
  const depositLabel = formatCurrency(draft.depositAmountCents ?? 20000, draft.currency);
  const defaultMarqueePresets = [
    'Acrílico escultural · Softgel · Rubber',
    resolved.visitHoursDays,
    draft.paymentMode !== 'none' ? `Anticipo ${depositLabel}` : 'Reserva en línea',
    draft.city?.trim() || 'Puebla',
  ];

  const updateMarqueeItem = (index: number, nextText: string) => {
    const next = marqueeList.map((item, idx) => (idx === index ? nextText : item));
    patchLanding({ marqueeItems: next });
  };

  const removeMarqueeItem = (index: number) => {
    patchLanding({ marqueeItems: marqueeList.filter((_, idx) => idx !== index) });
  };

  return (
    <VStack gap={4}>
      <SurfaceCard
        id="landing-hero-heading"
        icon={<ImageIcon size={16} aria-hidden="true" />}
        title="Portada principal"
        subtitle="Lo primero que ven tus clientas al entrar."
        badge={
          <StatusTag
            tone={customDesktopHero ? 'accent' : 'neutral'}
            label={customDesktopHero ? 'Foto propia' : 'Foto original'}
          />
        }
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <TextInput
            label="Título principal"
            placeholder="El arte está en tus uñas"
            value={draft.landingContent.heroTitle}
            onChange={(v) => patchLanding({ heroTitle: v })}
          />
          <TextArea
            label="Subtítulo de la portada"
            placeholder="Acrílico escultural, Softgel y Rubber en Puebla. Tú traes la idea."
            value={draft.landingContent.heroSubtitle}
            onChange={(v) => patchLanding({ heroSubtitle: v })}
            rows={3}
          />
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              label="Botón principal"
              placeholder="Agendar cita"
              value={draft.landingContent.heroPrimaryCta ?? ''}
              onChange={(v) => patchLanding({ heroPrimaryCta: v })}
            />
            <TextInput
              label="Botón secundario"
              placeholder="Ver creaciones"
              value={draft.landingContent.heroSecondaryCta ?? ''}
              onChange={(v) => patchLanding({ heroSecondaryCta: v })}
            />
          </Grid>

          <Switch
            label="Mostrar calificación en estrellas sobre la portada"
            description="Se muestra automáticamente cuando ya tienes reseñas publicadas."
            value={resolved.sections.showHeroRating}
            onChange={(v) => toggleSection('showHeroRating', v)}
          />

          <Divider />

          <VStack gap={3}>
            <HStack justify="between" align="center" gap={2} wrap="wrap">
              <VStack gap={0}>
                <Text weight="semibold" size="sm">
                  Foto de fondo de la portada
                </Text>
                <Text type="supporting" color="secondary">
                  Se recomienda una foto horizontal luminosa de tus sets (PNG, JPG o WEBP).
                </Text>
              </VStack>
              {customDesktopHero ? (
                <Button
                  type="button"
                  label="Restaurar original"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} aria-hidden="true" />}
                  onClick={() => {
                    setDesktopFileMeta(null);
                    setDesktopUploadError(null);
                    onUpdateDraft({
                      coverImageUrl: null,
                      landingContent: {
                        ...draft.landingContent,
                        heroImageDesktopUrl: null,
                      },
                    });
                  }}
                />
              ) : null}
            </HStack>

            <VStack className="ad-hero-thumb">
              <img
                src={customDesktopHero || DEFAULT_HERO_DESKTOP_IMAGE}
                alt="Vista actual de la portada"
                className="ad-hero-thumb-img"
              />
            </VStack>

            <UploadDropzone
              label="Foto de portada (computadora)"
              previewUrl={customDesktopHero}
              previewAlt="Foto personalizada de portada"
              fileName={desktopFileMeta?.name ?? (customDesktopHero ? 'Portada personalizada' : null)}
              fileSizeLabel={desktopFileMeta?.size ?? null}
              error={desktopUploadError}
              placeholder="Elige o arrastra una foto para tu portada"
              readyLabel="Foto lista para guardar"
              replaceLabel="Cambiar foto"
              clearLabel="Quitar foto"
              isOptional
              onSelectFile={(file) => void handleImagePick(file, 'desktop')}
              onClear={() => {
                setDesktopFileMeta(null);
                setDesktopUploadError(null);
                onUpdateDraft({
                  coverImageUrl: null,
                  landingContent: {
                    ...draft.landingContent,
                    heroImageDesktopUrl: null,
                  },
                });
              }}
            />

            <Collapsible
              className="ad-disclosure"
              defaultIsOpen={Boolean(customMobileHero || customLogo)}
              trigger={
                <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
                  <VStack gap={0}>
                    <Text weight="semibold" size="sm">
                      Foto para celular y logo propio
                    </Text>
                    <Text type="supporting" color="secondary">
                      Opcional: sube una foto vertical distinta para celular o cambia tu logo.
                    </Text>
                  </VStack>
                  <StatusTag
                    label={customMobileHero || customLogo ? 'Personalizado' : 'Opcional'}
                    tone={customMobileHero || customLogo ? 'accent' : 'neutral'}
                  />
                </HStack>
              }
            >
              <VStack gap={4} paddingBlockStart={3}>
                <UploadDropzone
                  label="Foto vertical para celular"
                  previewUrl={customMobileHero}
                  previewAlt="Foto vertical para celular"
                  fileName={mobileFileMeta?.name ?? (customMobileHero ? 'Portada móvil propia' : null)}
                  fileSizeLabel={mobileFileMeta?.size ?? null}
                  error={mobileUploadError}
                  helperText={
                    customDesktopHero
                      ? 'Si la dejas vacía, usaremos tu foto de portada principal.'
                      : `Si la dejas vacía, mostramos ${DEFAULT_HERO_MOBILE_IMAGE.replace('/landing/', '')}.`
                  }
                  placeholder="Elige una foto vertical (opcional)"
                  readyLabel="Portada móvil lista"
                  replaceLabel="Cambiar foto"
                  clearLabel="Usar automática"
                  isOptional
                  onSelectFile={(file) => void handleImagePick(file, 'mobile')}
                  onClear={() => {
                    setMobileFileMeta(null);
                    setMobileUploadError(null);
                    patchLanding({ heroImageMobileUrl: null });
                  }}
                />

                <Divider />

                <VStack gap={2}>
                  <HStack justify="between" align="center" gap={2} wrap="wrap">
                    <Text weight="semibold" size="sm">
                      Logo propio del estudio
                    </Text>
                    <VStack className="ad-logo-preview-stage">
                      <img
                        src={customLogo || defaultLogo}
                        alt={draft.name}
                        className="ad-logo-sm"
                      />
                    </VStack>
                  </HStack>
                  <UploadDropzone
                    label="Logo personalizado"
                    previewUrl={customLogo}
                    previewAlt={`Logo de ${draft.name}`}
                    fileName={logoFileMeta?.name ?? (customLogo ? 'Logo propio activo' : null)}
                    fileSizeLabel={logoFileMeta?.size ?? null}
                    error={logoUploadError}
                    helperText="PNG con fondo transparente recomendado · máximo 2.5 MB."
                    placeholder="Sube tu logo en PNG o WEBP (opcional)"
                    readyLabel="Logo listo para guardar"
                    replaceLabel="Cambiar logo"
                    clearLabel="Restaurar logo original"
                    isOptional
                    onSelectFile={(file) => void handleImagePick(file, 'logo')}
                    onClear={() => {
                      setLogoFileMeta(null);
                      setLogoUploadError(null);
                      onUpdateDraft({ logoUrl: null });
                    }}
                  />
                </VStack>
              </VStack>
            </Collapsible>
          </VStack>
        </VStack>
      </SurfaceCard>

      <SurfaceCard
        id="landing-marquee-heading"
        icon={<Megaphone size={16} aria-hidden="true" />}
        title="Cinta superior de avisos"
        subtitle="La franja de arriba con promociones u horarios."
      >
        <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
          <Switch
            label="Mostrar cinta superior en movimiento"
            value={resolved.sections.showMarquee}
            onChange={(v) => toggleSection('showMarquee', v)}
          />

          {resolved.sections.showMarquee ? (
            marqueeList.length === 0 ? (
              <HStack
                className="ad-subpanel"
                justify="between"
                align="center"
                gap={3}
                wrap="wrap"
              >
                <VStack gap={0.5}>
                  <Text size="sm" weight="medium">
                    Frases automáticas activas
                  </Text>
                  <Text type="supporting" color="secondary">
                    Muestra tus técnicas, horario, anticipo y ciudad sin que tengas que escribir nada.
                  </Text>
                </VStack>
                <Button
                  type="button"
                  label="Personalizar frases"
                  variant="secondary"
                  size="sm"
                  onClick={() => patchLanding({ marqueeItems: defaultMarqueePresets })}
                />
              </HStack>
            ) : (
              <VStack gap={3}>
                {marqueeList.map((phrase, idx) => (
                  <HStack key={`marquee-${idx}`} gap={2} align="end">
                    <VStack style={{ flex: '1 1 auto', minWidth: 0 }}>
                      <TextInput
                        label={`Frase ${idx + 1}`}
                        isLabelHidden={idx > 0}
                        placeholder="Ej. Promo de mayo · 10% en tu primer Softgel"
                        value={phrase}
                        onChange={(v) => updateMarqueeItem(idx, v)}
                      />
                    </VStack>
                    <Button
                      type="button"
                      label="Quitar"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={14} aria-hidden="true" />}
                      onClick={() => removeMarqueeItem(idx)}
                    />
                  </HStack>
                ))}
                <HStack gap={2} wrap="wrap" justify="between" align="center">
                  <Button
                    type="button"
                    label="Agregar frase"
                    variant="secondary"
                    size="sm"
                    icon={<Plus size={14} aria-hidden="true" />}
                    isDisabled={marqueeList.length >= 6}
                    onClick={() => patchLanding({ marqueeItems: [...marqueeList, ''] })}
                  />
                  <Button
                    type="button"
                    label="Volver a automáticas"
                    variant="ghost"
                    size="sm"
                    icon={<RotateCcw size={14} aria-hidden="true" />}
                    onClick={() => patchLanding({ marqueeItems: [] })}
                  />
                </HStack>
              </VStack>
            )
          ) : null}
        </VStack>
      </SurfaceCard>

      <SurfaceCard
        id="landing-sections-heading"
        icon={<LayoutGrid size={16} aria-hidden="true" />}
        title="Secciones visibles en tu página"
        subtitle="Apaga lo que no quieras mostrar. El menú se ajusta solo."
      >
        <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
          <Grid columns={{ minWidth: 210, max: 2 }} gap={3}>
            {SECTION_SWITCHES.map((item) => (
              <VStack key={item.key} className="ad-subpanel">
                <Switch
                  label={item.label}
                  description={item.description}
                  value={resolved.sections[item.key]}
                  onChange={(v) => toggleSection(item.key, v)}
                />
              </VStack>
            ))}
          </Grid>
        </VStack>
      </SurfaceCard>

      <SurfaceCard
        id="landing-hours-copy-heading"
        icon={<Clock size={16} aria-hidden="true" />}
        title="Horarios visibles y aviso del menú"
        subtitle="Lo que ven tus clientas en la tarjeta de ubicación y arriba de tu lista de precios."
      >
        <VStack gap={4} className="ad-card-body" paddingBlockStart={4}>
          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
            <TextInput
              label="Días de atención"
              placeholder="Lunes a sábado"
              value={draft.landingContent.visitHoursDays ?? ''}
              onChange={(v) => patchLanding({ visitHoursDays: v })}
              isOptional
            />
            <TextInput
              label="Horario y nota"
              placeholder="De 10:00 a 18:00 · Solo con cita"
              value={draft.landingContent.visitHoursText ?? ''}
              onChange={(v) => patchLanding({ visitHoursText: v })}
              isOptional
            />
          </Grid>

          <TextInput
            label="Aviso opcional encima del menú"
            placeholder="Ej. Todas nuestras aplicaciones incluyen preparación en seco"
            value={draft.landingContent.menuBannerText ?? ''}
            onChange={(v) => patchLanding({ menuBannerText: v })}
            isOptional
          />

          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
                <HStack gap={2} align="center">
                  <Type size={15} aria-hidden="true" />
                  <VStack gap={0}>
                    <Text weight="semibold" size="sm">
                      Personalizar títulos de cada sección
                    </Text>
                    <Text type="supporting" color="secondary">
                      Cambia los encabezados de Menú, Creaciones, Reseñas, Equipo, Instagram y Ubicación.
                    </Text>
                  </VStack>
                </HStack>
                <StatusTag label="Opcional" tone="neutral" />
              </HStack>
            }
          >
            <VStack gap={3} paddingBlockStart={3}>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <TextInput
                  label="Título del menú"
                  placeholder="El menú"
                  value={draft.landingContent.menuTitle ?? ''}
                  onChange={(v) => patchLanding({ menuTitle: v })}
                  isOptional
                />
                <TextInput
                  label="Título de ubicación"
                  placeholder="Visítanos"
                  value={draft.landingContent.visitTitle ?? ''}
                  onChange={(v) => patchLanding({ visitTitle: v })}
                  isOptional
                />
              </Grid>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <TextInput
                  label="Título de creaciones"
                  placeholder="Algunas de nuestras creaciones"
                  value={draft.landingContent.creationsTitle ?? ''}
                  onChange={(v) => patchLanding({ creationsTitle: v })}
                  isOptional
                />
                <TextInput
                  label="Subtítulo de creaciones"
                  placeholder="Del french minimal al 3D con charms..."
                  value={draft.landingContent.creationsSubtitle ?? ''}
                  onChange={(v) => patchLanding({ creationsSubtitle: v })}
                  isOptional
                />
              </Grid>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <TextInput
                  label="Título de reseñas"
                  placeholder="De tu idea a tus uñas"
                  value={draft.landingContent.reviewsTitle ?? ''}
                  onChange={(v) => patchLanding({ reviewsTitle: v })}
                  isOptional
                />
                <TextInput
                  label="Subtítulo de reseñas"
                  placeholder="Opiniones verificadas de clientas..."
                  value={draft.landingContent.reviewsSubtitle ?? ''}
                  onChange={(v) => patchLanding({ reviewsSubtitle: v })}
                  isOptional
                />
              </Grid>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <TextInput
                  label="Título del equipo"
                  placeholder="Elige a tu profesional"
                  value={draft.landingContent.teamTitle ?? ''}
                  onChange={(v) => patchLanding({ teamTitle: v })}
                  isOptional
                />
                <TextInput
                  label="Subtítulo del equipo"
                  placeholder="Una clienta por bloque..."
                  value={draft.landingContent.teamSubtitle ?? ''}
                  onChange={(v) => patchLanding({ teamSubtitle: v })}
                  isOptional
                />
              </Grid>
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <TextInput
                  label="Título de Instagram"
                  placeholder="Conectemos"
                  value={draft.landingContent.connectTitle ?? ''}
                  onChange={(v) => patchLanding({ connectTitle: v })}
                  isOptional
                />
                <TextInput
                  label="Subtítulo de Instagram"
                  placeholder="Sets nuevos cada semana..."
                  value={draft.landingContent.connectSubtitle ?? ''}
                  onChange={(v) => patchLanding({ connectSubtitle: v })}
                  isOptional
                />
              </Grid>
            </VStack>
          </Collapsible>
        </VStack>
      </SurfaceCard>
    </VStack>
  );
}
