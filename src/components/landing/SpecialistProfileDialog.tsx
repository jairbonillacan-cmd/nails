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
  landingPhoto,
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

export interface SpecialistProfileDialogProps {
  member: PublicStaffDTO;
  memberIndex: number;
  memberServices: PublicServiceDTO[];
  currency: PublicSettingsDTO['currency'];
  timeFormat?: '12h' | '24h';
  mode?: 'landing' | 'booking';
  availabilityLabel?: string;
  canSelect?: boolean;
  isSelected?: boolean;
  isBusy?: boolean;
  onSelect?: () => void;
  onClose: () => void;
}

export function SpecialistProfileDialog({
  member,
  memberIndex,
  memberServices,
  currency,
  timeFormat = '12h',
  mode = 'landing',
  availabilityLabel,
  canSelect = true,
  isSelected = false,
  isBusy = false,
  onSelect,
  onClose,
}: SpecialistProfileDialogProps) {
  const [tab, setTab] = useState<ProfileTab>('perfil');
  const firstName = member.name.split(' ')[0] ?? member.name;
  const schedule = getStaffScheduleLabel(member, timeFormat);
  const avatarSrc = staffAvatar(member.avatarUrl, memberIndex);
  const roleLabel = member.roleTitle.trim() || 'Nail Artist';
  const memberBio = member.bio.trim();
  const portfolioItems = staffPortfolio(memberIndex);

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      aria-labelledby="lk-team-dialog-title"
      width="min(42.5rem, 94vw)"
      maxHeight="88dvh"
      padding={0}
    >
      <VStack gap={0} className="lk-portal lk-profile-dialog">
        <VStack gap={4} className="lk-profile-head">
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
                className="lk-profile-avatar"
              />
            ) : (
              <img
                src={avatarSrc}
                alt={`Retrato de ${member.name}`}
                width={56}
                height={56}
                loading="eager"
                decoding="async"
                className="lk-profile-avatar"
              />
            )}
            <VStack gap={0.5} className="rb-grow">
              <Heading level={2} id="lk-team-dialog-title" className="lk-serif lk-profile-title">
                {member.name}
              </Heading>
              <Text type="supporting" color="secondary">
                {availabilityLabel ? `${roleLabel} · ${availabilityLabel}` : roleLabel}
              </Text>
            </VStack>
            <Button
              label="Cerrar"
              variant="ghost"
              size="md"
              className="lk-profile-close fx-press"
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

        <VStack gap={4} className="lk-profile-body">
          {tab === 'perfil' ? (
            <VStack key="perfil" gap={4} className="fx-step-in">
              {memberBio ? <Text textWrap="pretty">{memberBio}</Text> : null}
              <VStack gap={2} padding={5} className="lk-profile-card">
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
                {availabilityLabel ? (
                  <HStack justify="between" gap={4} wrap="wrap">
                    <Text color="secondary">En este horario</Text>
                    <Text weight="medium">{availabilityLabel}</Text>
                  </HStack>
                ) : null}
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label="Ver servicios"
                  variant="secondary"
                  size="md"
                  className="fx-press"
                  onClick={() => setTab('servicios')}
                />
                <Button
                  type="button"
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
            memberServices.length > 0 ? (
              <VStack
                key="servicios"
                as="ul"
                gap={2}
                className="lk-profile-services fx-step-in fx-stagger"
              >
                {memberServices.map((service) => (
                  <HStack
                    as="li"
                    key={service.id}
                    justify="between"
                    align="center"
                    gap={3}
                    padding={4}
                    className="lk-profile-card lk-profile-service-item fx-card-lift"
                  >
                    <VStack gap={0.5} className="lk-profile-service-copy">
                      <Text weight="semibold" textWrap="balance">
                        {service.name}
                      </Text>
                      {service.description ? (
                        <Text type="supporting" color="secondary" textWrap="pretty">
                          {service.description}
                        </Text>
                      ) : null}
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatDuration(service.durationMinutes)} ·{' '}
                        {formatServicePrice(service.priceCents, service.isStartingPrice, currency)}
                      </Text>
                    </VStack>
                    {mode === 'landing' ? (
                      <Button
                        label="Reservar"
                        variant="primary"
                        size="md"
                        className="lk-profile-service-cta fx-press"
                        href={`/reservar/${service.slug}?staff=${encodeURIComponent(member.bookingSlug)}`}
                      />
                    ) : null}
                  </HStack>
                ))}
              </VStack>
            ) : (
              <Text type="supporting" color="secondary" textWrap="pretty">
                Consulta los servicios disponibles al agendar con {firstName}.
              </Text>
            )
          ) : null}

          {tab === 'portafolio' ? (
            <VStack key="portafolio" gap={3} className="fx-step-in" width="100%">
              <Grid columns={3} gap={2} className="fx-stagger">
                {portfolioItems.map((item) =>
                  mode === 'landing' ? (
                    <NextLink
                      key={item.src}
                      href={`/reservar?staff=${encodeURIComponent(member.bookingSlug)}&inspo=${encodeURIComponent(item.title)}`}
                      className="lk-profile-portfolio-tile fx-press"
                      aria-label={`Quiero este diseño (${item.title}) con ${firstName}`}
                    >
                      <img
                        {...landingPhoto(item.src, '(max-width: 47.5rem) 30vw, 12.5rem')}
                        alt={`Set ${item.title} de ${member.name}`}
                        width={item.width}
                        height={item.height}
                        loading="lazy"
                        decoding="async"
                      />
                    </NextLink>
                  ) : (
                    <VStack key={item.src} className="lk-profile-portfolio-tile">
                      <img
                        {...landingPhoto(item.src, '(max-width: 47.5rem) 30vw, 12.5rem')}
                        alt={`Set ${item.title} de ${member.name}`}
                        width={item.width}
                        height={item.height}
                        loading="lazy"
                        decoding="async"
                      />
                    </VStack>
                  ),
                )}
              </Grid>
              <Text type="supporting" color="secondary" justify="center" textWrap="pretty">
                {mode === 'landing'
                  ? `Toca cualquier set para apartarlo con ${firstName}.`
                  : `Algunos trabajos recientes de ${firstName}.`}
              </Text>
            </VStack>
          ) : null}
        </VStack>

        <VStack gap={2} className="lk-profile-foot">
          {mode === 'landing' ? (
            <Button
              label={`Reservar con ${firstName}`}
              variant="primary"
              size="lg"
              width="100%"
              className="fx-press"
              href={`/reservar?staff=${encodeURIComponent(member.bookingSlug)}`}
            />
          ) : canSelect && onSelect ? (
            <Button
              type="button"
              label={isSelected ? `Seguir con ${firstName}` : `Elegir a ${firstName}`}
              variant="primary"
              size="lg"
              width="100%"
              className="fx-press"
              isDisabled={!isSelected && isBusy}
              onClick={() => {
                if (!isSelected) {
                  onSelect();
                }
                onClose();
              }}
            />
          ) : (
            <>
              <Text type="supporting" color="secondary" justify="center" textWrap="pretty">
                {firstName} no está disponible en este horario. Puedes elegir otra profesional o probar otra hora.
              </Text>
              <Button
                type="button"
                label="Cerrar"
                variant="secondary"
                size="lg"
                width="100%"
                className="fx-press"
                onClick={onClose}
              />
            </>
          )}
        </VStack>
      </VStack>
    </Dialog>
  );
}
