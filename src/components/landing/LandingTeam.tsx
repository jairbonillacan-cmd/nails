'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog } from '@astryxdesign/core/Dialog';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { X } from 'lucide-react';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import { formatDuration } from '@/lib/format';
import { formatServicePrice, getStaffScheduleLabel } from '../booking/bookingHelpers';
import { SectionHeading, WaveBottom, WaveTop } from './LandingParts';
import { LANDING_ASSETS, staffAvatar, staffPortfolio } from './landingContent';

type ProfileTab = 'perfil' | 'servicios' | 'portafolio';

const PROFILE_TABS: ReadonlyArray<{ value: ProfileTab; label: string }> = [
  { value: 'perfil', label: 'Perfil' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'portafolio', label: 'Portafolio' },
];

function isProfileTab(value: string): value is ProfileTab {
  return PROFILE_TABS.some((tab) => tab.value === value);
}

interface LandingTeamProps {
  staff: PublicStaffDTO[];
  services: PublicServiceDTO[];
  currency: PublicSettingsDTO['currency'];
}

export function LandingTeam({ staff, services, currency }: LandingTeamProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>('perfil');
  const openIndex = staff.findIndex((member) => member.id === openId);
  const member = openIndex >= 0 ? staff[openIndex] : undefined;
  const memberServices = member
    ? services.filter((service) => member.serviceIds.includes(service.id))
    : [];
  const firstName = member?.name.split(' ')[0] ?? '';
  const schedule = member ? getStaffScheduleLabel(member) : null;

  const openProfile = (id: string) => {
    setTab('perfil');
    setOpenId(id);
  };

  return (
    <VStack as="section" id="equipo" aria-labelledby="equipo-t" className="lk-cereza">
      <WaveTop />
      <img className="lk-watermark" src={LANDING_ASSETS.cherriesWhite} alt="" width={580} height={580} style={{ left: '-6%', top: '10%', width: '40%', opacity: 0.06 }} />
      <VStack gap={10} className="lk-wrap" paddingBlockStart={6} paddingBlockEnd={10} style={{ position: 'relative' }}>
        <SectionHeading
          id="equipo-t"
          title="Elige a tu artista"
          subtitle="Una clienta por bloque. Toca a cada una para ver su trabajo."
          tone="light"
        />
        <Grid role="list" columns={{ minWidth: 220, max: 4 }} gap={8}>
          {staff.map((person, index) => (
            <VStack role="listitem" key={person.id} className="lk-pop">
              <button
                type="button"
                className="lk-artist"
                aria-haspopup="dialog"
                onClick={() => openProfile(person.id)}
              >
                <img className="lk-artist-photo" src={staffAvatar(person.avatarUrl, index)} alt="" width={220} height={220} />
                <Text className="lk-artist-chip" color="inherit">
                  ✿ {person.roleTitle}
                </Text>
                <Heading level={3} color="inherit" className="lk-serif" style={{ marginTop: '1rem', fontSize: '2rem' }}>
                  {person.name}
                </Heading>
                {getStaffScheduleLabel(person) ? (
                  <Text type="supporting" color="inherit" className="lk-soft">
                    {getStaffScheduleLabel(person)}
                  </Text>
                ) : null}
              </button>
            </VStack>
          ))}
        </Grid>
      </VStack>
      <WaveBottom />

      <Dialog
        isOpen={member !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(null);
        }}
        width="min(42.5rem, 94vw)"
        maxHeight="88dvh"
        padding={0}
      >
        {member ? (
          <VStack gap={0} height="100%" className="lk-portal">
            <VStack gap={4} padding={6} paddingBlockEnd={4}>
              <HStack gap={3} align="center">
                <img src={staffAvatar(member.avatarUrl, openIndex)} alt="" width={56} height={56} style={{ borderRadius: 'var(--radius-full)' }} />
                <VStack gap={0.5} style={{ flex: '1 1 auto' }}>
                  <Heading level={2} className="lk-serif" style={{ fontSize: '1.9rem' }}>
                    {member.name}
                  </Heading>
                  <Text type="supporting" color="secondary">
                    {member.roleTitle}
                  </Text>
                </VStack>
                <Button label="Cerrar" variant="ghost" isIconOnly icon={<X size={18} />} onClick={() => setOpenId(null)} />
              </HStack>
              <TabList
                value={tab}
                onChange={(value) => {
                  if (isProfileTab(value)) setTab(value);
                }}
                hasDivider
              >
                {PROFILE_TABS.map((item) => (
                  <Tab key={item.value} value={item.value} label={item.label} />
                ))}
              </TabList>
            </VStack>

            <VStack gap={4} padding={6} isScrollable style={{ flex: '1 1 auto', maxHeight: '52dvh', background: 'var(--lk-rosa)' }}>
              {tab === 'perfil' ? (
                <VStack gap={4}>
                  <Text textWrap="pretty">{member.bio}</Text>
                  <VStack gap={2} padding={5} className="lk-card">
                    <HStack justify="between" gap={4}>
                      <Text color="secondary">Horarios</Text>
                      <Text hasTabularNumbers>{schedule ?? 'Lunes a sábado'}</Text>
                    </HStack>
                    <HStack justify="between" gap={4}>
                      <Text color="secondary">Servicios</Text>
                      <Text>{memberServices.length}</Text>
                    </HStack>
                  </VStack>
                </VStack>
              ) : null}
              {tab === 'servicios' ? (
                <VStack as="ul" gap={2} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {memberServices.map((service) => (
                    <HStack as="li" key={service.id} justify="between" align="center" gap={3} padding={4} className="lk-card">
                      <VStack gap={0.5}>
                        <Text weight="semibold">{service.name}</Text>
                        <Text type="supporting" color="secondary">
                          {formatDuration(service.durationMinutes)} ·{' '}
                          {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                        </Text>
                      </VStack>
                      <Button
                        label="Reservar"
                        size="sm"
                        href={`/reservar/${service.slug}?staff=${encodeURIComponent(member.bookingSlug)}`}
                      />
                    </HStack>
                  ))}
                </VStack>
              ) : null}
              {tab === 'portafolio' ? (
                <Grid columns={3} gap={2}>
                  {staffPortfolio(openIndex).map((src) => (
                    <img key={src} src={src} alt="Set de uñas" width={200} height={200} loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius-container)' }} />
                  ))}
                </Grid>
              ) : null}
            </VStack>

            <VStack padding={5}>
              <Button
                label={`Reservar con ${firstName}`}
                variant="primary"
                size="lg"
                width="100%"
                href={`/reservar?staff=${encodeURIComponent(member.bookingSlug)}`}
              />
            </VStack>
          </VStack>
        ) : null}
      </Dialog>
    </VStack>
  );
}
