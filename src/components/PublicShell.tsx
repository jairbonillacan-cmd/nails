'use client';

import type React from 'react';
import NextLink from 'next/link';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { buildWhatsAppLink } from '@/lib/format';
import { useSalonAppearance } from './SalonThemeProvider';
import { BookingHeader } from './booking/BookingChrome';
import { normalizeInstagramHandle, resolveInstagramUrl } from './booking/bookingHelpers';

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { settings } = useSalonAppearance();
  const whatsappDirect = buildWhatsAppLink(
    settings.whatsappNumber,
    `Hola ${settings.name}, tengo una consulta sobre citas.`,
  );
  const instagramHandle = normalizeInstagramHandle(settings.instagramHandle);
  const instagramUrl = resolveInstagramUrl(settings);
  const year = settings.updatedAt.slice(0, 4);

  return (
    <VStack className="lk-root rb-root" gap={0} width="100%">
      <BookingHeader salonName={settings.name} whatsappUrl={whatsappDirect} />

      <VStack as="main" gap={0} width="100%" style={{ flex: '1 1 auto' }}>
        {children}
      </VStack>

      <VStack as="footer" className="ck-footer">
        <HStack justify="between" align="center" wrap="wrap" gap={3} className="rb-wrap">
          <Text type="supporting" color="secondary" textWrap="pretty">
            © {year} {settings.name} · {settings.address}
          </Text>
          <HStack gap={4} wrap="wrap">
            <NextLink className="ck-footer-link" href="/">
              Inicio
            </NextLink>
            <NextLink className="ck-footer-link" href="/reservar">
              Agendar cita
            </NextLink>
            <NextLink className="ck-footer-link" href="/links">
              Accesos rápidos
            </NextLink>
            <a
              className="ck-footer-link"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {instagramHandle}
            </a>
            <a
              className="ck-footer-link"
              href={whatsappDirect}
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
            <NextLink className="ck-footer-link" href="/aviso-de-privacidad">
              Aviso de privacidad
            </NextLink>
          </HStack>
        </HStack>
      </VStack>
    </VStack>
  );
}
