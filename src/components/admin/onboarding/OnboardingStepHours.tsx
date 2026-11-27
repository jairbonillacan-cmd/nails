'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Clock } from 'lucide-react';

export interface StaffShiftSummary {
  id: string;
  name: string;
  summary: string;
}

interface OnboardingStepHoursProps {
  staffShiftSummaries: readonly StaffShiftSummary[];
}

export function OnboardingStepHours({
  staffShiftSummaries,
}: OnboardingStepHoursProps) {
  if (staffShiftSummaries.length === 0) return null;

  return (
    <VStack className="ad-subpanel" gap={2}>
      <HStack justify="between" align="center" wrap="wrap" gap={2}>
        <HStack gap={1.5} align="center">
          <Clock size={15} aria-hidden="true" />
          <Text weight="semibold" size="sm">
            Turnos activos del salón
          </Text>
        </HStack>
        <NextLink href="/admin/disponibilidad" className="ad-inline-link">
          Cambiar turnos →
        </NextLink>
      </HStack>
      <VStack gap={1.5}>
        {staffShiftSummaries.map((st) => (
          <HStack key={st.id} justify="between" align="center" gap={2} wrap="wrap">
            <Text size="sm" weight="medium">
              {st.name}
            </Text>
            <Text
              type="supporting"
              color="secondary"
              hasTabularNumbers
              style={{ overflowWrap: 'anywhere' }}
            >
              {st.summary}
            </Text>
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}
