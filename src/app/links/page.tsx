import type { Metadata } from 'next';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Section } from '@astryxdesign/core/Section';
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
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import { getSnapshot } from '@/lib/repositories/db';
import { PublicShell } from '@/components/PublicShell';
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

  return {
    title: 'Links',
    description: `Accesos directos de ${settings.name} (${instagramHandle}) en Puebla: agenda tu cita en línea, catálogo de servicios, galería, WhatsApp y ubicación.`,
    alternates: { canonical: '/links' },
  };
}

export default function LinksPage() {
  const db = getSnapshot();
  const settings = toPublicSettingsDTO(db.settings);
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
  const badgeSrc = settings.logoUrl?.trim() || '/laikona-logo.svg';

  return (
    <PublicShell>
      <Section variant="muted" paddingBlock={8} paddingInline={4}>
        <VStack
          gap={5}
          maxWidth={540}
          width="100%"
          align="center"
          style={{ marginInline: 'auto' }}
        >
          <Card padding={6} elevation="low" width="100%">
            <VStack gap={5} align="center" width="100%">
              <VStack gap={2} align="center" width="100%">
                <img
                  src={badgeSrc}
                  alt={settings.name}
                  style={{
                    height: '4.5rem',
                    width: 'auto',
                    display: 'block',
                    borderRadius: 'var(--radius-md)',
                  }}
                />
                <Heading level={1} justify="center" textWrap="balance">
                  {settings.name}
                </Heading>
                <Text type="supporting" color="accent" weight="semibold" justify="center">
                  {instagramHandle}
                </Text>
                <HStack gap={1.5} align="center" justify="center" wrap="wrap">
                  <MapPin size={14} aria-hidden="true" />
                  <Text type="supporting" color="secondary" justify="center">
                    {settings.address}
                  </Text>
                </HStack>
                <Text type="supporting" color="secondary" justify="center" textWrap="pretty">
                  {settings.tagline}
                </Text>
              </VStack>

              <HStack gap={2} justify="center" wrap="wrap">
                <Token
                  label={`Turnos fijos con ${staffSummary}`}
                  size="sm"
                  icon={<Clock size={14} aria-hidden="true" />}
                />
                <Token
                  label={`Anticipo ${depositLabel}`}
                  size="sm"
                  icon={<Sparkles size={14} aria-hidden="true" />}
                />
              </HStack>

              <VStack gap={3} width="100%">
                <Button
                  label="Agendar mi cita ahora"
                  variant="primary"
                  size="lg"
                  width="100%"
                  icon={<CalendarCheck size={18} aria-hidden="true" />}
                  href="/reservar"
                />
                <Button
                  label="Ver catálogo y precios"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  icon={<Sparkles size={18} aria-hidden="true" />}
                  href="/#servicios"
                />
                <Button
                  label="Galería de diseños"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  icon={<ImageIcon size={18} aria-hidden="true" />}
                  href="/#galeria"
                />
                <Button
                  label="Escribir por WhatsApp"
                  variant="secondary"
                  size="lg"
                  width="100%"
                  icon={<MessageCircle size={18} aria-hidden="true" />}
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
                <Button
                  label={`Seguir en Instagram (${instagramHandle})`}
                  variant="secondary"
                  size="lg"
                  width="100%"
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
                size="md"
                width="100%"
                icon={<ShieldCheck size={16} aria-hidden="true" />}
                href="/aviso-de-privacidad"
              />
            </VStack>
          </Card>

          {featuredServices.length > 0 ? (
            <Card padding={5} width="100%">
              <VStack gap={3} width="100%">
                <Heading level={2} justify="center">
                  Reserva directo por servicio
                </Heading>
                <List hasDividers density="balanced">
                  {featuredServices.map((service) => (
                    <ListItem
                      key={service.id}
                      href={`/reservar/${encodeURIComponent(service.slug)}`}
                      label={service.name}
                      description={
                        <Text type="supporting" color="secondary">
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
            </Card>
          ) : null}
        </VStack>
      </Section>
    </PublicShell>
  );
}
