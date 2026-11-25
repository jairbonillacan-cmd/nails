'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Section } from '@astryxdesign/core/Section';
import { Text } from '@astryxdesign/core/Text';
import { Link } from '@astryxdesign/core/Link';
import { Divider } from '@astryxdesign/core/Divider';
import { CalendarDays, Moon, Sun } from 'lucide-react';
import { useSalonAppearance } from './SalonThemeProvider';
import { buildWhatsAppLink } from '@/lib/format';

const DEFAULT_INSTAGRAM_HANDLE = '@laikona.nailsss';
const DEFAULT_SISTER_STUDIO_HANDLE = '@lumiere.beautymx';

function normalizeInstagramHandle(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.trim() ?? '';
  if (!cleaned) return fallback;
  return cleaned.startsWith('@') ? cleaned : `@${cleaned}`;
}

function buildInstagramUrl(handle: string): string {
  const slug = handle.replace(/^@+/, '').replace(/[^a-zA-Z0-9._]/g, '');
  return `https://www.instagram.com/${encodeURIComponent(slug || 'laikona.nailsss')}/`;
}

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, setMode, settings } = useSalonAppearance();
  const logo = settings.logoUrl?.trim() || '/brand/laikona-logo-instagram.svg';
  const logoColorScheme = mode === 'system' ? 'light dark' : mode;

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const whatsappDirect = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, tengo una consulta sobre citas.`,
  );
  const instagramHandle = normalizeInstagramHandle(
    settings.instagramHandle,
    DEFAULT_INSTAGRAM_HANDLE,
  );
  const instagramUrl = buildInstagramUrl(instagramHandle);
  const sisterStudioHandle = normalizeInstagramHandle(
    'sisterStudioHandle' in settings && typeof settings.sisterStudioHandle === 'string'
      ? settings.sisterStudioHandle
      : null,
    DEFAULT_SISTER_STUDIO_HANDLE,
  );
  const sisterStudioUrl = buildInstagramUrl(sisterStudioHandle);

  return (
    <AppShell
      height="auto"
      variant="surface"
      contentPadding={0}
      topNav={
        <TopNav
          label="Navegación principal del salón"
          heading={
            <TopNavHeading
              headingHref="/"
              logoLabel={`${settings.name} — Inicio`}
              logo={
                <img
                  src={logo}
                  alt=""
                  style={{ height: '2.25rem', width: 'auto', display: 'block', colorScheme: logoColorScheme }}
                />
              }
            />
          }
          startContent={
            <>
              <TopNavItem label="Inicio" href="/" isSelected={pathname === '/'} />
              <TopNavItem label="Servicios" href="/#servicios" />
              <TopNavItem label="Galería" href="/#galeria" />
              <TopNavItem
                label="Reservar"
                href="/reservar"
                isSelected={pathname.startsWith('/reservar')}
              />
            </>
          }
          endContent={
            <HStack gap={2} align="center">
              <Button
                label={mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                variant="ghost"
                size="sm"
                isIconOnly
                icon={mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                onClick={toggleMode}
                tooltip={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              />
              <Button
                label="Panel"
                variant="ghost"
                size="sm"
                href="/admin"
              />
              <Button
                label="Agendar cita"
                variant="primary"
                size="sm"
                icon={<CalendarDays size={16} />}
                href="/reservar"
              />
            </HStack>
          }
        />
      }
    >
      <VStack gap={0} width="100%">
        {children}

        <Section variant="muted" paddingBlock={6} paddingInline={4} dividers={['top']}>
          <VStack gap={4} maxWidth={1160} width="100%" style={{ marginInline: 'auto' }}>
            <HStack gap={6} justify="between" align="start" wrap="wrap">
              <VStack gap={2} maxWidth={380} align="start">
                <img
                  src={logo}
                  alt={settings.name}
                  style={{ height: '3rem', width: 'auto', display: 'block', colorScheme: logoColorScheme }}
                />
                <Text type="supporting" color="secondary">
                  {settings.tagline}
                </Text>
                <Text type="supporting" color="secondary">
                  {settings.address}
                </Text>
              </VStack>

              <HStack gap={6} wrap="wrap">
                <VStack gap={1.5}>
                  <Text type="label" weight="semibold">
                    Reservas
                  </Text>
                  <Link href="/reservar" type="supporting">
                    Agendar en tiempo real
                  </Link>
                  <Link href="/#servicios" type="supporting">
                    Catálogo y precios
                  </Link>
                  <Link href="/#politicas" type="supporting">
                    Políticas y anticipos
                  </Link>
                </VStack>

                <VStack gap={1.5}>
                  <Text type="label" weight="semibold">
                    Contacto
                  </Text>
                  <Link href={instagramUrl} isExternalLink type="supporting">
                    Instagram ({instagramHandle})
                  </Link>
                  <Link href={whatsappDirect} isExternalLink type="supporting">
                    WhatsApp ({settings.whatsappNumber})
                  </Link>
                  <Link href={settings.mapsUrl} isExternalLink type="supporting">
                    Cómo llegar (Google Maps)
                  </Link>
                </VStack>
              </HStack>
            </HStack>

            <Divider />

            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <HStack gap={2} align="center" wrap="wrap">
                <Text type="supporting" color="secondary">
                  © {settings.updatedAt.slice(0, 4)} {settings.name} · Puebla ·
                </Text>
                <Link href={sisterStudioUrl} isExternalLink type="supporting" color="secondary">
                  {sisterStudioHandle}
                </Link>
              </HStack>
              <Link href="/admin" type="supporting" color="secondary">
                Acceso para equipo y administración
              </Link>
            </HStack>
          </VStack>
        </Section>
      </VStack>
    </AppShell>
  );
}
