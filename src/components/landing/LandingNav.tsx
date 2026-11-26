'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Menu } from 'lucide-react';
import { useHeroNavPhase } from '@/lib/hooks/useHeroScrollState';
import type { ResolvedLandingSections } from '@/lib/landing-config';
import { LANDING_ASSETS } from './landingContent';

const LandingMobileMenuDialog = dynamic(
  () => import('./LandingMobileMenuDialog').then((mod) => mod.LandingMobileMenuDialog),
  { ssr: false },
);

const ALL_NAV_LINKS = [
  { label: 'Menú', href: '#servicios', key: 'showMenu' as const },
  { label: 'Creaciones', href: '#galeria', key: 'showCreations' as const },
  { label: 'Equipo', href: '#equipo', key: 'showTeam' as const },
  { label: 'Visítanos', href: '#visitanos', key: 'showVisit' as const },
] as const;

interface LandingNavProps {
  salonName: string;
  customLogoUrl?: string | null;
  instagramUrl: string;
  instagramHandle: string;
  whatsappUrl: string;
  sections?: ResolvedLandingSections;
}

export function LandingNav({
  salonName,
  customLogoUrl = null,
  instagramUrl,
  instagramHandle,
  whatsappUrl,
  sections,
}: LandingNavProps) {
  const { state: heroState, isFloating } = useHeroNavPhase('#inicio');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const visibleLinks = ALL_NAV_LINKS.filter((item) =>
    sections ? sections[item.key] : true,
  );

  return (
    <header className="lk-header">
      <nav
        className="lk-nav"
        data-floating={isFloating ? 'true' : 'false'}
        data-hero={heroState}
        aria-label="Principal"
      >
        <a href="#inicio" aria-label={`${salonName}, inicio`} className="lk-logo-link">
          {customLogoUrl ? (
            <img
              className="lk-logo"
              src={customLogoUrl}
              alt=""
              width={180}
              height={76}
              loading="eager"
              decoding="async"
            />
          ) : (
            <>
              <img
                className="lk-logo lk-logo-light"
                src={LANDING_ASSETS.logoWhite}
                alt=""
                width={180}
                height={76}
                loading="eager"
                decoding="async"
              />
              <img
                className="lk-logo lk-logo-dark"
                src={LANDING_ASSETS.logoBlack}
                alt=""
                width={180}
                height={76}
                loading="eager"
                decoding="async"
              />
            </>
          )}
        </a>
        <HStack
          as="ul"
          gap={6}
          align="center"
          className="lk-nav-links"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {visibleLinks.map((link) => (
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
            aria-haspopup="dialog"
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
          navLinks={visibleLinks}
          onOpenChange={setIsMenuOpen}
        />
      ) : null}
    </header>
  );
}
