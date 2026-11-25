'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { Link } from '@astryxdesign/core/Link';
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import type {
  GalleryItem,
  ServiceAddon,
  ServiceCategory,
} from '@/lib/types';
import type {
  PublicServiceDTO,
  PublicSettingsDTO,
  PublicStaffDTO,
} from '@/lib/public-dto';
import { buildWhatsAppLink, formatCurrency, formatDuration } from '@/lib/format';
import { PublicShell } from './PublicShell';
import { useSalonAppearance } from './SalonThemeProvider';
import {
  DEFAULT_SISTER_STUDIO_HANDLE,
  formatServicePrice,
  getStaffScheduleLabel,
  normalizeInstagramHandle,
  resolveInstagramUrl,
} from './booking/bookingHelpers';

interface LandingViewProps {
  initialSettings: PublicSettingsDTO;
  categories: ServiceCategory[];
  services: PublicServiceDTO[];
  addons: ServiceAddon[];
  staff: PublicStaffDTO[];
  gallery: GalleryItem[];
  reviewsSummary: { count: number; average: number };
}

export function LandingView({
  initialSettings,
  categories,
  services,
  addons,
  staff,
  gallery,
  reviewsSummary,
}: LandingViewProps) {
  const { settings: liveSettings } = useSalonAppearance();
  const settings = liveSettings ?? initialSettings;

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGalleryCat, setSelectedGalleryCat] = useState<string>('all');

  const filteredServices = useMemo(() => {
    if (selectedCategory === 'all') return services;
    return services.filter((s) => s.categoryId === selectedCategory);
  }, [services, selectedCategory]);

  const galleryCategories = useMemo(() => {
    const unique = Array.from(new Set(gallery.map((g) => g.category)));
    return ['all', ...unique];
  }, [gallery]);

  const filteredGallery = useMemo(() => {
    if (selectedGalleryCat === 'all') return gallery;
    return gallery.filter((g) => g.category === selectedGalleryCat);
  }, [gallery, selectedGalleryCat]);

  const whatsappUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, me gustaría información para agendar mis uñas.`,
  );
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const sisterStudioHandle = normalizeInstagramHandle(
    settings.sisterStudioHandle,
    DEFAULT_SISTER_STUDIO_HANDLE,
  );
  const cityLabel = settings.city || 'Puebla, México';
  const customCover = settings.coverImageUrl?.trim();
  const depositAmount = formatCurrency(
    settings.depositAmountCents ?? 20000,
    settings.currency,
  );
  const depositBeneficiary =
    settings.depositBeneficiary || settings.depositAccountHolder;

  return (
    <PublicShell>
      <Section variant="muted" paddingBlock={10} paddingInline={4} dividers={['bottom']}>
        <VStack
          gap={6}
          maxWidth={1160}
          width="100%"
          style={{ marginInline: 'auto' }}
        >
          <Grid columns={{ minWidth: 425, max: 2 }} gap={6} align="center" width="100%">
            <VStack gap={5} maxWidth={480} align="start">
              <VStack gap={2}>
                <Text type="label" weight="semibold" color="accent">
                  {settings.landingContent.heroEyebrow || cityLabel}
                </Text>
                <Heading
                  level={1}
                  type="display-1"
                  weight="normal"
                  textWrap="balance"
                  style={{
                    fontSize: 'clamp(var(--text-display-1-size), 5.9vw, calc(var(--text-display-1-size) * 1.76))',
                    lineHeight: 1.02,
                    maxWidth: '12ch',
                  }}
                >
                  {settings.landingContent.heroTitle}
                </Heading>
                <Text type="large" color="secondary" textWrap="pretty">
                  {settings.landingContent.heroSubtitle}
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Agendar mi cita ahora"
                  variant="primary"
                  size="lg"
                  icon={<CalendarCheck size={18} />}
                  href="/reservar"
                />
                <Button
                  label="Ver servicios y precios"
                  variant="secondary"
                  size="lg"
                  href="#servicios"
                />
              </HStack>
              <HStack gap={2} wrap="wrap" align="center">
                <StatusDot variant="success" label="Agenda abierta en tiempo real" aria-hidden="true" />
                <Text type="supporting" color="secondary">
                  Agenda abierta en tiempo real
                </Text>
              </HStack>
            </VStack>
            <VStack as="figure" gap={2} style={{ margin: 0 }}>
              <Image
                src={customCover || '/brand/laikona-sets-instagram.webp'}
                alt={customCover ? '' : 'Dos sets de Laikona: uñas con cuadros, rayas y lunares, y uñas rojas con relieves y bordes dorados'}
                width={808}
                height={640}
                fetchPriority="high"
                loading="eager"
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                  aspectRatio: '808 / 640',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-element)',
                }}
              />
              {customCover ? null : (
                <HStack as="figcaption" gap={2} wrap="wrap" justify="between">
                  <Text type="supporting" color="secondary">Sets de Karla Rodríguez</Text>
                  <Link href={instagramUrl} type="supporting" isExternalLink>
                    Ver más sets en Instagram
                  </Link>
                </HStack>
              )}
            </VStack>
          </Grid>
          <Divider />
          <HStack gap={4} wrap="wrap" align="center" justify="between">
            <HStack gap={4} wrap="wrap">
              {customCover ? (
                <Link href={instagramUrl} type="supporting" isExternalLink>
                  {instagramHandle}
                </Link>
              ) : null}
              <Link href={whatsappUrl} type="supporting" isExternalLink>
                WhatsApp
              </Link>
              {reviewsSummary.count > 0 ? (
                <Text type="supporting" color="secondary">
                  {reviewsSummary.average} de 5 · {reviewsSummary.count}{' '}
                  {reviewsSummary.count === 1 ? 'reseña' : 'reseñas'}
                </Text>
              ) : null}
            </HStack>
            <Text type="supporting" color="secondary">Anticipo de {depositAmount}</Text>
          </HStack>
        </VStack>
      </Section>

      <Section variant="transparent" paddingBlock={8} paddingInline={4}>
        <VStack
          gap={6}
          maxWidth={1160}
          width="100%"
          style={{ marginInline: 'auto' }}
          id="servicios"
        >
          <HStack justify="between" align="end" wrap="wrap" gap={4}>
            <VStack gap={1.5} maxWidth={660}>
              <Heading level={2}>Menú de servicios</Heading>
              <Text color="secondary">
                Consulta precios y duración. Puedes combinar servicios y agregar extras al reservar.
              </Text>
            </VStack>
            <Button
              label="Abrir agenda completa"
              variant="secondary"
              icon={<ArrowRight size={16} />}
              href="/reservar"
            />
          </HStack>

          <TabList value={selectedCategory} onChange={setSelectedCategory} hasDivider>
            <Tab value="all" label="Todos los servicios" />
            {categories.map((cat) => (
              <Tab key={cat.id} value={cat.id} label={cat.name} />
            ))}
          </TabList>

          <Grid columns={{ minWidth: 310, max: 3 }} gap={4} width="100%">
            {filteredServices.map((srv) => (
              <Card key={srv.id} padding={5} elevation="low">
                <VStack gap={4} height="100%" justify="between">
                  <VStack gap={2}>
                    <HStack justify="between" align="start" gap={2}>
                      <Heading level={3}>{srv.name}</Heading>
                      <Text weight="semibold" size="lg" hasTabularNumbers>
                        {formatServicePrice(srv.priceCents, srv.isStartingPrice, settings.currency)}
                      </Text>
                    </HStack>

                    <HStack gap={2} wrap="wrap" align="center">
                      <Token
                        size="sm"
                        icon={<Clock size={12} />}
                        label={`Aprox. ${formatDuration(srv.durationMinutes)}`}
                      />
                      {srv.depositRequired ? (
                        <Token
                          size="sm"
                          color="orange"
                          label={`Anticipo ${formatCurrency(srv.depositAmountCents, settings.currency)}`}
                        />
                      ) : null}
                      {srv.allowInspoPhoto ? (
                        <Token size="sm" color="pink" label="Admite foto inspo" />
                      ) : null}
                    </HStack>

                    <Text type="supporting" color="secondary">
                      {srv.description}
                    </Text>
                  </VStack>

                  <HStack justify="between" align="center" gap={2}>
                    <Link href={`/reservar/${srv.slug}`} type="supporting">
                      Ver horarios libres
                    </Link>
                    <Button
                      label="Reservar"
                      variant="primary"
                      size="sm"
                      href={`/reservar/${srv.slug}`}
                    />
                  </HStack>
                </VStack>
              </Card>
            ))}
          </Grid>

          {addons.length > 0 ? (
            <Card variant="muted" padding={5}>
              <VStack gap={3}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <VStack gap={0.5}>
                    <Heading level={3}>Extras y Nail Art combinables</Heading>
                    <Text type="supporting" color="secondary">
                      Agrégalos durante tu reserva junto con servicios adicionales para apartar el tiempo exacto sin esperar cotizaciones por mensaje.
                    </Text>
                  </VStack>
                  <Sparkles size={20} aria-hidden="true" />
                </HStack>
                <Divider />
                <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
                  {addons.map((addon) => (
                    <VStack key={addon.id} gap={0.5}>
                      <HStack justify="between" align="center" gap={2}>
                        <Text weight="medium">{addon.name}</Text>
                        <Text type="supporting" weight="semibold" hasTabularNumbers>
                          +{formatCurrency(addon.extraPriceCents, settings.currency)}
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary">
                        +{addon.extraMinutes} min · {addon.description}
                      </Text>
                    </VStack>
                  ))}
                </Grid>
              </VStack>
            </Card>
          ) : null}
        </VStack>
      </Section>

      <Section variant="muted" paddingBlock={8} paddingInline={4} dividers={['top', 'bottom']}>
        <VStack
          gap={6}
          maxWidth={1160}
          width="100%"
          style={{ marginInline: 'auto' }}
          id="galeria"
        >
          <HStack justify="between" align="end" wrap="wrap" gap={4}>
            <VStack gap={1.5} maxWidth={640}>
              <Heading level={2}>Ideas para tu próximo set</Heading>
              <Text color="secondary">
                Elige una idea para llevar como referencia a tu cita.
              </Text>
            </VStack>
            <Button
              label={`Ver más en ${instagramHandle}`}
              variant="secondary"
              size="sm"
              icon={<ExternalLink size={15} />}
              href={instagramUrl}
            />
          </HStack>

          <TabList value={selectedGalleryCat} onChange={setSelectedGalleryCat}>
            {galleryCategories.map((cat) => (
              <Tab
                key={cat}
                value={cat}
                label={cat === 'all' ? 'Todos' : cat}
              />
            ))}
          </TabList>

          <Grid columns={{ minWidth: 250, max: 4 }} gap={4} width="100%">
            {filteredGallery.map((item) => {
              const linkedService = services.find((s) => s.id === item.serviceId);
              const reserveHref = linkedService
                ? `/reservar/${linkedService.slug}?inspo=${encodeURIComponent(item.title)}`
                : `/reservar?inspo=${encodeURIComponent(item.title)}`;
              return (
                <Card key={item.id} padding={3} elevation="low">
                  <VStack gap={3} height="100%" justify="between">
                    <VStack gap={2}>
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        style={{
                          width: '100%',
                          aspectRatio: '4 / 3',
                          objectFit: 'cover',
                          borderRadius: 'var(--radius-inner)',
                        }}
                      />
                      <VStack gap={1}>
                        <HStack justify="between" align="center" gap={2}>
                          <Text weight="semibold">{item.title}</Text>
                          <Token size="sm" label={item.category} />
                        </HStack>
                        <Text type="supporting" color="secondary">
                          {item.caption}
                        </Text>
                      </VStack>
                    </VStack>
                    <Button
                      label="Quiero este diseño"
                      variant="secondary"
                      size="sm"
                      width="100%"
                      href={reserveHref}
                    />
                  </VStack>
                </Card>
              );
            })}
          </Grid>
        </VStack>
      </Section>

      <Section variant="transparent" paddingBlock={8} paddingInline={4}>
        <VStack
          gap={8}
          maxWidth={1160}
          width="100%"
          style={{ marginInline: 'auto' }}
          id="politicas"
        >
          {staff.length > 0 ? (
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={2}>
                  {staff.length === 1 ? 'Tu Nail Artist' : 'Nuestro equipo y turnos fijos'}
                </Heading>
                <Text color="secondary">
                  Cada especialista trabaja en bloques dedicados para cuidar los detalles de tu set sin prisas.
                </Text>
              </VStack>
              <Grid columns={{ minWidth: 280, max: 3 }} gap={4}>
                {staff.map((member) => {
                  const scheduleLabel = getStaffScheduleLabel(member);
                  return (
                    <Card key={member.id} padding={5}>
                      <VStack gap={3} height="100%" justify="between">
                        <VStack gap={2}>
                          <HStack gap={3} align="center">
                            <Avatar
                              name={member.name}
                              src={member.avatarUrl ?? undefined}
                              size="lg"
                            />
                            <VStack gap={0.5}>
                              <Heading level={3}>{member.name}</Heading>
                              <Text type="supporting" color="accent" weight="medium">
                                {member.roleTitle}
                              </Text>
                            </VStack>
                          </HStack>
                          {scheduleLabel ? (
                            <Token
                              size="sm"
                              icon={<Clock size={12} />}
                              label={scheduleLabel}
                            />
                          ) : null}
                          <Text type="supporting" color="secondary">
                            {member.bio}
                          </Text>
                        </VStack>
                        <Button
                          label={`Agendar con ${member.name.split(' ')[0]}`}
                          variant="secondary"
                          size="sm"
                          width="100%"
                          href={`/reservar?staff=${member.bookingSlug}`}
                        />
                      </VStack>
                    </Card>
                  );
                })}
              </Grid>
            </VStack>
          ) : null}

          <Grid columns={{ minWidth: 320, max: 2 }} gap={5}>
            <Card padding={5}>
              <VStack gap={3}>
                <Heading level={3}>{settings.landingContent.aboutTitle}</Heading>
                <Text color="secondary">{settings.landingContent.aboutBody}</Text>
                <Divider />
                <List hasDividers>
                  <ListItem
                    label={`Anticipo transparente de ${depositAmount} (${settings.depositBankName})`}
                    description={
                      <VStack gap={1}>
                        <Text type="supporting" color="secondary">
                          Aparta tu lugar por transferencia SPEI a {settings.depositBankName} ({depositBeneficiary}) y sube tu comprobante al reservar o envíalo por Instagram DM a {instagramHandle}.
                        </Text>
                        {settings.depositClabe ? (
                          <Text type="code" weight="semibold" hasTabularNumbers>
                            CLABE: {settings.depositClabe}
                          </Text>
                        ) : null}
                      </VStack>
                    }
                  />
                  <ListItem
                    label="Política de cancelación y reagendado"
                    description={
                      <Text type="supporting" color="secondary">
                        {settings.cancellationPolicyText}
                      </Text>
                    }
                  />
                  <ListItem
                    label="Antes de tu cita"
                    description={
                      <Text type="supporting" color="secondary">
                        {settings.bookingInstructionsText}
                      </Text>
                    }
                  />
                </List>
              </VStack>
            </Card>

            <Card padding={5} variant="muted">
              <VStack gap={4} height="100%" justify="between">
                <VStack gap={3}>
                  <HStack gap={2} align="center">
                    <MapPin size={18} aria-hidden="true" />
                    <Heading level={3}>Visítanos en {cityLabel}</Heading>
                  </HStack>
                  <Text weight="medium">{settings.address}</Text>
                  <Text type="supporting" color="secondary">
                    Atención únicamente con cita previa junto a {sisterStudioHandle}. Al confirmar tu reserva recibirás la ubicación exacta y botón directo para agregarla a Google Calendar, Apple o Outlook.
                  </Text>
                </VStack>

                <HStack gap={2} wrap="wrap">
                  <Button
                    label="Agendar cita en línea"
                    variant="primary"
                    href="/reservar"
                  />
                  <Button
                    label="Abrir en Google Maps"
                    variant="secondary"
                    href={settings.mapsUrl}
                  />
                  <Button
                    label={instagramHandle}
                    variant="ghost"
                    icon={<ExternalLink size={15} />}
                    href={instagramUrl}
                  />
                  <Button
                    label="WhatsApp"
                    variant="ghost"
                    icon={<MessageCircle size={15} />}
                    href={whatsappUrl}
                  />
                </HStack>
              </VStack>
            </Card>
          </Grid>
        </VStack>
      </Section>
    </PublicShell>
  );
}
