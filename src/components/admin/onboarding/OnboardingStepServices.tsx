'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Scissors } from 'lucide-react';
import { FilterPillBar } from '@/components/ui';
import {
  OnboardingStepHours,
  type StaffShiftSummary,
} from '@/components/admin/onboarding/OnboardingStepHours';
import { formatDuration } from '@/lib/format';
import type { Service } from '@/lib/types';

const DURATION_OPTIONS = [
  { value: '45', label: '45 min' },
  { value: '60', label: '1 h' },
  { value: '90', label: '1 h 30 min' },
  { value: '120', label: '2 h' },
  { value: '150', label: '2 h 30 min' },
];

interface OnboardingStepServicesProps {
  staffShiftSummaries: readonly StaffShiftSummary[];
  starterServices: Service[];
  selectedServiceId: string | null;
  serviceName: string;
  servicePriceMxn: number;
  serviceDurationMinutes: number;
  serviceIsStartingPrice: boolean;
  currency: 'MXN' | 'USD';
  onSelectStarterService: (srv: Service) => void;
  onChangeServiceName: (value: string) => void;
  onChangeServicePriceMxn: (value: number) => void;
  onChangeServiceDurationMinutes: (value: number) => void;
  onChangeServiceIsStartingPrice: (value: boolean) => void;
}

export function OnboardingStepServices({
  staffShiftSummaries,
  starterServices,
  selectedServiceId,
  serviceName,
  servicePriceMxn,
  serviceDurationMinutes,
  serviceIsStartingPrice,
  currency,
  onSelectStarterService,
  onChangeServiceName,
  onChangeServicePriceMxn,
  onChangeServiceDurationMinutes,
  onChangeServiceIsStartingPrice,
}: OnboardingStepServicesProps) {
  const durationOptions = DURATION_OPTIONS.some(
    (opt) => Number.parseInt(opt.value, 10) === serviceDurationMinutes,
  )
    ? DURATION_OPTIONS
    : [
        ...DURATION_OPTIONS,
        {
          value: String(serviceDurationMinutes),
          label: formatDuration(serviceDurationMinutes),
        },
      ].toSorted((a, b) => Number.parseInt(a.value, 10) - Number.parseInt(b.value, 10));

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Heading level={2} className="lk-serif ad-h2">
          3. Revisa tus turnos y tu servicio estrella
        </Heading>
        <Text color="secondary">
          Confirma el servicio que más te piden y revisa los turnos fijos de tu equipo.
        </Text>
      </VStack>

      <OnboardingStepHours staffShiftSummaries={staffShiftSummaries} />

      {starterServices.length > 1 ? (
        <VStack gap={1.5}>
          <Text type="label" color="secondary">
            Elige tu servicio estrella para revisar su precio:
          </Text>
          <FilterPillBar
            ariaLabel="Elegir servicio estrella"
            value={selectedServiceId ?? starterServices[0]?.id ?? ''}
            options={starterServices.map((srv) => ({
              value: srv.id,
              label: srv.name,
            }))}
            onChange={(id) => {
              const found = starterServices.find((srv) => srv.id === id);
              if (found) onSelectStarterService(found);
            }}
          />
        </VStack>
      ) : null}

      <Grid columns={{ minWidth: 200, max: 2 }} gap={4}>
        <TextInput
          label="Servicio estrella"
          value={serviceName}
          onChange={onChangeServiceName}
          isRequired
          placeholder="Ejemplo: Rubber"
          startIcon={<Scissors size={16} aria-hidden="true" />}
        />
        <NumberInput
          label={`Precio (${currency})`}
          value={servicePriceMxn}
          onChange={onChangeServicePriceMxn}
          min={0}
          max={100000}
          step={10}
          units={currency}
          isIntegerOnly
        />
      </Grid>

      <Switch
        label='Precio "Desde"'
        description='Muestra "Desde $…" si el total cambia según el largo o diseño.'
        value={serviceIsStartingPrice}
        onChange={onChangeServiceIsStartingPrice}
      />

      <VStack gap={2}>
        <Text type="label" weight="semibold">
          Duración ({formatDuration(serviceDurationMinutes)})
        </Text>
        <FilterPillBar
          ariaLabel="Duración"
          value={String(serviceDurationMinutes)}
          options={durationOptions}
          onChange={(val) => {
            const parsed = Number.parseInt(val, 10);
            if (!Number.isNaN(parsed)) {
              onChangeServiceDurationMinutes(parsed);
            }
          }}
        />
      </VStack>
    </VStack>
  );
}
