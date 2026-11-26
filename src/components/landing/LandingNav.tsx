'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Menu } from 'lucide-react';
import { useScrolledPast } from '@/lib/hooks/useScrolledPast';
import { LANDING_ASSETS } from './landingContent';

const LandingMobileMenuDialog = dynamic(
  () => import('./LandingMobileMenuDialog').then((mod) => mod.LandingMobileMenuDialog),
  { ssr: false },
);

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
  whatsappUrl: string;
}

export function LandingNav({
  salonName,
  instagramUrl,
  instagramHandle,
  whatsappUrl,
}: LandingNavProps) {
  const isFloating = useScrolledPast(80);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="lk-header">
      <nav className="lk-nav" data-floating={isFloating ? 'true' : 'false'} aria-label="Principal">
        <a href="#inicio" aria-label={`${salonName}, inicio`} className="lk-logo-link">
          <img
            className="lk-logo"
            src={isFloating ? LANDING_ASSETS.logoBlack : LANDING_ASSETS.logoWhite}
            alt={salonName}
            width={180}
            height={76}
            loading="eager"
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
          <li>
            <NextLink className="lk-nav-link" href="/mis-citas">
              Mis citas
            </NextLink>
          </li>
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

      {isMenuOpen ? (
        <LandingMobileMenuDialog
          isOpen={isMenuOpen}
          salonName={salonName}
          instagramUrl={instagramUrl}
          instagramHandle={instagramHandle}
          whatsappUrl={whatsappUrl}
          navLinks={NAV_LINKS}
          onOpenChange={setIsMenuOpen}
        />
      ) : null}
    </header>
  );
}
