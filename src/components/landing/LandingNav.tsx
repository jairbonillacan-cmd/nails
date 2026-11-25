'use client';

import { useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { Text } from '@astryxdesign/core/Text';
import { Menu, X } from 'lucide-react';
import { useScrolledPast } from '@/lib/hooks/useScrolledPast';
import { LANDING_ASSETS } from './landingContent';

const NAV_LINKS = [
  { label: 'Menú', href: '#servicios' },
  { label: 'Creaciones', href: '#galeria' },
  { label: 'Equipo', href: '#equipo' },
  { label: 'Visítanos', href: '#visitanos' },
] as const;

interface LandingNavProps {
  salonName: string;
  instagramUrl: string;
  instagramHandle: string;
}

export function LandingNav({ salonName, instagramUrl, instagramHandle }: LandingNavProps) {
  const isFloating = useScrolledPast(80);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="lk-header">
      <nav className="lk-nav" data-floating={isFloating ? 'true' : 'false'} aria-label="Principal">
        <a href="#inicio" aria-label={`${salonName}, inicio`} style={{ lineHeight: 0 }}>
          <img
            className="lk-logo"
            src={isFloating ? LANDING_ASSETS.logoBlack : LANDING_ASSETS.logoWhite}
            alt={salonName}
            width={160}
            height={68}
          />
        </a>
        <HStack
          as="ul"
          gap={6}
          align="center"
          className="lk-nav-links"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a className="lk-nav-link" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </HStack>
        <HStack gap={1.5} align="center">
          <Button label="Agendar" variant="primary" href="/reservar" />
          <Button
            label="Abrir menú"
            variant="secondary"
            isIconOnly
            icon={<Menu size={20} />}
            className="lk-burger"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
          />
        </HStack>
      </nav>

      <Dialog isOpen={isMenuOpen} onOpenChange={setIsMenuOpen} variant="fullscreen" padding={0}>
        <VStack className="lk-portal lk-menu-panel" padding={5} gap={8} minHeight="100dvh">
          <HStack justify="between" align="center">
            <img src={LANDING_ASSETS.logoWhite} alt={salonName} width={120} height={50} style={{ height: '2.5rem', width: 'auto' }} />
            <Button label="Cerrar menú" variant="secondary" className="lk-btn-outline" isIconOnly icon={<X size={20} />} onClick={closeMenu} />
          </HStack>
          <VStack as="ul" gap={0} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a className="lk-menu-link" href={link.href} onClick={closeMenu}>
                  {link.label}
                  <Text color="inherit" aria-hidden="true">→</Text>
                </a>
              </li>
            ))}
          </VStack>
          <VStack gap={2}>
            <Button label="Agendar cita" variant="secondary" size="lg" width="100%" className="lk-btn-light" href="/reservar" />
            <Button label={instagramHandle} variant="secondary" size="lg" width="100%" className="lk-btn-outline" href={instagramUrl} />
          </VStack>
        </VStack>
      </Dialog>
    </header>
  );
}
