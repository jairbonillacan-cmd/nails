'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Check, Sparkles } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import { formatDateLongInTimezone } from '@/lib/format';
import type { PublicStaffDTO } from '@/lib/public-dto';
import { staffAvatar } from '../landing/landingContent';

interface StaffStepProps {
  timezone: string;
  timeFormat: '12h' | '24h';
  slot: AvailableSlot;
  eligibleStaff: PublicStaffDTO[];
  allStaff: PublicStaffDTO[];
  chosenStaffId: string;
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
  takenStaffIds,
  isBusy,
  errorMessage,
  onPickStaff,
}: StaffStepProps) {
  const time = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
  const freeIds = new Set(slot.availableStaffIds);
  const isFree = (staffId: string) => freeIds.has(staffId) && !takenStaffIds.has(staffId);

  return (
    <VStack gap={5} className="rb-enter">
      <VStack gap={0.5}>
        <Heading level={2} className="lk-serif rb-h2">
          ¿Con quién?
        </Heading>
        <Text color="secondary">
          Libres el {formatDateLongInTimezone(slot.startAt, timezone)} a las{' '}
          {time}. Tu horario ya está apartado.
        </Text>
      </VStack>

      {errorMessage ? <Banner status="warning" title="Esa artista ya no está libre" description={errorMessage} /> : null}

      <ul className="rb-artists" aria-label="Artista">
        <li>
          <button
            type="button"
            className="rb-opt rb-artist"
            aria-pressed={chosenStaffId === 'any'}
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
                Te asignamos a quien esté libre
              </Text>
            </VStack>
            <Text color="inherit" className="rb-check rb-check-round" data-on={chosenStaffId === 'any' ? 'true' : 'false'} aria-hidden="true">
              <Check size={16} />
            </Text>
          </button>
        </li>
        {eligibleStaff.map((member) => {
          const free = isFree(member.id);
          const isOn = chosenStaffId === member.id;
          const index = allStaff.findIndex((item) => item.id === member.id);
          return (
            <li key={member.id}>
              <button
                type="button"
                className="rb-opt rb-artist"
                aria-pressed={isOn}
                disabled={!free || isBusy}
                onClick={() => onPickStaff(member.id)}
              >
                <img
                  className="rb-artist-photo"
                  src={staffAvatar(member.avatarUrl, Math.max(0, index))}
                  alt=""
                  width={68}
                  height={68}
                />
                <VStack gap={0} className="rb-grow">
                  <Text weight="medium" className="lk-serif rb-artist-name">
                    {member.name}
                  </Text>
                  <Text type="supporting" color="accent" weight="semibold">
                    {member.roleTitle}
                  </Text>
                  <Text type="supporting" color="secondary">
                    {free ? 'Libre a esa hora' : 'Ocupada a esa hora'}
                  </Text>
                </VStack>
                <Text color="inherit" className="rb-check rb-check-round" data-on={isOn ? 'true' : 'false'} aria-hidden="true">
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
