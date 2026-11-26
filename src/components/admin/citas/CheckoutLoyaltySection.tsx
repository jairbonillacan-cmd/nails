'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { PackageCheck } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { ClientLoyaltySummary } from '@/lib/loyalty/stamps';

export interface ClientPackageSummaryRow {
  id: string;
  clientId: string;
  packageId: string;
  packageName: string;
  serviceId: string;
  totalSessions: number;
  usedSessions: number;
  purchasedAt: string;
  expiresAt: string | null;
  status: 'active' | 'exhausted' | 'expired' | 'canceled';
  notes: string;
  clientName: string;
  serviceName: string;
  remainingSessions: number;
  isExpired: boolean;
}

interface CheckoutPackagesSectionProps {
  clientPackages: ClientPackageSummaryRow[];
  redeemPackageId: string | null;
  onTogglePackageRedeem: (pkg: ClientPackageSummaryRow) => void;
}

export function CheckoutPackagesSection({
  clientPackages,
  redeemPackageId,
  onTogglePackageRedeem,
}: CheckoutPackagesSectionProps) {
  if (clientPackages.length === 0) return null;

  return (
    <VStack gap={2}>
      <HStack justify="between" align="center" gap={2}>
        <Text weight="semibold">Paquete disponible</Text>
        <StatusTag
          label={`${clientPackages.length} activo${clientPackages.length === 1 ? '' : 's'}`}
          tone="info"
          hasTabularNumbers
        />
      </HStack>
      {clientPackages.map((pkg) => {
        const isSelected = redeemPackageId === pkg.id;
        const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
        const usedPips = Math.min(totalPips, pkg.usedSessions + (isSelected ? 1 : 0));
        return (
          <VStack key={pkg.id} className="ad-pkg-card" gap={2}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5} className="rb-grow">
                <Text weight="semibold" size="sm">
                  {pkg.packageName}
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {pkg.serviceName} · Quedan{' '}
                  {Math.max(0, pkg.remainingSessions - (isSelected ? 1 : 0))} de{' '}
                  {pkg.totalSessions} sesiones
                </Text>
              </VStack>
              <StatusTag
                label={`${pkg.remainingSessions} disponibles`}
                tone={isSelected ? 'success' : 'accent'}
                hasTabularNumbers
              />
            </HStack>

            <ul
              className="ad-pkg-pips"
              aria-label={`${usedPips} de ${pkg.totalSessions} sesiones usadas`}
            >
              {Array.from({ length: totalPips }, (_, idx) => (
                <li
                  key={idx}
                  className="ad-pkg-pip"
                  data-used={idx < usedPips ? 'true' : 'false'}
                />
              ))}
            </ul>

            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Text type="supporting" color="secondary">
                {isSelected
                  ? 'Se descontará 1 sesión al cobrar.'
                  : 'Usa 1 sesión de su paquete en 1 toque.'}
              </Text>
              <Button
                type="button"
                size="sm"
                variant={isSelected ? 'primary' : 'secondary'}
                icon={<PackageCheck size={14} aria-hidden="true" />}
                label={isSelected ? 'Sesión aplicada (-1)' : 'Canjear 1 sesión'}
                onClick={() => onTogglePackageRedeem(pkg)}
              />
            </HStack>
          </VStack>
        );
      })}
    </VStack>
  );
}

interface CheckoutLoyaltySectionProps {
  loyaltySummary: ClientLoyaltySummary | null;
  selectedPackageName: string | null;
  redeemLoyaltyReward: boolean;
  onChangeRedeemLoyalty: (checked: boolean) => void;
}

export function CheckoutLoyaltySection({
  loyaltySummary,
  selectedPackageName,
  redeemLoyaltyReward,
  onChangeRedeemLoyalty,
}: CheckoutLoyaltySectionProps) {
  if (!loyaltySummary) return null;

  return (
    <SurfaceCard tone={loyaltySummary.isRewardReady ? 'accent' : 'subtle'} padded>
      <VStack gap={2}>
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <Text weight="semibold">{loyaltySummary.programName}</Text>
          <StatusTag
            label={`${loyaltySummary.currentStamps} / ${loyaltySummary.stampsRequired} sellos`}
            tone={loyaltySummary.isRewardReady ? 'success' : 'info'}
            hasTabularNumbers
          />
        </HStack>
        {loyaltySummary.isRewardReady ? (
          <Switch
            label="Aplicar premio de sellos"
            description={`Canjea ${loyaltySummary.stampsRequired} sellos: ${loyaltySummary.rewardLabel}`}
            value={redeemLoyaltyReward}
            onChange={onChangeRedeemLoyalty}
          />
        ) : (
          <Text type="supporting" color="secondary">
            {selectedPackageName
              ? `Paquete "${selectedPackageName}" cubre el servicio (-1 sesión).`
              : 'Al cobrar se suma automáticamente +1 sello a su tarjeta.'}
          </Text>
        )}
      </VStack>
    </SurfaceCard>
  );
}
