'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Check, UserRound } from 'lucide-react';
import { BrandIcon } from '@/components/brand/BrandIcon';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO, PublicStaffDTO } from '@/lib/public-dto';
import { staffAvatar } from '../landing/landingContent';
import { formatHoldClock } from './BookingChrome';
import {
  getStaffScheduleLabel,
  isOptimizableLocalRasterImage,
} from './bookingHelpers';

const SpecialistProfileDialog = dynamic(
  () => import('../landing/SpecialistProfileDialog').then((mod) => mod.SpecialistProfileDialog),
  { ssr: false },
);

interface StaffStepProps {
  timezone: string;
  timeFormat: '12h' | '24h';
  currency: PublicSettingsDTO['currency'];
  services: PublicServiceDTO[];
  slot: AvailableSlot;
  holdRemainingSec?: number;
  eligibleStaff: PublicStaffDTO[];
  allStaff: PublicStaffDTO[];
  chosenStaffId: string;
  pendingStaffId: string | null;
  takenStaffIds: ReadonlySet<string>;
  isBusy: boolean;
  errorMessage: string | null;
  onPickStaff: (staffId: string) => void;
}

function getMemberServices(
  member: PublicStaffDTO,
  services: readonly PublicServiceDTO[],
): PublicServiceDTO[] {
  if (member.serviceIds.length === 0) return [...services];
  return services.filter((service) => member.serviceIds.includes(service.id));
}

export function StaffStep({
  timezone,
  timeFormat,
  currency,
  services,
  slot,
  holdRemainingSec = 0,
  eligibleStaff,
  allStaff,
  chosenStaffId,
  pendingStaffId,
  takenStaffIds,
  isBusy,
  errorMessage,
  onPickStaff,
}: StaffStepProps) {
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const time = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
  const freeIds = new Set(slot.availableStaffIds);
  const isFree = (staffId: string) => freeIds.has(staffId) && !takenStaffIds.has(staffId);
  const isAnySelected = chosenStaffId === 'any';
  const isAnyPending = pendingStaffId === 'any';
  const orderedStaff = eligibleStaff.toSorted(
    (a, b) => Number(isFree(b.id)) - Number(isFree(a.id)),
  );
  const profileIndex = profileMemberId
    ? allStaff.findIndex((item) => item.id === profileMemberId)
    : -1;
  const profileMember = profileIndex >= 0 ? allStaff[profileIndex] : undefined;
  const profileMemberServices = profileMember
    ? getMemberServices(profileMember, services)
    : [];
  const profileIsFree = profileMember ? isFree(profileMember.id) : false;

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          Profesional
        </Heading>
        <Text color="secondary" hasTabularNumbers>
          {holdRemainingSec > 0
            ? `Horario apartado · ${formatHoldClock(holdRemainingSec)} · `
            : 'Horario apartado: '}
          {formatDateLongInTimezone(slot.startAt, timezone)},{' '}
          <Text color="inherit" weight="semibold" hasTabularNumbers>
            {time}
          </Text>
        </Text>
      </VStack>

      {errorMessage ? (
        <VStack className="fx-fade-up">
          <Banner status="warning" role="alert" title="Esa profesional ya no está libre" description={errorMessage} />
        </VStack>
      ) : null}

      <ul className="rb-artists fx-stagger" aria-label="Profesional">
        <li className="rb-artist-item">
          <VStack
            gap={0}
            className={
              isAnyPending
                ? 'rb-artist-card fx-card-lift fx-busy'
                : 'rb-artist-card fx-card-lift'
            }
            data-selected={isAnySelected ? 'true' : 'false'}
            data-selectable={isBusy ? 'false' : 'true'}
          >
            <button
              type="button"
              className="rb-artist-select fx-press"
              aria-pressed={isAnySelected}
              aria-busy={isAnyPending ? 'true' : undefined}
              disabled={isBusy}
              onClick={() => onPickStaff('any')}
            >
              <Text color="inherit" className="rb-artist-any" aria-hidden="true">
                <BrandIcon name="cualquier-profesional" size={2} />
              </Text>
              <VStack gap={0.5} className="rb-grow">
                <Text weight="medium" className="lk-serif rb-artist-name">
                  Cualquier profesional
                </Text>
                <Text type="supporting" color="accent" weight="semibold">
                  Mayor disponibilidad
                </Text>
                <Text type="supporting" color="secondary" textWrap="pretty">
                  {isAnyPending ? 'Un momento…' : 'Te asignamos a quien esté libre en tu horario.'}
                </Text>
              </VStack>
              <Text
                color="inherit"
                className="rb-check rb-check-round"
                data-on={isAnySelected ? 'true' : 'false'}
                aria-hidden="true"
              >
                <Check size={16} />
              </Text>
            </button>
            <HStack className="rb-artist-foot" align="center" justify="between" gap={2}>
              <Text type="supporting" color="secondary">
                Asignación automática
              </Text>
            </HStack>
          </VStack>
        </li>

        {orderedStaff.map((member) => {
          const free = isFree(member.id);
          const isOn = chosenStaffId === member.id;
          const isPending = pendingStaffId === member.id;
          const index = allStaff.findIndex((item) => item.id === member.id);
          const shiftLabel = getStaffScheduleLabel(member, timeFormat);
          const memberBio = member.bio.trim();
          const avatarSrc = staffAvatar(member.avatarUrl, Math.max(0, index));
          const memberServicesCount = getMemberServices(member, services).length;

          return (
            <li key={member.id} className="rb-artist-item">
              <VStack
                gap={0}
                className={
                  isPending
                    ? 'rb-artist-card fx-card-lift fx-busy'
                    : 'rb-artist-card fx-card-lift'
                }
                data-selected={isOn || isPending ? 'true' : 'false'}
                data-selectable={free && !isBusy ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="rb-artist-select fx-press"
                  aria-pressed={isOn || isPending}
                  aria-busy={isPending ? 'true' : undefined}
                  disabled={!free || isBusy}
                  onClick={() => onPickStaff(member.id)}
                >
                  {isOptimizableLocalRasterImage(avatarSrc) ? (
                    <Image
                      className="rb-artist-photo"
                      src={avatarSrc}
                      alt=""
                      width={68}
                      height={68}
                      sizes="4.25rem"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <img
                      className="rb-artist-photo"
                      src={avatarSrc}
                      alt=""
                      width={68}
                      height={68}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <VStack gap={0.5} className="rb-grow">
                    <Text weight="medium" className="lk-serif rb-artist-name">
                      {member.name}
                    </Text>
                    <Text type="supporting" color="accent" weight="semibold">
                      {member.roleTitle.trim() || 'Nail Artist'}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {isPending
                        ? 'Apartando horario…'
                        : free
                          ? 'Libre a esa hora'
                          : 'Ocupada a esa hora'}
                    </Text>
                    {shiftLabel ? (
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {shiftLabel}
                      </Text>
                    ) : null}
                    {memberBio ? (
                      <Text type="supporting" color="secondary" maxLines={2} textWrap="pretty">
                        {memberBio}
                      </Text>
                    ) : null}
                  </VStack>
                  <Text
                    color="inherit"
                    className="rb-check rb-check-round"
                    data-on={isOn || isPending ? 'true' : 'false'}
                    aria-hidden="true"
                  >
                    <Check size={16} />
                  </Text>
                </button>
                <HStack className="rb-artist-foot" align="center" justify="between" gap={2}>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {memberServicesCount > 0
                      ? `${memberServicesCount} ${memberServicesCount === 1 ? 'servicio' : 'servicios'}`
                      : 'Perfil y portafolio'}
                  </Text>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Ver perfil"
                    icon={<UserRound size={14} aria-hidden="true" />}
                    className="rb-artist-profile-btn fx-press"
                    aria-haspopup="dialog"
                    aria-label={`Ver perfil de ${member.name}`}
                    onClick={() => setProfileMemberId(member.id)}
                  />
                </HStack>
              </VStack>
            </li>
          );
        })}
      </ul>

      {profileMember ? (
        <SpecialistProfileDialog
          key={profileMember.id}
          member={profileMember}
          memberIndex={Math.max(0, profileIndex)}
          memberServices={profileMemberServices}
          currency={currency}
          timeFormat={timeFormat}
          mode="booking"
          availabilityLabel={profileIsFree ? 'Libre a esa hora' : 'Ocupada a esa hora'}
          canSelect={profileIsFree}
          isSelected={chosenStaffId === profileMember.id}
          isBusy={isBusy}
          onSelect={() => onPickStaff(profileMember.id)}
          onClose={() => setProfileMemberId(null)}
        />
      ) : null}
    </VStack>
  );
}
