'use client';

import { useMemo, useState } from 'react';
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
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Star,
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

  return (
    <PublicShell>

      <Section variant="section" paddingBlock={10} paddingInline={4} dividers={['bottom']}>
        <VStack
          gap={6}
          maxWidth={920}
          width="100%"
          align="center"
          style={{ marginInline: 'auto' }}
        >
          <HStack gap={2} align="center" wrap="wrap" justify="center">
            <StatusDot variant="success" label="Agenda abierta en tiempo real" isPulsing />
            <Text type="label" color="secondary">
              {settings.landingContent.heroEyebrow}
            </Text>
          </HStack>

          <VStack gap={3} align="center" maxWidth={780}>
            <Heading level={1} type="display-1" justify="center" textWrap="balance">
              {settings.landingContent.heroTitle}
            </Heading>
            <Text type="large" color="secondary" justify="center" textWrap="pretty">
              {settings.landingContent.heroSubtitle}
            </Text>
          </VStack>

          <HStack gap={3} wrap="wrap" justify="center">
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
            <Button
              label="Escribir por WhatsApp"
              variant="ghost"
              size="lg"
              icon={<MessageCircle size={18} />}
              href={whatsappUrl}
            />
          </HStack>

          <HStack gap={4} wrap="wrap" justify="center" paddingBlockStart={2}>
            <Token
              label={`${reviewsSummary.average} ★ (${reviewsSummary.count} reseñas verificadas)`}
              icon={<Star size={14} />}
            />
            <Token
              label="Confirmación al instante + Google / Apple Calendar"
              icon={<CalendarCheck size={14} />}
            />
            <Token label="Sin crear cuenta · Reagenda en 1 clic" icon={<ShieldCheck size={14} />} />
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
            <VStack gap={1.5} maxWidth={640}>
              <Text type="label" color="accent" weight="semibold">
                MENÚ DE SERVICIOS
              </Text>
              <Heading level={2}>Elige tu técnica y personaliza tu tiempo</Heading>
              <Text color="secondary">
                Precios transparentes y duraciones reales. Al reservar puedes sumar retiro, nail art o acabados especiales con cálculo automático.
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
                        {formatCurrency(srv.priceCents, settings.currency)}
                      </Text>
                    </HStack>

                    <HStack gap={2} wrap="wrap" align="center">
                      <Token
                        size="sm"
                        icon={<Clock size={12} />}
                        label={formatDuration(srv.durationMinutes)}
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
                      Agrégalos durante tu reserva para ajustar el tiempo exacto en tu cita sin cotizaciones eternas por mensaje.
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
          <VStack gap={1.5} maxWidth={640}>
            <Text type="label" color="accent" weight="semibold">
              PORTAFOLIO RECIENTE
            </Text>
            <Heading level={2}>Inspiración del estudio</Heading>
            <Text color="secondary">
              ¿Te gustó algún diseño? Elígelo directamente para reservar el servicio exacto con esa referencia adjunta.
            </Text>
          </VStack>

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
                <Text type="label" color="accent" weight="semibold">
                  ESPECIALISTAS
                </Text>
                <Heading level={2}>
                  {staff.length === 1 ? 'Tu Nail Artist' : 'Nuestro equipo'}
                </Heading>
              </VStack>
              <Grid columns={{ minWidth: 300, max: 2 }} gap={4}>
                {staff.map((member) => (
                  <Card key={member.id} padding={5}>
                    <HStack gap={4} align="start">
                      <Avatar name={member.name} src={member.avatarUrl ?? undefined} size="lg" />
                      <VStack gap={1.5}>
                        <VStack gap={0.5}>
                          <Heading level={3}>{member.name}</Heading>
                          <Text type="supporting" color="accent" weight="medium">
                            {member.roleTitle}
                          </Text>
                        </VStack>
                        <Text type="supporting" color="secondary">
                          {member.bio}
                        </Text>
                        <HStack paddingBlockStart={1}>
                          <Button
                            label={`Agendar con ${member.name.split(' ')[0]}`}
                            variant="secondary"
                            size="sm"
                            href={`/reservar?staff=${member.bookingSlug}`}
                          />
                        </HStack>
                      </VStack>
                    </HStack>
                  </Card>
                ))}
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
                    <Heading level={3}>Visítanos</Heading>
                  </HStack>
                  <Text weight="medium">{settings.address}</Text>
                  <Text type="supporting" color="secondary">
                    Atención únicamente con cita previa. Al confirmar tu reserva recibirás la ubicación exacta y botón directo para agregarla a Google Calendar, Apple o Outlook.
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
                </HStack>
              </VStack>
            </Card>
          </Grid>
        </VStack>
      </Section>
    </PublicShell>
  );
}
