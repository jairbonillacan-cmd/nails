'use client';

import NextLink from 'next/link';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { X } from 'lucide-react';
import { LANDING_ASSETS } from './landingContent';

interface NavLinkItem {
  readonly label: string;
  readonly href: string;
}

interface LandingMobileMenuDialogProps {
  isOpen: boolean;
  salonName: string;
  instagramUrl: string;
  instagramHandle: string;
  whatsappUrl: string;
  navLinks: readonly NavLinkItem[];
  onOpenChange: (isOpen: boolean) => void;
}

export function LandingMobileMenuDialog({
  isOpen,
  salonName,
  instagramUrl,
  instagramHandle,
  whatsappUrl,
  navLinks,
  onOpenChange,
}: LandingMobileMenuDialogProps) {
  const closeMenu = () => onOpenChange(false);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      variant="fullscreen"
      padding={0}
      aria-label="Menú principal"
    >
      <VStack className="lk-portal lk-menu-panel fx-sheet-in" padding={5} gap={8} minHeight="100dvh">
        <HStack justify="between" align="center">
          <img
            src={LANDING_ASSETS.logoWhite}
            alt={salonName}
            width={118}
            height={50}
            loading="lazy"
            decoding="async"
            style={{ height: '2.5rem', width: 'auto' }}
          />
          <Button
            label="Cerrar menú"
            variant="secondary"
            size="md"
            className="lk-btn-outline lk-icon-touch fx-press"
            isIconOnly
            icon={<X size={20} aria-hidden="true" />}
            onClick={closeMenu}
          />
        </HStack>
        <VStack as="nav" aria-label="Menú móvil" gap={0}>
          <VStack
            as="ul"
            gap={0}
            className="fx-stagger"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {navLinks.map((link) => (
              <li key={link.href}>
                <a className="lk-menu-link fx-press" href={link.href} onClick={closeMenu}>
                  {link.label}
                  <Text color="inherit" aria-hidden="true">→</Text>
                </a>
              </li>
            ))}
            <li>
              <NextLink className="lk-menu-link fx-press" href="/mis-citas" onClick={closeMenu}>
                Mis citas
                <Text color="inherit" aria-hidden="true">→</Text>
              </NextLink>
            </li>
          </VStack>
        </VStack>
        <VStack gap={2} style={{ marginTop: 'auto' }}>
          <Button
            label="Agendar cita"
            variant="secondary"
            size="lg"
            width="100%"
            className="lk-btn-light fx-press"
            href="/reservar"
            onClick={closeMenu}
          />
          <HStack gap={2} wrap="wrap">
            <Button
              label="WhatsApp"
              variant="secondary"
              size="lg"
              className="lk-btn-outline fx-press"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            />
            <Button
              label={instagramHandle}
              variant="secondary"
              size="lg"
              className="lk-btn-outline fx-press"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            />
          </HStack>
        </VStack>
      </VStack>
    </Dialog>
  );
}
