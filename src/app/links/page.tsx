import type { Metadata } from 'next';
import '../cita.css';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import {
  ArrowRight,
  AtSign,
  CalendarCheck,
  Clock,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { buildWhatsAppLink, formatCurrency, formatDuration } from '@/lib/format';
import { resolveLandingContent } from '@/lib/landing-config';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import { PublicShell } from '@/components/PublicShell';
import { LANDING_ASSETS, servicePhoto } from '@/components/landing/landingContent';
import {
  formatServicePrice,
  normalizeInstagramHandle,
  resolveInstagramUrl,
} from '@/components/booking/bookingHelpers';

export const dynamic = 'force-dynamic';

function formatSpanishList(items: string[]): string {
  if (items.length === 0) return 'nuestras especialistas';
  if (items.length === 1) return items[0] ?? 'nuestras especialistas';
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function resolveSafeExternalUrl(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const cityShort = (settings.city || 'Puebla').split(',')[0]?.trim() || 'Puebla';
  const title = 'Enlaces rápidos y citas';
  const description = `Accesos directos de ${settings.name} (${instagramHandle}) en ${cityShort}: agenda tu cita en línea, catálogo de uñas, galería, WhatsApp y ubicación.`;
  const socialTitle = `${title} · ${settings.name}`;

  return {
    title,
    description,
    alternates: { canonical: '/links' },
    openGraph: {
      title: socialTitle,
      description,
      url: '/links',
      siteName: settings.name,
      locale: 'es_MX',
      type: 'website',
      images: [
        {
          url: '/opengraph-image',
          width: 1200,
          height: 630,
          alt: `${settings.name} — Enlaces rápidos y citas en ${cityShort}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: ['/twitter-image'],
    },
  };
}

export default function LinksPage() {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
  const landing = resolveLandingContent(settings);
  const activeStaff = db.staff
    .filter((member) => member.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .map(toPublicStaffDTO);
  const featuredServices = db.services
    .filter((service) => service.isActive && !service.isPrivate && service.isFeatured)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, 4)
    .map(toPublicServiceDTO);

  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const mapsUrl = resolveSafeExternalUrl(
    settings.mapsUrl,
    'https://maps.google.com/?q=Puebla+Mexico',
  );
  const whatsappUrl = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, vengo desde tu bio de Instagram y quiero agendar una cita.`,
  );
  const depositCents = settings.depositAmountCents ?? 20000;
  const depositLabel = `${formatCurrency(depositCents, settings.currency)} ${settings.currency}`;
  const staffSummary = formatSpanishList(activeStaff.map((member) => member.name));

  return (
    <PublicShell>
      <VStack gap={0} width="100%">
        <VStack as="section" className="rb-hero ck-hero" aria-labelledby="links-title">
          <VStack gap={3} align="center" className="rb-wrap rb-hero-inner fx-fade-up" maxWidth={560} style={{ textAlign: 'center' }}>
            <img
              src={landing.customLogoUrl || LANDING_ASSETS.logoWhite}
              alt={settings.name}
              width={200}
              height={84}
              fetchPriority="high"
              decoding="async"
              style={{ height: '3.5rem', width: 'auto', objectFit: 'contain', display: 'block' }}
            />
            <VStack gap={1.5} align="center">
              <Heading level={1} id="links-title" color="inherit" justify="center" textWrap="balance" className="lk-serif rb-hero-title">
                {settings.name}
              </Heading>
              <img
                className="rb-hero-stroke"
                src={LANDING_ASSETS.strokePorcelain}
                alt=""
                width={180}
                height={20}
                decoding="async"
              />
            </VStack>
            <Text color="inherit" weight="semibold" justify="center">
              {instagramHandle}
            </Text>
            <HStack gap={1.5} align="center" justify="center" wrap="wrap" className="lk-soft">
              <MapPin size={15} aria-hidden="true" />
              <Text type="supporting" color="inherit" justify="center" textWrap="pretty">
                {settings.address}
              </Text>
            </HStack>
            <Text type="supporting" color="inherit" justify="center" textWrap="pretty" className="ck-hero-sub">
              {settings.tagline}
            </Text>
          </VStack>
          <svg
            className="rb-hero-wave"
            viewBox="0 0 1440 40"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
          </svg>
        </VStack>

        <VStack paddingBlock={6} paddingInline={4} width="100%">
          <VStack
            gap={5}
            maxWidth={560}
            width="100%"
            align="center"
            style={{ marginInline: 'auto' }}
          >
            <VStack gap={5} align="center" width="100%" className="ck-panel fx-fade-up">
              <HStack gap={2} justify="center" wrap="wrap">
                <Token
                  label={`${landing.visitHoursDays} · Solo con cita`}
                  size="md"
                  icon={<CalendarCheck size={14} aria-hidden="true" />}
                />
                <Token
                  label={`Turnos fijos con ${staffSummary}`}
                  size="md"
                  icon={<Clock size={14} aria-hidden="true" />}
                />
                <Token
                  label={`Anticipo ${depositLabel}`}
                  size="md"
                  icon={<Sparkles size={14} aria-hidden="true" />}
                />
              </HStack>

              <VStack gap={3} width="100%" className="fx-stagger">
                <Button
                  label="Agendar mi cita ahora"
                  variant="primary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<CalendarCheck size={18} aria-hidden="true" />}
                  href="/reservar"
                />
                <Button
                  label="Mis citas y sellos"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<Clock size={18} aria-hidden="true" />}
                  href="/mis-citas"
                />
                <Button
                  label="Ver catálogo y precios"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<Sparkles size={18} aria-hidden="true" />}
                  href="/#servicios"
                />
                <Button
                  label="Galería de diseños"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<ImageIcon size={18} aria-hidden="true" />}
                  href="/#galeria"
                />
                <Button
                  label="Escribir por WhatsApp"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<MessageCircle size={18} aria-hidden="true" />}
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
                <Button
                  label={`Instagram · ${instagramHandle}`}
                  variant="secondary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<AtSign size={18} aria-hidden="true" />}
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
                <Button
                  label="Cómo llegar (Google Maps)"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  className="fx-press"
                  icon={<MapPin size={18} aria-hidden="true" />}
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </VStack>

              <Divider />

              <Button
                label="Aviso de privacidad"
                variant="ghost"
                size="lg"
                width="100%"
                className="fx-press"
                icon={<ShieldCheck size={16} aria-hidden="true" />}
                href="/aviso-de-privacidad"
              />
            </VStack>

            {featuredServices.length > 0 ? (
              <VStack gap={3} width="100%" className="ck-panel fx-fade-up">
                <VStack gap={0.5} align="center">
                  <Heading level={2} justify="center" className="lk-serif ck-h3">
                    Reserva directo por servicio
                  </Heading>
                  <Text type="supporting" color="secondary" justify="center">
                    Elige tu favorito y entra directo a elegir día y hora.
                  </Text>
                </VStack>
                <List hasDividers density="balanced">
                  {featuredServices.map((service) => (
                    <ListItem
                      key={service.id}
                      href={`/reservar/${encodeURIComponent(service.slug)}`}
                      label={service.name}
                      startContent={
                        <img
                          src={servicePhoto(service.slug, service.imageUrl)}
                          alt=""
                          width={48}
                          height={48}
                          loading="lazy"
                          decoding="async"
                          style={{
                            width: '3rem',
                            height: '3rem',
                            objectFit: 'cover',
                            borderRadius: '0.75rem',
                            display: 'block',
                          }}
                        />
                      }
                      description={
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {formatDuration(service.durationMinutes)} ·{' '}
                          {formatServicePrice(
                            service.priceCents,
                            service.isStartingPrice,
                            settings.currency,
                          )}
                        </Text>
                      }
                      endContent={<ArrowRight size={16} aria-hidden="true" />}
                    />
                  ))}
                </List>
              </VStack>
            ) : null}
          </VStack>
        </VStack>
      </VStack>
    </PublicShell>
  );
}
