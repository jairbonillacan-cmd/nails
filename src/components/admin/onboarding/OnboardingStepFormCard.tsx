'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SurfaceCard } from '@/components/ui';
import {
  OnboardingStepProfile,
  type OnboardingServiceMode,
} from '@/components/admin/onboarding/OnboardingStepProfile';
import { OnboardingStepDeposit } from '@/components/admin/onboarding/OnboardingStepDeposit';
import { OnboardingStepServices } from '@/components/admin/onboarding/OnboardingStepServices';
import type { StaffShiftSummary } from '@/components/admin/onboarding/OnboardingStepHours';
import type { AvailabilitySchedule, Service, StaffMember } from '@/lib/types';

export interface OnboardingProfileState {
  businessType: string;
  teamSizeTier: string;
  salonName: string;
  serviceMode: OnboardingServiceMode;
  address: string;
  soundAlertsEnabled: boolean;
}

export interface OnboardingDepositState {
  enabled: boolean | null;
  amountMxn: number | null;
  bank: string | null;
  holder: string | null;
  clabe: string | null;
  instagram: string | null;
}

export interface OnboardingServiceState {
  id: string | null;
  name: string;
  priceMxn: number;
  durationMinutes: number;
  isStartingPrice: boolean;
}

export const INITIAL_ONBOARDING_PROFILE: OnboardingProfileState = {
  businessType: 'Salón de Manicure y Uñas',
  teamSizeTier: '3 a 5',
  salonName: 'LAIKONA NAILS',
  serviceMode: 'studio',
  address: 'Puebla, México',
  soundAlertsEnabled: true,
};

export const INITIAL_ONBOARDING_DEPOSIT: OnboardingDepositState = {
  enabled: null,
  amountMxn: null,
  bank: null,
  holder: null,
  clabe: null,
  instagram: null,
};

export const INITIAL_ONBOARDING_SERVICE: OnboardingServiceState = {
  id: null,
  name: 'Rubber',
  priceMxn: 350,
  durationMinutes: 120,
  isStartingPrice: true,
};

export function buildStaffShiftSummaries(
  staff: StaffMember[],
  schedules: AvailabilitySchedule[],
): StaffShiftSummary[] {
  return staff
    .filter((s) => s.isActive)
    .map((st) => {
      const sched = schedules.find((sc) => sc.staffId === st.id);
      const fixedTimes = Array.from(
        new Set((sched?.rules ?? []).flatMap((r) => r.fixedStartTimes ?? [])),
      ).toSorted();
      return {
        id: st.id,
        name: st.name,
        summary: fixedTimes.length > 0 ? fixedTimes.join(' · ') : 'Horario abierto',
      };
    });
}

interface OnboardingStepFormCardProps {
  stepIndex: number;
  saving: boolean;
  profile: OnboardingProfileState;
  depositEnabled: boolean;
  depositAmountMxn: number;
  depositBank: string;
  depositHolder: string;
  depositClabe: string;
  instagramHandle: string;
  staffShiftSummaries: readonly StaffShiftSummary[];
  starterServices: Service[];
  serviceDraft: OnboardingServiceState;
  currency: 'MXN' | 'USD';
  onPatchProfile: (patch: Partial<OnboardingProfileState>) => void;
  onPatchDeposit: (patch: Partial<OnboardingDepositState>) => void;
  onPatchService: (patch: Partial<OnboardingServiceState>) => void;
  onSelectStarterService: (srv: Service) => void;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function OnboardingStepFormCard({
  stepIndex,
  saving,
  profile,
  depositEnabled,
  depositAmountMxn,
  depositBank,
  depositHolder,
  depositClabe,
  instagramHandle,
  staffShiftSummaries,
  starterServices,
  serviceDraft,
  currency,
  onPatchProfile,
  onPatchDeposit,
  onPatchService,
  onSelectStarterService,
  onBack,
  onSubmit,
}: OnboardingStepFormCardProps) {
  return (
    <form onSubmit={onSubmit}>
      <SurfaceCard padded>
        <VStack key={`wizard-step-${stepIndex}`} gap={5} className="fx-step-in">
          {stepIndex === 0 ? (
            <OnboardingStepProfile
              salonName={profile.salonName}
              teamSizeTier={profile.teamSizeTier}
              serviceMode={profile.serviceMode}
              address={profile.address}
              onChangeSalonName={(salonName) => onPatchProfile({ salonName })}
              onChangeTeamSizeTier={(teamSizeTier) => onPatchProfile({ teamSizeTier })}
              onChangeServiceMode={(serviceMode) => onPatchProfile({ serviceMode })}
              onChangeAddress={(address) => onPatchProfile({ address })}
            />
          ) : null}

          {stepIndex === 1 ? (
            <OnboardingStepDeposit
              depositEnabled={depositEnabled}
              depositAmountMxn={depositAmountMxn}
              depositBank={depositBank}
              depositHolder={depositHolder}
              depositClabe={depositClabe}
              instagramHandle={instagramHandle}
              onChangeDepositEnabled={(enabled) => onPatchDeposit({ enabled })}
              onChangeDepositAmountMxn={(amountMxn) => onPatchDeposit({ amountMxn })}
              onChangeDepositBank={(bank) => onPatchDeposit({ bank })}
              onChangeDepositHolder={(holder) => onPatchDeposit({ holder })}
              onChangeDepositClabe={(clabe) => onPatchDeposit({ clabe })}
              onChangeInstagramHandle={(instagram) => onPatchDeposit({ instagram })}
            />
          ) : null}

          {stepIndex === 2 ? (
            <OnboardingStepServices
              staffShiftSummaries={staffShiftSummaries}
              starterServices={starterServices}
              selectedServiceId={serviceDraft.id}
              serviceName={serviceDraft.name}
              servicePriceMxn={serviceDraft.priceMxn}
              serviceDurationMinutes={serviceDraft.durationMinutes}
              serviceIsStartingPrice={serviceDraft.isStartingPrice}
              currency={currency}
              onSelectStarterService={onSelectStarterService}
              onChangeServiceName={(name) => onPatchService({ name })}
              onChangeServicePriceMxn={(priceMxn) => onPatchService({ priceMxn })}
              onChangeServiceDurationMinutes={(durationMinutes) =>
                onPatchService({ durationMinutes })
              }
              onChangeServiceIsStartingPrice={(isStartingPrice) =>
                onPatchService({ isStartingPrice })
              }
            />
          ) : null}

          <Divider />

          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <Button
              type="button"
              label="Atrás"
              variant="secondary"
              icon={<ArrowLeft size={16} aria-hidden="true" />}
              isDisabled={stepIndex === 0 || saving}
              onClick={onBack}
            />
            <Button
              type="submit"
              label={stepIndex === 2 ? 'Terminar y dejar listo' : 'Siguiente'}
              variant="primary"
              isLoading={saving}
              endContent={<ArrowRight size={16} aria-hidden="true" />}
            />
          </HStack>
        </VStack>
      </SurfaceCard>
    </form>
  );
}
