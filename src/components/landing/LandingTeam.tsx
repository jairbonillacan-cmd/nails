'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import { getStaffScheduleLabel } from '../booking/bookingHelpers';
import { SectionHeading, WaveBottom, WaveTop } from './LandingParts';
import {
  LANDING_ASSETS,
  isOptimizableLocalRasterImage,
  staffAvatar,
} from './landingContent';

const LandingTeamDialog = dynamic(
  () => import('./LandingTeamDialog').then((mod) => mod.LandingTeamDialog),
  { ssr: false },
);

interface LandingTeamProps {
  title?: string;
  subtitle?: string;
  staff: PublicStaffDTO[];
  services: PublicServiceDTO[];
  currency: PublicSettingsDTO['currency'];
}

export function LandingTeam({
  title = 'Elige a tu profesional',
  subtitle = 'Una clienta por bloque. Toca un perfil para ver turnos, servicios y portafolio.',
  staff,
  services,
  currency,
}: LandingTeamProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openIndex = staff.findIndex((member) => member.id === openId);
  const member = openIndex >= 0 ? staff[openIndex] : undefined;
  const memberServices = member
    ? services.filter((service) => member.serviceIds.includes(service.id))
    : [];

  const orderedStaff = staff.map((person, originalIndex) => ({ person, originalIndex }));
  const hasCenteredLead = orderedStaff.length >= 3;
  const desktopMiddleIndex = Math.floor(orderedStaff.length / 2);

  return (
    <VStack as="section" id="equipo" aria-labelledby="equipo-t" className="lk-cereza">
      <WaveTop />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        aria-hidden="true"
        width={488}
        height={572}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        style={{ left: '-6%', top: '10%', width: '40%', opacity: 0.06 }}
      />
      <VStack
        gap={8}
        className="lk-wrap"
        paddingBlockStart={6}
        paddingBlockEnd={10}
        style={{ position: 'relative' }}
      >
        <SectionHeading
          id="equipo-t"
          title={title}
          subtitle={subtitle}
          tone="light"
        />
        <HStack
          role="list"
          justify="center"
          align="start"
          gap={8}
          width="100%"
          className="lk-team-list"
          data-count={String(orderedStaff.length)}
        >
          {orderedStaff.map(({ person, originalIndex }, mobileIndex) => {
            const personSchedule = getStaffScheduleLabel(person);
            const avatarSrc = staffAvatar(person.avatarUrl, originalIndex);
            const roleLabel = person.roleTitle.trim() || 'Nail Artist';
            const desktopSlot = !hasCenteredLead
              ? undefined
              : mobileIndex === 0
                ? 'center'
                : mobileIndex <= desktopMiddleIndex
                  ? 'start'
                  : 'end';
            return (
              <VStack
                role="listitem"
                key={person.id}
                className="lk-pop lk-artist-item"
                data-desktop-slot={desktopSlot}
              >
                <button
                  type="button"
                  className="lk-artist fx-press"
                  aria-haspopup="dialog"
                  aria-label={`${person.name}, ${roleLabel}. Ver perfil, servicios y portafolio`}
                  onClick={() => setOpenId(person.id)}
                >
                  {isOptimizableLocalRasterImage(avatarSrc) ? (
                    <Image
                      className="lk-artist-photo"
                      src={avatarSrc}
                      alt={`Retrato de ${person.name}, ${roleLabel} en LAIKONA NAILS`}
                      width={220}
                      height={220}
                      sizes="(max-width: 47.5rem) 60vw, 13.75rem"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <img
                      className="lk-artist-photo"
                      src={avatarSrc}
                      alt={`Retrato de ${person.name}, ${roleLabel} en LAIKONA NAILS`}
                      width={220}
                      height={220}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <Text className="lk-artist-chip" color="inherit">
                    ✿ {roleLabel}
                  </Text>
                  <Heading
                    level={3}
                    color="inherit"
                    className="lk-serif"
                    style={{ marginTop: '0.875rem', fontSize: '2rem' }}
                  >
                    {person.name}
                  </Heading>
                  {personSchedule ? (
                    <Text type="supporting" color="inherit" className="lk-soft" hasTabularNumbers>
                      {personSchedule}
                    </Text>
                  ) : null}
                </button>
              </VStack>
            );
          })}
        </HStack>
      </VStack>
      <WaveBottom />

      {member ? (
        <LandingTeamDialog
          key={member.id}
          member={member}
          memberIndex={openIndex}
          memberServices={memberServices}
          currency={currency}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </VStack>
  );
}
