'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Package, PackageCheck, X } from 'lucide-react';
import type { ServicePackage } from '@/lib/types';
import {
  ConfirmActionDialog,
  PackageStatusTag,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import type { ClientPackageRow } from './clientasTypes';

interface ClientProfilePackagesSectionProps {
  clientId: string;
  canManageClients: boolean;
  clientPackages: readonly ClientPackageRow[];
  activeCatalogPackages: readonly ServicePackage[];
  assigningPkg: boolean;
  redeemingPkgId: string | null;
  cancelingPkgId: string | null;
  onAssignPackage: (
    targetClientId: string,
    targetPackageId: string,
    notesText: string,
  ) => Promise<boolean>;
  onRedeemPackageSession: (pkg: ClientPackageRow) => Promise<void>;
  onCancelPackage: (pkg: ClientPackageRow) => Promise<void>;
}

export function ClientProfilePackagesSection({
  clientId,
  canManageClients,
  clientPackages,
  activeCatalogPackages,
  assigningPkg,
  redeemingPkgId,
  cancelingPkgId,
  onAssignPackage,
  onRedeemPackageSession,
  onCancelPackage,
}: ClientProfilePackagesSectionProps) {
  const [fichaPackageId, setFichaPackageId] = useState('');
  const [confirmCancelPkg, setConfirmCancelPkg] = useState<ClientPackageRow | null>(null);
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
          const isActivePkg = pkg.status === 'active' && !pkg.isExpired;
          const canRedeem = canManageClients && isActivePkg && pkg.remainingSessions > 0;
          const isBusy = redeemingPkgId === pkg.id || cancelingPkgId === pkg.id;
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
                  tone={isActivePkg ? 'accent' : 'neutral'}
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
              {canManageClients && isActivePkg ? (
                <HStack justify="end" gap={1.5} wrap="wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    icon={<X size={13} aria-hidden="true" />}
                    label="Cancelar paquete"
                    isDisabled={isBusy}
                    onClick={() => setConfirmCancelPkg(pkg)}
                  />
                  {canRedeem ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={<PackageCheck size={13} aria-hidden="true" />}
                      label="Usar 1 sesión"
                      isLoading={redeemingPkgId === pkg.id}
                      isDisabled={isBusy}
                      onClick={() => void onRedeemPackageSession(pkg)}
                    />
                  ) : null}
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
                  label: `${p.name} (${p.totalSessions} sesiones)`,
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

      {confirmCancelPkg ? (
        <ConfirmActionDialog
          isOpen
          onOpenChange={(open) => {
            if (!open && !cancelingPkgId) setConfirmCancelPkg(null);
          }}
          title={`¿Cancelar paquete "${confirmCancelPkg.packageName}"?`}
          description={`Quedarán sin efecto las ${confirmCancelPkg.remainingSessions} sesiones disponibles de este paquete.`}
          confirmLabel="Sí, cancelar paquete"
          cancelLabel="Volver"
          variant="destructive"
          isLoading={cancelingPkgId === confirmCancelPkg.id}
          onConfirm={async () => {
            await onCancelPackage(confirmCancelPkg);
            setConfirmCancelPkg(null);
          }}
        />
      ) : null}
    </SurfaceCard>
  );
}
