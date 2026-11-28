'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Check, Package, Pencil, Plus, UserPlus } from 'lucide-react';
import { fidelizacionHref } from '@/lib/admin-links';
import { formatCurrency } from '@/lib/format';
import type { Service } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import {
  ConfirmActionDialog,
  EmptyStateCard,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import type { SaveCajaPackageInput } from './cajaActions';
import type { ServicePackageCatalogRow } from './cajaTypes';
import { computePackageEconomics } from './cajaMetrics';

const PACKAGE_EDITOR_FORM_ID = 'caja-package-editor-form';

interface PackagesSubSectionProps {
  packagesCatalog: readonly ServicePackageCatalogRow[];
  packagesLoading: boolean;
  packagesSupported?: boolean;
  services: readonly Service[];
  currency: 'MXN' | 'USD';
  canManagePackages: boolean;
  hideAssignLink?: boolean;
  togglingPkgId: string | null;
  onSavePackage: (input: SaveCajaPackageInput) => Promise<FormSubmitResult>;
  onTogglePackage: (pkg: ServicePackageCatalogRow, nextActive: boolean) => Promise<void>;
}

function PackageFormBody({
  editingPkg,
  activeServices,
  currency,
  onSavePackage,
  controls,
}: {
  editingPkg: ServicePackageCatalogRow | null;
  activeServices: readonly Service[];
  currency: 'MXN' | 'USD';
  onSavePackage: (input: SaveCajaPackageInput) => Promise<FormSubmitResult>;
  controls: FormDialogControls;
}) {
  const [pkgName, setPkgName] = useState(editingPkg?.name ?? '');
  const [pkgDescription, setPkgDescription] = useState(editingPkg?.description ?? '');
  const [pkgServiceId, setPkgServiceId] = useState(editingPkg?.serviceId ?? '');
  const [pkgTotalSessions, setPkgTotalSessions] = useState(editingPkg?.totalSessions ?? 5);
  const [pkgPriceMxn, setPkgPriceMxn] = useState(() =>
    editingPkg ? Number((editingPkg.priceCents / 100).toFixed(2)) : 1600,
  );
  const [pkgValidDays, setPkgValidDays] = useState(
    editingPkg ? (editingPkg.validDays ?? 0) : 120,
  );
  const [pkgActive, setPkgActive] = useState(editingPkg?.isActive ?? true);

  const effectivePkgServiceId = pkgServiceId || activeServices[0]?.id || '';
  const selectedService = activeServices.find((srv) => srv.id === effectivePkgServiceId) ?? null;
  const economics = computePackageEconomics({
    priceCents: Math.round((pkgPriceMxn || 0) * 100),
    totalSessions: pkgTotalSessions,
    servicePriceCents: selectedService?.priceCents ?? null,
  });

  const handlePackageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkgName.trim() || !effectivePkgServiceId) return;
    controls.submit(() =>
      onSavePackage({
        id: editingPkg?.id,
        name: pkgName.trim(),
        description: pkgDescription.trim(),
        serviceId: effectivePkgServiceId,
        totalSessions: pkgTotalSessions,
        priceMxn: pkgPriceMxn,
        validDays: pkgValidDays,
        isActive: pkgActive,
      }),
    );
  };

  return (
    <form id={PACKAGE_EDITOR_FORM_ID} onSubmit={handlePackageSubmit}>
      <VStack gap={3}>
        <TextInput
          label="Nombre del paquete"
          placeholder="Ej. 5 retoques de Rubber"
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
            max={24}
            isIntegerOnly
            onChange={setPkgTotalSessions}
          />
          <NumberInput
            label={`Precio total (${currency})`}
            value={pkgPriceMxn}
            min={0}
            onChange={setPkgPriceMxn}
          />
          <NumberInput
            label="Vigencia (días)"
            labelTooltip="0 = no vence"
            value={pkgValidDays}
            min={0}
            max={730}
            isIntegerOnly
            onChange={setPkgValidDays}
          />
        </Grid>
        <VStack
          className="ad-subpanel ad-caja-impact"
          data-tone={economics.isMoreExpensive ? 'warn' : 'in'}
          gap={1}
          role="status"
          aria-live="polite"
        >
          <HStack justify="between" align="center" gap={2}>
            <Text type="supporting" color="secondary">
              Precio por sesión
            </Text>
            <Text weight="bold" hasTabularNumbers>
              {formatCurrency(economics.perSessionCents, currency)}
            </Text>
          </HStack>
          {selectedService && economics.regularTotalCents > 0 ? (
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {economics.isMoreExpensive
                ? `Ojo: sale ${formatCurrency(Math.abs(economics.savingsCents), currency)} más caro que pagar ${pkgTotalSessions} sesiones sueltas (${formatCurrency(economics.regularTotalCents, currency)}).`
                : economics.savingsCents > 0
                  ? `Tu clienta ahorra ${formatCurrency(economics.savingsCents, currency)} (${economics.savingsPercent}%) frente a ${pkgTotalSessions} sesiones sueltas de ${formatCurrency(selectedService.priceCents, currency)}.`
                  : `Mismo precio que ${pkgTotalSessions} sesiones sueltas (${formatCurrency(economics.regularTotalCents, currency)}).`}
            </Text>
          ) : null}
        </VStack>
        <TextArea
          label="Notas"
          placeholder="Ej. Precio especial pagando por adelantado."
          value={pkgDescription}
          onChange={setPkgDescription}
          rows={2}
          isOptional
        />
        {editingPkg ? (
          <Switch
            label="Paquete activo para nuevas asignaciones"
            value={pkgActive}
            onChange={setPkgActive}
          />
        ) : null}
      </VStack>
    </form>
  );
}

export function PackagesSubSection({
  packagesCatalog,
  packagesLoading,
  packagesSupported = true,
  services,
  currency,
  canManagePackages,
  hideAssignLink = false,
  togglingPkgId,
  onSavePackage,
  onTogglePackage,
}: PackagesSubSectionProps) {
  const effectiveCanManage = canManagePackages && packagesSupported;
  const activeServices = services
    .filter((s) => s.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder);
  const [pendingPausePkg, setPendingPausePkg] = useState<ServicePackageCatalogRow | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ServicePackageCatalogRow | null>(null);

  const handleOpenCreate = () => {
    setEditingPkg(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (pkg: ServicePackageCatalogRow) => {
    setEditingPkg(pkg);
    setEditorOpen(true);
  };

  const serviceOptionsForEditor =
    editingPkg && !activeServices.some((s) => s.id === editingPkg.serviceId)
      ? [
          ...activeServices,
          ...services.filter((s) => s.id === editingPkg.serviceId),
        ]
      : activeServices;

  return (
    <>
      <VStack gap={0}>
        <SurfaceCard
          title="Paquetes de sesiones"
          subtitle="Paquetes prepagados (ej. 5 retoques) que luego asignas a una clienta."
          count={packagesCatalog.length}
          actions={
            effectiveCanManage ? (
              <Button
                type="button"
                label="Nuevo paquete"
                variant="secondary"
                size="sm"
                icon={<Plus size={14} aria-hidden="true" />}
                isDisabled={activeServices.length === 0}
                onClick={handleOpenCreate}
              />
            ) : undefined
          }
        >
          {!packagesSupported ? (
            <VStack padding={4}>
              <Banner
                status="info"
                title="Paquetes de sesiones en preparación para Supabase"
                description="El catálogo y canje de paquetes ya funciona en modo demo; en producción se activará automáticamente al habilitar las tablas de paquetes en Supabase."
              />
            </VStack>
          ) : packagesLoading && packagesCatalog.length === 0 ? (
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
                description="Usa Nuevo paquete para crear el primero, por ejemplo 4 sesiones de Rubber."
              />
            </VStack>
          ) : (
            <VStack padding={4} gap={3}>
              {packagesCatalog.map((pkg) => {
                const srv = services.find((s) => s.id === pkg.serviceId);
                const perSessionCents =
                  pkg.totalSessions > 0 ? Math.round(pkg.priceCents / pkg.totalSessions) : 0;
                const totalPips = Math.min(12, Math.max(1, pkg.totalSessions));
                const economics = computePackageEconomics({
                  priceCents: pkg.priceCents,
                  totalSessions: pkg.totalSessions,
                  servicePriceCents: srv?.priceCents ?? null,
                });
                return (
                  <VStack key={pkg.id} className="ad-pkg-card" gap={3}>
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
                          {economics.savingsCents > 0 ? (
                            <StatusTag
                              tone="accent"
                              hasTabularNumbers
                              label={`Ahorra ${economics.savingsPercent}%`}
                            />
                          ) : economics.isMoreExpensive ? (
                            <StatusTag tone="warning" label="Más caro que sesiones sueltas" />
                          ) : null}
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

                      <VStack align="end" gap={1.5} className="ad-pkg-price-col">
                        <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
                          {formatCurrency(pkg.priceCents, currency)}
                        </Text>
                        {effectiveCanManage ? (
                          <HStack gap={2} align="center" wrap="wrap">
                            <Button
                              type="button"
                              label="Editar"
                              variant="secondary"
                              size="sm"
                              className="ad-caja-touch-btn"
                              icon={<Pencil size={13} aria-hidden="true" />}
                              isDisabled={togglingPkgId === pkg.id}
                              onClick={() => handleOpenEdit(pkg)}
                            />
                            {!hideAssignLink && pkg.isActive ? (
                              <Button
                                label="Asignar"
                                variant="ghost"
                                size="sm"
                                className="ad-caja-touch-btn"
                                icon={<UserPlus size={13} aria-hidden="true" />}
                                href={fidelizacionHref({ tab: 'paquetes' })}
                              />
                            ) : null}
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
                          </HStack>
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
      </VStack>

      <FormDialog
        isOpen={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingPkg(null);
        }}
        title={
          editingPkg
            ? `Editar paquete · ${editingPkg.name}`
            : 'Nuevo paquete de sesiones'
        }
        subtitle={
          editingPkg
            ? 'Actualiza nombre, servicio, sesiones, precio o vigencia.'
            : 'Elige el servicio, cuántas sesiones incluye y su precio.'
        }
        submitFooter={{
          formId: PACKAGE_EDITOR_FORM_ID,
          submitLabel: editingPkg ? 'Guardar cambios' : 'Crear paquete',
          submitIcon: editingPkg ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          ),
        }}
      >
        {(controls) => (
          <PackageFormBody
            editingPkg={editingPkg}
            activeServices={serviceOptionsForEditor}
            currency={currency}
            onSavePackage={onSavePackage}
            controls={controls}
          />
        )}
      </FormDialog>

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
