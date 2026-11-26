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
            fetchPriority="high"
            decoding="async"
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
          <Button label="Agendar" variant="primary" className="fx-press" href="/reservar" />
          <Button
            label="Abrir menú"
            variant="secondary"
            isIconOnly
            icon={<Menu size={20} aria-hidden="true" />}
            className="lk-burger fx-press"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen(true)}
          />
        </HStack>
      </nav>

      <Dialog isOpen={isMenuOpen} onOpenChange={setIsMenuOpen} variant="fullscreen" padding={0}>
        <VStack className="lk-portal lk-menu-panel fx-sheet-in" padding={5} gap={8} minHeight="100dvh">
          <HStack justify="between" align="center">
            <img
              src={LANDING_ASSETS.logoWhite}
              alt={salonName}
              width={120}
              height={50}
              decoding="async"
              style={{ height: '2.5rem', width: 'auto' }}
            />
            <Button
              label="Cerrar menú"
              variant="secondary"
              className="lk-btn-outline fx-press"
              isIconOnly
              icon={<X size={20} aria-hidden="true" />}
              onClick={closeMenu}
            />
          </HStack>
          <VStack
            as="nav"
            aria-label="Menú móvil"
            gap={0}
          >
            <VStack as="ul" gap={0} className="fx-stagger" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a className="lk-menu-link fx-press" href={link.href} onClick={closeMenu}>
                    {link.label}
                    <Text color="inherit" aria-hidden="true">→</Text>
                  </a>
                </li>
              ))}
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
            <Button
              label={instagramHandle}
              variant="secondary"
              size="lg"
              width="100%"
              className="lk-btn-outline fx-press"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMenu}
            />
          </VStack>
        </VStack>
      </Dialog>
    </header>
  );
}
