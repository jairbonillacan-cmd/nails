'use client';

import Image from 'next/image';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Check, Sparkles } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';
import type { PublicStaffDTO } from '@/lib/public-dto';
import { staffAvatar } from '../landing/landingContent';
import {
  getStaffScheduleLabel,
  isOptimizableLocalRasterImage,
} from './bookingHelpers';

interface StaffStepProps {
  timezone: string;
  timeFormat: '12h' | '24h';
  slot: AvailableSlot;
  eligibleStaff: PublicStaffDTO[];
  allStaff: PublicStaffDTO[];
  chosenStaffId: string;
  pendingStaffId: string | null;
  takenStaffIds: ReadonlySet<string>;
  isBusy: boolean;
  errorMessage: string | null;
  onPickStaff: (staffId: string) => void;
}

export function StaffStep({
  timezone,
  timeFormat,
  slot,
  eligibleStaff,
  allStaff,
  chosenStaffId,
  pendingStaffId,
  takenStaffIds,
  isBusy,
  errorMessage,
  onPickStaff,
}: StaffStepProps) {
  const time = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
  const freeIds = new Set(slot.availableStaffIds);
  const isFree = (staffId: string) => freeIds.has(staffId) && !takenStaffIds.has(staffId);
  const isAnyPending = pendingStaffId === 'any';

  return (
    <VStack gap={5} className="fx-step-in">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          ¿Con quién?
        </Heading>
        <Text color="secondary">
          Libres el {formatDateLongInTimezone(slot.startAt, timezone)} a las{' '}
          <Text color="inherit" weight="semibold" hasTabularNumbers>
            {time}
          </Text>
          . Tu horario ya está apartado.
        </Text>
      </VStack>

      {errorMessage ? (
        <VStack className="fx-fade-up">
          <Banner status="warning" role="alert" title="Esa artista ya no está libre" description={errorMessage} />
        </VStack>
      ) : null}

      <ul className="rb-artists fx-stagger" aria-label="Artista">
        <li>
          <button
            type="button"
            className={
              isAnyPending
                ? 'rb-opt rb-artist fx-card-lift fx-press fx-busy'
                : 'rb-opt rb-artist fx-card-lift fx-press'
            }
            aria-pressed={chosenStaffId === 'any'}
            aria-busy={isAnyPending ? 'true' : undefined}
            disabled={isBusy}
            onClick={() => onPickStaff('any')}
          >
            <Text color="inherit" className="rb-artist-any" aria-hidden="true">
              <Sparkles size={26} />
            </Text>
            <VStack gap={0} className="rb-grow">
              <Text weight="medium" className="lk-serif rb-artist-name">
                Me da igual
              </Text>
              <Text type="supporting" color="accent" weight="semibold">
                La opción más rápida
              </Text>
              <Text type="supporting" color="secondary">
                {isAnyPending ? 'Confirmando tu lugar…' : 'Te asignamos a quien esté libre'}
              </Text>
            </VStack>
            <Text
              color="inherit"
              className="rb-check rb-check-round"
              data-on={chosenStaffId === 'any' ? 'true' : 'false'}
              aria-hidden="true"
            >
              <Check size={16} />
            </Text>
          </button>
        </li>
        {eligibleStaff.map((member) => {
          const free = isFree(member.id);
          const isOn = chosenStaffId === member.id;
          const isPending = pendingStaffId === member.id;
          const index = allStaff.findIndex((item) => item.id === member.id);
          const shiftLabel = getStaffScheduleLabel(member, timeFormat);
          return (
            <li key={member.id}>
              <button
                type="button"
                className={
                  isPending
                    ? 'rb-opt rb-artist fx-card-lift fx-press fx-busy'
                    : 'rb-opt rb-artist fx-card-lift fx-press'
                }
                aria-pressed={isOn || isPending}
                aria-busy={isPending ? 'true' : undefined}
                disabled={!free || isBusy}
                onClick={() => onPickStaff(member.id)}
              >
                {(() => {
                  const avatarSrc = staffAvatar(member.avatarUrl, Math.max(0, index));
                  return isOptimizableLocalRasterImage(avatarSrc) ? (
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
                  );
                })()}
                <VStack gap={0} className="rb-grow">
                  <Text weight="medium" className="lk-serif rb-artist-name">
                    {member.name}
                  </Text>
                  <Text type="supporting" color="accent" weight="semibold">
                    {member.roleTitle}
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
            </li>
          );
        })}
      </ul>
    </VStack>
  );
}
