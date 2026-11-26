'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Building2, Globe, Home, MapPin, Store, Users } from 'lucide-react';
import { FilterPillBar } from '@/components/ui';

export type OnboardingServiceMode = 'studio' | 'home' | 'online';

const TEAM_SIZE_OPTIONS = [
  { value: 'Solo yo', label: 'Solo yo' },
  { value: 'Somos 2', label: 'Somos 2' },
  { value: '3 a 5', label: '3 a 5' },
  { value: '6 o más', label: '6 o más' },
];

const SERVICE_MODE_OPTIONS = [
  {
    value: 'studio' as const,
    label: 'En mi estudio',
    icon: <Store size={15} aria-hidden="true" />,
  },
  {
    value: 'home' as const,
    label: 'A domicilio',
    icon: <Home size={15} aria-hidden="true" />,
  },
  {
    value: 'online' as const,
    label: 'En línea',
    icon: <Globe size={15} aria-hidden="true" />,
  },
];

interface OnboardingStepProfileProps {
  salonName: string;
  teamSizeTier: string;
  serviceMode: OnboardingServiceMode;
  address: string;
  onChangeSalonName: (value: string) => void;
  onChangeTeamSizeTier: (value: string) => void;
  onChangeServiceMode: (value: OnboardingServiceMode) => void;
  onChangeAddress: (value: string) => void;
}

export function OnboardingStepProfile({
  salonName,
  teamSizeTier,
  serviceMode,
  address,
  onChangeSalonName,
  onChangeTeamSizeTier,
  onChangeServiceMode,
  onChangeAddress,
}: OnboardingStepProfileProps) {
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2} className="lk-serif ad-h2">
          1. Cuéntanos de tu salón
        </Heading>
        <Text color="secondary">
          Estos datos aparecen en tu página de reservas para que tus clientas te reconozcan al instante.
        </Text>
      </VStack>

      <TextInput
        label="Nombre de tu salón"
        value={salonName}
        onChange={onChangeSalonName}
        isRequired
        autoComplete="organization"
        placeholder="LAIKONA NAILS"
        startIcon={<Building2 size={16} aria-hidden="true" />}
      />

      <VStack gap={2}>
        <HStack gap={1.5} align="center">
          <Users size={15} aria-hidden="true" />
          <Text type="label" weight="semibold">
            ¿Cuántas personas atienden?
          </Text>
        </HStack>
        <FilterPillBar
          ariaLabel="Tamaño del equipo"
          value={teamSizeTier}
          options={TEAM_SIZE_OPTIONS}
          onChange={onChangeTeamSizeTier}
        />
      </VStack>

      <VStack gap={1.5}>
        <Text type="label" weight="semibold">
          ¿Dónde atiendes?
        </Text>
        <FilterPillBar
          ariaLabel="Dónde atiendes"
          mode="segmented"
          layout="fill"
          value={serviceMode}
          options={SERVICE_MODE_OPTIONS}
          onChange={onChangeServiceMode}
        />
      </VStack>

      <TextInput
        label={
          serviceMode === 'online'
            ? 'Ciudad o referencia'
            : 'Dirección o colonia y ciudad'
        }
        description="Puedes poner solo tu colonia y compartir la dirección exacta al confirmar."
        value={address}
        onChange={onChangeAddress}
        autoComplete="street-address"
        placeholder="Calle 25 Sur 1904, Col. Volcanes, Puebla"
        startIcon={<MapPin size={16} aria-hidden="true" />}
      />
    </VStack>
  );
}
