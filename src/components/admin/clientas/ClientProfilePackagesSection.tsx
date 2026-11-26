'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Package, PackageCheck } from 'lucide-react';
import type { ServicePackage } from '@/lib/types';
import { PackageStatusTag, StatusTag, SurfaceCard } from '@/components/ui';
import type { ClientPackageRow } from './clientasTypes';

interface ClientProfilePackagesSectionProps {
  clientId: string;
  canManageClients: boolean;
  clientPackages: readonly ClientPackageRow[];
  activeCatalogPackages: readonly ServicePackage[];
  assigningPkg: boolean;
  redeemingPkgId: string | null;
  onAssignPackage: (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ) => Promise<boolean>;
  onRedeemPackageSession: (pkg: ClientPackageRow) => Promise<void>;
}

export function ClientProfilePackagesSection({
  clientId,
  canManageClients,
  clientPackages,
  activeCatalogPackages,
  assigningPkg,
  redeemingPkgId,
  onAssignPackage,
  onRedeemPackageSession,
}: ClientProfilePackagesSectionProps) {
  const [fichaPackageId, setFichaPackageId] = useState('');
  const effectiveFichaPackageId = fichaPackageId || activeCatalogPackages[0]?.id || '';

  if (clientPackages.length === 0 && !(canManageClients && activeCatalogPackages.length > 0)) {
    return null;
  }

  return (
    <SurfaceCard
      title="Paquetes de sesiones"
      headingLevel={3}
      icon={<Package size={15} aria-hidden="true" />}
      count={clientPackages.length}
      padded
    >
      <VStack gap={2}>
        {clientPackages.map((pkg) => {
          const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
          const usedPips = Math.min(totalPips, pkg.usedSessions);
          const canRedeem =
            canManageClients &&
            pkg.status === 'active' &&
            !pkg.isExpired &&
            pkg.remainingSessions > 0;
          return (
            <VStack key={pkg.id} className="ad-pkg-card" gap={1.5}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={2} align="center" wrap="wrap">
                  <Text weight="semibold" size="sm">
                    {pkg.packageName}
                  </Text>
                  <PackageStatusTag status={pkg.status} isExpired={pkg.isExpired} />
                </HStack>
                <StatusTag
                  tone={pkg.status === 'active' && !pkg.isExpired ? 'accent' : 'neutral'}
                  hasTabularNumbers
                  label={`${pkg.remainingSessions}/${pkg.totalSessions} disponibles`}
                />
              </HStack>
              <ul
                className="ad-pkg-pips"
                aria-label={`${pkg.usedSessions} de ${pkg.totalSessions} sesiones usadas`}
              >
                {Array.from({ length: totalPips }, (_, idx) => (
                  <li
                    key={idx}
                    className="ad-pkg-pip"
                    data-used={idx < usedPips ? 'true' : 'false'}
                  />
                ))}
              </ul>
              {canRedeem ? (
                <HStack justify="end">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<PackageCheck size={13} aria-hidden="true" />}
                    label="Usar 1 sesión"
                    isLoading={redeemingPkgId === pkg.id}
                    onClick={() => void onRedeemPackageSession(pkg)}
                  />
                </HStack>
              ) : null}
            </VStack>
          );
        })}

        {canManageClients && activeCatalogPackages.length > 0 ? (
          <HStack gap={2} align="end" wrap="wrap">
            <VStack className="rb-grow">
              <Selector
                label="Asignar paquete"
                size="sm"
                value={effectiveFichaPackageId}
                onChange={(v) => v && setFichaPackageId(v)}
                options={activeCatalogPackages.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.totalSessions} ses.)`,
                }))}
              />
            </VStack>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              label="Asignar"
              isLoading={assigningPkg}
              isDisabled={assigningPkg || !effectiveFichaPackageId}
              onClick={() => void onAssignPackage(clientId, effectiveFichaPackageId, '')}
            />
          </HStack>
        ) : null}
      </VStack>
    </SurfaceCard>
  );
}
