'use client';

import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { ExternalLink, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { SkeletonBlock, StatusTag, SurfaceCard } from '@/components/ui';
import {
  OwnerAuditHistoryCard,
  OwnerPinAndNoShowCards,
} from '@/components/admin/marca/OwnerSecuritySection';
import type { AuditLogEntry, SalonSettings, Service, StaffMember } from '@/lib/types';

const EmbedGeneratorCard = dynamic(
  () =>
    import('@/components/admin/config/EmbedGeneratorCard').then(
      (mod) => mod.EmbedGeneratorCard,
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock width="100%" height="12rem" radius={3} />,
  },
);

interface AdvancedPoliciesSectionProps {
  draft: SalonSettings;
  isOwner: boolean;
  timezone: string;
  appUrl: string;
  services: Service[];
  staff: StaffMember[];
  recentAuditLogs: AuditLogEntry[];
  flaggedNoShowClientsCount: number;
  hasOwnerPin: boolean;
  onUpdateDraft: (patch: Partial<SalonSettings>) => void;
  onSyncOwnerPinEnabled: (enabled: boolean) => void;
  onRefresh: () => Promise<void>;
  onNotify: (message: string) => void;
}

export function AdvancedPoliciesSection({
  draft,
  isOwner,
  timezone,
  appUrl,
  services,
  staff,
  recentAuditLogs,
  flaggedNoShowClientsCount,
  hasOwnerPin,
  onUpdateDraft,
  onSyncOwnerPinEnabled,
  onRefresh,
  onNotify,
}: AdvancedPoliciesSectionProps) {
  const maxActiveBookingsPerClient = draft.maxActiveBookingsPerClient ?? 3;
  const privacyPolicyVersion = draft.privacyPolicyVersion ?? '2026-11';
  const lockPastBookings = draft.lockPastBookings ?? true;
  const optimizeContinuousSlots = draft.optimizeContinuousSlots ?? false;
  const noShowDepositThreshold = draft.noShowDepositThreshold ?? 2;
  const ownerPinEnabled = Boolean(draft.ownerPinEnabled);

  return (
    <Collapsible
      className="ad-disclosure"
      defaultIsOpen={false}
      trigger={
        <HStack justify="between" align="center" gap={2} width="100%" wrap="wrap">
          <HStack gap={2} align="center">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <VStack gap={0}>
              <Text weight="semibold" size="base">
                Reglas del salón y más opciones
              </Text>
              <Text type="supporting" color="secondary">
                Política si no llegan, límite de citas, PIN de dueña, otra web e historial de cambios.
              </Text>
            </VStack>
          </HStack>
          <StatusTag label="Opcional" tone="neutral" />
        </HStack>
      }
    >
      <VStack gap={4} paddingBlockStart={4}>
        <VStack className="ad-config-grid-equal" gap={4}>
          <SurfaceCard
            id="brand-rules-heading"
            icon={<ShieldCheck size={16} aria-hidden="true" />}
            title="Límites y tiempos de reserva"
            subtitle="Reglas de cancelación, límite de citas por clienta y aviso de privacidad."
          >
            <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
              <TextArea
                label="Regla de cancelación y cambios"
                value={draft.cancellationPolicyText}
                onChange={(v) => onUpdateDraft({ cancellationPolicyText: v })}
                rows={2}
              />
              <Grid columns={{ minWidth: 110, max: 3 }} gap={2}>
                <NumberInput
                  label="Anticipación mínima (min)"
                  value={draft.minBookingNoticeMinutes}
                  min={0}
                  onChange={(v) => onUpdateDraft({ minBookingNoticeMinutes: v })}
                />
                <NumberInput
                  label="Avisar cambios antes (hrs)"
                  value={draft.minCancelHours}
                  min={0}
                  onChange={(v) => onUpdateDraft({ minCancelHours: v })}
                />
                <NumberInput
                  label="Apartado temporal (min)"
                  value={draft.slotHoldMinutes}
                  min={1}
                  max={15}
                  onChange={(v) => onUpdateDraft({ slotHoldMinutes: v })}
                />
              </Grid>
              <Switch
                label="Guardar el lugar unos minutos mientras la clienta termina de agendar"
                value={draft.enableSlotHold}
                onChange={(v) => onUpdateDraft({ enableSlotHold: v })}
              />

              <Divider />

              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
                <NumberInput
                  label="Máximo de citas activas por clienta (1 a 10)"
                  value={maxActiveBookingsPerClient}
                  min={1}
                  max={10}
                  isIntegerOnly
                  onChange={(v) => onUpdateDraft({ maxActiveBookingsPerClient: v })}
                />
                <TextInput
                  label="Versión del Aviso de Privacidad"
                  value={privacyPolicyVersion}
                  onChange={(v) => onUpdateDraft({ privacyPolicyVersion: v })}
                  placeholder="2026-11"
                />
              </Grid>
              <Switch
                label="Proteger citas pasadas contra cambios"
                description="Solo la Dueña podrá editar o cancelar citas que ya pasaron."
                value={lockPastBookings}
                onChange={(v) => onUpdateDraft({ lockPastBookings: v })}
              />
              <Switch
                label="Aprovechar huecos en días con horario libre"
                description="No cambia tus turnos fijos; solo acomoda espacios en horario libre."
                value={optimizeContinuousSlots}
                onChange={(v) => onUpdateDraft({ optimizeContinuousSlots: v })}
              />
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Text type="supporting" color="secondary">
                  Tus clientas aceptan tu aviso al reservar su cita.
                </Text>
                <Button
                  label="Ver Aviso de Privacidad"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} aria-hidden="true" />}
                  href="/aviso-de-privacidad"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </VStack>
          </SurfaceCard>

          {isOwner ? (
            <OwnerPinAndNoShowCards
              noShowDepositThreshold={noShowDepositThreshold}
              flaggedNoShowClientsCount={flaggedNoShowClientsCount}
              hasOwnerPin={hasOwnerPin}
              ownerPinEnabled={ownerPinEnabled}
              onChangeNoShowThreshold={(v) =>
                onUpdateDraft({ noShowDepositThreshold: v })
              }
              onSyncOwnerPinEnabled={onSyncOwnerPinEnabled}
              onRefresh={onRefresh}
              onNotify={onNotify}
            />
          ) : null}
        </VStack>

        <EmbedGeneratorCard
          appUrl={appUrl}
          salonName={draft.name}
          accentColor={draft.brandAccentLight}
          services={services}
          staff={staff}
        />

        {isOwner ? (
          <OwnerAuditHistoryCard
            recentAuditLogs={recentAuditLogs}
            timezone={timezone}
          />
        ) : null}
      </VStack>
    </Collapsible>
  );
}
