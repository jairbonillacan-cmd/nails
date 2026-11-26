'use client';

import { useState } from 'react';
import Image from 'next/image';
import NextLink from 'next/link';
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
import {
  isOptimizableLocalRasterImage,
  staffAvatar,
  staffPortfolio,
} from './landingContent';

type ProfileTab = 'perfil' | 'servicios' | 'portafolio';

const PROFILE_TABS: ReadonlyArray<{ value: ProfileTab; label: string }> = [
  { value: 'perfil', label: 'Perfil' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'portafolio', label: 'Portafolio' },
];

function isProfileTab(value: string): value is ProfileTab {
  return PROFILE_TABS.some((tab) => tab.value === value);
}

interface LandingTeamDialogProps {
  member: PublicStaffDTO;
  memberIndex: number;
  memberServices: PublicServiceDTO[];
  currency: PublicSettingsDTO['currency'];
  onClose: () => void;
}

export function LandingTeamDialog({
  member,
  memberIndex,
  memberServices,
  currency,
  onClose,
}: LandingTeamDialogProps) {
  const [tab, setTab] = useState<ProfileTab>('perfil');
  const firstName = member.name.split(' ')[0] ?? '';
  const schedule = getStaffScheduleLabel(member);
  const avatarSrc = staffAvatar(member.avatarUrl, memberIndex);

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      width="min(42.5rem, 94vw)"
      maxHeight="88dvh"
      padding={0}
    >
      <VStack gap={0} height="100%" className="lk-portal fx-sheet-in">
        <VStack gap={4} padding={5} paddingBlockEnd={3}>
          <HStack gap={3} align="center">
            {isOptimizableLocalRasterImage(avatarSrc) ? (
              <Image
                src={avatarSrc}
                alt={`Retrato de ${member.name}`}
                width={56}
                height={56}
                sizes="3.5rem"
                loading="eager"
                decoding="async"
                style={{
                  borderRadius: 'var(--radius-full)',
                  objectFit: 'cover',
                  flex: '0 0 auto',
                }}
              />
            ) : (
              <img
                src={avatarSrc}
                alt={`Retrato de ${member.name}`}
                width={56}
                height={56}
                loading="eager"
                decoding="async"
                style={{
                  borderRadius: 'var(--radius-full)',
                  objectFit: 'cover',
                  flex: '0 0 auto',
                }}
              />
            )}
            <VStack gap={0.5} style={{ flex: '1 1 auto', minWidth: 0 }}>
              <Heading level={2} className="lk-serif" style={{ fontSize: '1.85rem' }}>
                {member.name}
              </Heading>
              <Text type="supporting" color="secondary">
                {member.roleTitle}
              </Text>
            </VStack>
            <Button
              label="Cerrar"
              variant="ghost"
              size="md"
              className="fx-press"
              isIconOnly
              icon={<X size={18} aria-hidden="true" />}
              onClick={onClose}
            />
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

        <VStack
          gap={4}
          padding={5}
          isScrollable
          style={{ flex: '1 1 auto', maxHeight: '52dvh', background: 'var(--lk-rosa)' }}
        >
          {tab === 'perfil' ? (
            <VStack key="perfil" gap={4} className="fx-step-in">
              <Text textWrap="pretty">{member.bio}</Text>
              <VStack gap={2} padding={5} className="lk-card">
                <HStack justify="between" gap={4} wrap="wrap">
                  <Text color="secondary">Turnos</Text>
                  <Text weight="medium" hasTabularNumbers>
                    {schedule ?? 'Lunes a sábado'}
                  </Text>
                </HStack>
                <HStack justify="between" gap={4} wrap="wrap">
                  <Text color="secondary">Servicios</Text>
                  <Text weight="medium" hasTabularNumbers>
                    {memberServices.length} disponibles
                  </Text>
                </HStack>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Ver servicios"
                  variant="secondary"
                  size="md"
                  className="fx-press"
                  onClick={() => setTab('servicios')}
                />
                <Button
                  label="Ver portafolio"
                  variant="secondary"
                  size="md"
                  className="fx-press"
                  onClick={() => setTab('portafolio')}
                />
              </HStack>
            </VStack>
          ) : null}
          {tab === 'servicios' ? (
            <VStack
              key="servicios"
              as="ul"
              gap={2}
              className="fx-step-in fx-stagger"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {memberServices.map((service) => (
                <HStack
                  as="li"
                  key={service.id}
                  justify="between"
                  align="center"
                  gap={3}
                  padding={4}
                  className="lk-card fx-card-lift"
                >
                  <VStack gap={0.5} style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <Text weight="semibold" textWrap="balance">
                      {service.name}
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDuration(service.durationMinutes)} ·{' '}
                      {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                    </Text>
                  </VStack>
                  <Button
                    label="Reservar"
                    variant="primary"
                    size="md"
                    className="fx-press"
                    href={`/reservar/${service.slug}?staff=${encodeURIComponent(member.bookingSlug)}`}
                  />
                </HStack>
              ))}
            </VStack>
          ) : null}
          {tab === 'portafolio' ? (
            <VStack key="portafolio" gap={3} className="fx-step-in" width="100%">
              <Grid columns={3} gap={2} className="fx-stagger">
                {staffPortfolio(memberIndex).map((item) => (
                  <NextLink
                    key={item.src}
                    href={`/reservar?staff=${encodeURIComponent(member.bookingSlug)}&inspo=${encodeURIComponent(item.title)}`}
                    className="lk-portfolio-link fx-press"
                    aria-label={`Quiero este diseño (${item.title}) con ${firstName}`}
                  >
                    <Image
                      src={item.src}
                      alt={`Set ${item.title} de ${member.name}`}
                      width={item.width}
                      height={item.height}
                      sizes="(max-width: 47.5rem) 30vw, 12.5rem"
                      loading="lazy"
                      decoding="async"
                    />
                  </NextLink>
                ))}
              </Grid>
              <Text type="supporting" color="secondary" justify="center" textWrap="pretty">
                Toca cualquier set para apartarlo con {firstName}.
              </Text>
            </VStack>
          ) : null}
        </VStack>

        <VStack padding={5}>
          <Button
            label={`Reservar con ${firstName}`}
            variant="primary"
            size="lg"
            width="100%"
            className="fx-press"
            href={`/reservar?staff=${encodeURIComponent(member.bookingSlug)}`}
          />
        </VStack>
      </VStack>
    </Dialog>
  );
}
