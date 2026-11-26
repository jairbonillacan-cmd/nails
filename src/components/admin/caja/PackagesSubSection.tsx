'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { Package, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { Service } from '@/lib/types';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import type { ServicePackageCatalogRow } from './cajaTypes';

interface PackagesSubSectionProps {
  packagesCatalog: readonly ServicePackageCatalogRow[];
  packagesLoading: boolean;
  services: readonly Service[];
  currency: 'MXN' | 'USD';
  canManagePackages: boolean;
  togglingPkgId: string | null;
  onCreatePackage: (input: {
    name: string;
    description: string;
    serviceId: string;
    totalSessions: number;
    priceMxn: number;
    validDays: number;
  }) => Promise<boolean>;
  onTogglePackage: (pkg: ServicePackageCatalogRow, nextActive: boolean) => Promise<void>;
}

export function PackagesSubSection({
  packagesCatalog,
  packagesLoading,
  services,
  currency,
  canManagePackages,
  togglingPkgId,
  onCreatePackage,
  onTogglePackage,
}: PackagesSubSectionProps) {
  const activeServices = services
    .filter((s) => s.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder);
  const [pkgName, setPkgName] = useState('');
  const [pkgDescription, setPkgDescription] = useState('');
  const [pkgServiceId, setPkgServiceId] = useState('');
  const [pkgTotalSessions, setPkgTotalSessions] = useState(5);
  const [pkgPriceMxn, setPkgPriceMxn] = useState(1600);
  const [pkgValidDays, setPkgValidDays] = useState(120);
  const [pkgSaving, setPkgSaving] = useState(false);
  const [pendingPausePkg, setPendingPausePkg] = useState<ServicePackageCatalogRow | null>(null);

  const effectivePkgServiceId = pkgServiceId || activeServices[0]?.id || '';

  const handlePackageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgName.trim() || !effectivePkgServiceId || pkgSaving) return;
    setPkgSaving(true);
    try {
      const ok = await onCreatePackage({
        name: pkgName.trim(),
        description: pkgDescription.trim(),
        serviceId: effectivePkgServiceId,
        totalSessions: pkgTotalSessions,
        priceMxn: pkgPriceMxn,
        validDays: pkgValidDays,
      });
      if (ok) {
        setPkgName('');
        setPkgDescription('');
      }
    } finally {
      setPkgSaving(false);
    }
  };

  return (
    <>
      <VStack className="ad-split" gap={0}>
        <SurfaceCard
          title="Paquetes de sesiones"
          subtitle="Arma paquetes prepagados de retoques o servicios para asignar a tus clientas."
          count={packagesCatalog.length}
        >
          {packagesLoading && packagesCatalog.length === 0 ? (
            <VStack padding={4} gap={2} role="status" aria-busy="true">
              <SkeletonBlock width="100%" height="4.5rem" radius={2} index={0} />
              <SkeletonBlock width="100%" height="4.5rem" radius={2} index={1} />
            </VStack>
          ) : packagesCatalog.length === 0 ? (
            <VStack padding={4}>
              <EmptyStateCard
                framed={false}
                isCompact
                title="Sin paquetes todavía"
                description="Crea tu primer paquete de sesiones (ej. 4 sesiones de Rubber) para consentir a tus clientas frecuentes."
              />
            </VStack>
          ) : (
            <VStack padding={4} gap={3}>
              {packagesCatalog.map((pkg) => {
                const srv = services.find((s) => s.id === pkg.serviceId);
                const perSessionCents =
                  pkg.totalSessions > 0 ? Math.round(pkg.priceCents / pkg.totalSessions) : 0;
                const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
                return (
                  <VStack key={pkg.id} className="ad-pkg-card" gap={2}>
                    <HStack justify="between" align="start" wrap="wrap" gap={2}>
                      <VStack gap={0.5} className="rb-grow">
                        <HStack gap={2} align="center" wrap="wrap">
                          <Package size={15} aria-hidden="true" />
                          <Text weight="semibold">{pkg.name}</Text>
                          <StatusTag
                            tone={pkg.isActive ? 'success' : 'neutral'}
                            showDot
                            label={pkg.isActive ? 'Activo' : 'Pausado'}
                          />
                        </HStack>
                        {pkg.description ? (
                          <Text type="supporting" color="secondary">
                            {pkg.description}
                          </Text>
                        ) : null}
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {srv?.name ?? 'Servicio incluido'} · {pkg.totalSessions} sesiones ·{' '}
                          {formatCurrency(perSessionCents, currency)} c/u
                          {pkg.validDays
                            ? ` · Vigencia ${pkg.validDays} días`
                            : ' · Sin vencimiento'}
                        </Text>
                      </VStack>

                      <VStack align="end" gap={1.5}>
                        <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
                          {formatCurrency(pkg.priceCents, currency)}
                        </Text>
                        {canManagePackages ? (
                          <Switch
                            label={`Activar paquete ${pkg.name}`}
                            isLabelHidden
                            size="sm"
                            isDisabled={togglingPkgId === pkg.id}
                            value={pkg.isActive}
                            onChange={(nextVal) => {
                              if (!nextVal) {
                                setPendingPausePkg(pkg);
                              } else {
                                void onTogglePackage(pkg, true);
                              }
                            }}
                          />
                        ) : null}
                      </VStack>
                    </HStack>

                    <ul
                      className="ad-pkg-pips"
                      aria-label={`${pkg.totalSessions} sesiones incluidas`}
                    >
                      {Array.from({ length: totalPips }, (_, idx) => (
                        <li key={idx} className="ad-pkg-pip" data-used="false" />
                      ))}
                    </ul>
                  </VStack>
                );
              })}
            </VStack>
          )}
        </SurfaceCard>

        {canManagePackages ? (
          <SurfaceCard title="Nuevo paquete de sesiones" headingLevel={3} padded>
            <form onSubmit={(e) => void handlePackageSubmit(e)}>
              <VStack gap={3}>
                <TextInput
                  label="Nombre del paquete"
                  placeholder="Ej. Paquete 5 retoques Rubber"
                  value={pkgName}
                  onChange={setPkgName}
                  isRequired
                />
                <Selector
                  label="Servicio incluido"
                  value={effectivePkgServiceId}
                  onChange={(v) => v && setPkgServiceId(v)}
                  options={activeServices.map((srv) => ({
                    value: srv.id,
                    label: `${srv.name} (${formatCurrency(srv.priceCents, currency)})`,
                  }))}
                />
                <Grid columns={{ minWidth: 110, max: 3 }} gap={2}>
                  <NumberInput
                    label="Sesiones"
                    value={pkgTotalSessions}
                    min={2}
                    max={20}
                    isIntegerOnly
                    onChange={setPkgTotalSessions}
                  />
                  <NumberInput
                    label={`Precio (${currency})`}
                    value={pkgPriceMxn}
                    min={0}
                    onChange={setPkgPriceMxn}
                  />
                  <NumberInput
                    label="Vigencia (días)"
                    value={pkgValidDays}
                    min={0}
                    max={730}
                    isIntegerOnly
                    onChange={setPkgValidDays}
                  />
                </Grid>
                <TextArea
                  label="Notas del paquete (opcional)"
                  placeholder="Ej. Incluye 5 retoques con precio preferencial."
                  value={pkgDescription}
                  onChange={setPkgDescription}
                  rows={2}
                  isOptional
                />
                <Divider />
                <Button
                  type="submit"
                  label="Crear paquete"
                  variant="primary"
                  icon={<Plus size={15} aria-hidden="true" />}
                  width="100%"
                  isLoading={pkgSaving}
                  isDisabled={pkgSaving || !pkgName.trim() || !effectivePkgServiceId}
                />
              </VStack>
            </form>
          </SurfaceCard>
        ) : null}
      </VStack>

      <ConfirmActionDialog
        isOpen={Boolean(pendingPausePkg)}
        onOpenChange={(open) => {
          if (!open) setPendingPausePkg(null);
        }}
        title="¿Pausar paquete de sesiones?"
        description={
          pendingPausePkg
            ? `El paquete "${pendingPausePkg.name}" dejará de estar disponible para nuevas asignaciones hasta que lo vuelvas a activar.`
            : ''
        }
        confirmLabel="Pausar paquete"
        isLoading={Boolean(pendingPausePkg && togglingPkgId === pendingPausePkg.id)}
        onConfirm={async () => {
          if (!pendingPausePkg) return;
          const target = pendingPausePkg;
          await onTogglePackage(target, false);
          setPendingPausePkg(null);
        }}
      />
    </>
  );
}
