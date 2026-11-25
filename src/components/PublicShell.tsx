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
import { CalendarDays, Moon, Sparkles, Sun } from 'lucide-react';
import { useSalonAppearance } from './SalonThemeProvider';
import { buildWhatsAppLink } from '@/lib/format';

export function PublicShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { mode, setMode, settings } = useSalonAppearance();

  const toggleMode = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  const whatsappDirect = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, tengo una consulta sobre citas.`,
  );

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
              heading={settings.name}
              headingHref="/"
              logo={<Sparkles size={18} aria-hidden="true" />}
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
              <VStack gap={1.5} maxWidth={380}>
                <Text weight="semibold" size="lg">
                  {settings.name}
                </Text>
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
                  <Link href={whatsappDirect} isExternalLink type="supporting">
                    WhatsApp ({settings.whatsappNumber})
                  </Link>
                  <Link href={settings.mapsUrl} isExternalLink type="supporting">
                    Cómo llegar (Google Maps)
                  </Link>
                  <Text type="supporting" color="secondary">
                    Instagram: {settings.instagramHandle}
                  </Text>
                </VStack>
              </HStack>
            </HStack>

            <Divider />

            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Text type="supporting" color="secondary">
                © {settings.updatedAt.slice(0, 4)} {settings.name}. Todos los derechos reservados.
              </Text>
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
