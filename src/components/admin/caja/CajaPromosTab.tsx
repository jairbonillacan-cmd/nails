'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Gift, Package, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { Coupon, Service } from '@/lib/types';
import type { PromosSubTab, ServicePackageCatalogRow } from './cajaTypes';

interface CajaPromosTabProps {
  subTab: PromosSubTab;
  onSubTabChange: (next: PromosSubTab) => void;
  coupons: readonly Coupon[];
  packagesCatalog: readonly ServicePackageCatalogRow[];
  packagesLoading: boolean;
  services: readonly Service[];
  currency: 'MXN' | 'USD';
  canManagePackages: boolean;
  togglingPkgId: string | null;
  onCreateCoupon: (input: {
    code: string;
    kind: 'coupon' | 'gift_card';
    discountType: 'percent' | 'fixed_cents';
    value: number;
    recipient: string;
  }) => Promise<boolean>;
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

export function CajaPromosTab({
  subTab,
  onSubTabChange,
  coupons,
  packagesCatalog,
  packagesLoading,
  services,
  currency,
  canManagePackages,
  togglingPkgId,
  onCreateCoupon,
  onCreatePackage,
  onTogglePackage,
}: CajaPromosTabProps) {
  const [cpCode, setCpCode] = useState('');
  const [cpKind, setCpKind] = useState<'coupon' | 'gift_card'>('coupon');
  const [cpDiscountType, setCpDiscountType] = useState<'percent' | 'fixed_cents'>('percent');
  const [cpValue, setCpValue] = useState(15);
  const [cpRecipient, setCpRecipient] = useState('');
  const [cpSaving, setCpSaving] = useState(false);

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

  const effectivePkgServiceId = pkgServiceId || activeServices[0]?.id || '';

  const handleCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpCode.trim() || cpSaving) return;
    setCpSaving(true);
    try {
      const ok = await onCreateCoupon({
        code: cpCode.trim(),
        kind: cpKind,
        discountType: cpDiscountType,
        value: cpValue,
        recipient: cpRecipient.trim(),
      });
      if (ok) {
        setCpCode('');
        setCpRecipient('');
      }
    } finally {
      setCpSaving(false);
    }
  };

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
    <VStack gap={4} className="fx-step-in">
      <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={2}>
        <SegmentedControl
          label="Sección de promociones y paquetes"
          size="sm"
          value={subTab}
          onChange={(v) => onSubTabChange(v as PromosSubTab)}
        >
          <SegmentedControlItem
            value="coupons"
            label={`Cupones y tarjetas (${coupons.length})`}
          />
          <SegmentedControlItem
            value="packages"
            label={`Paquetes de sesiones (${packagesCatalog.length})`}
          />
        </SegmentedControl>
      </HStack>

      {subTab === 'coupons' ? (
        <VStack className="ad-split" gap={0}>
          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" gap={2}>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={2} className="lk-serif ad-h2">
                  Cupones y tarjetas de regalo
                </Heading>
                <Text type="supporting" color="secondary">
                  Códigos de descuento y tarjetas con saldo que tus clientas pueden usar al agendar.
                </Text>
              </VStack>
              <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                {coupons.length}
              </Text>
            </HStack>

            {coupons.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyState
                  isCompact
                  title="Sin cupones activos"
                  description="Crea un cupón de descuento o una tarjeta de regalo desde el panel derecho."
                />
              </VStack>
            ) : (
              <VStack className="ad-table-scroll" gap={0}>
                <Table
                  idKey="id"
                  hasHover
                  data={[...coupons]}
                  columns={[
                    {
                      key: 'code',
                      header: 'Código',
                      renderCell: (c) => (
                        <HStack gap={1.5} align="center">
                          <Gift size={14} aria-hidden="true" />
                          <Text type="code" weight="semibold">
                            {c.code}
                          </Text>
                        </HStack>
                      ),
                    },
                    {
                      key: 'kind',
                      header: 'Tipo',
                      renderCell: (c) => (
                        <Text
                          color="inherit"
                          className="ad-chip"
                          data-tone={c.kind === 'gift_card' ? 'accent' : 'neutral'}
                        >
                          {c.kind === 'gift_card' ? 'Tarjeta de regalo' : 'Cupón'}
                        </Text>
                      ),
                    },
                    {
                      key: 'discountValue',
                      header: 'Beneficio / Saldo',
                      renderCell: (c) => (
                        <Text hasTabularNumbers>
                          {c.kind === 'gift_card'
                            ? `Saldo: ${formatCurrency(c.remainingBalanceCents ?? 0, currency)}`
                            : c.discountType === 'percent'
                              ? `${c.discountValue}%`
                              : formatCurrency(c.discountValue, currency)}
                        </Text>
                      ),
                    },
                    {
                      key: 'usedCount',
                      header: 'Usos',
                      renderCell: (c) => (
                        <Text hasTabularNumbers>
                          {c.usedCount}
                          {c.maxUses ? ` / ${c.maxUses}` : ''}
                        </Text>
                      ),
                    },
                  ]}
                />
              </VStack>
            )}
          </VStack>

          <VStack className="ad-surface" data-padded="true" gap={3}>
            <form onSubmit={(e) => void handleCouponSubmit(e)}>
              <VStack gap={3}>
                <Heading level={3} className="lk-serif ad-h3">
                  Crear cupón o tarjeta de regalo
                </Heading>
                <TextInput
                  label="Código"
                  placeholder="Ej. CUMPLE20 o REGALO500"
                  value={cpCode}
                  onChange={setCpCode}
                  isRequired
                />
                <Selector
                  label="Tipo"
                  value={cpKind}
                  onChange={(v) => v && setCpKind(v as 'coupon' | 'gift_card')}
                  options={[
                    { value: 'coupon', label: 'Cupón de descuento' },
                    { value: 'gift_card', label: 'Tarjeta de regalo con saldo' },
                  ]}
                />
                {cpKind === 'coupon' ? (
                  <Selector
                    label="Descuento por"
                    value={cpDiscountType}
                    onChange={(v) =>
                      v && setCpDiscountType(v as 'percent' | 'fixed_cents')
                    }
                    options={[
                      { value: 'percent', label: 'Porcentaje (%)' },
                      { value: 'fixed_cents', label: 'Monto fijo (MXN)' },
                    ]}
                  />
                ) : null}
                <NumberInput
                  label={
                    cpKind === 'gift_card' || cpDiscountType === 'fixed_cents'
                      ? 'Monto en MXN'
                      : 'Porcentaje (%)'
                  }
                  value={cpValue}
                  min={1}
                  onChange={setCpValue}
                />
                <TextInput
                  label="Para quién es (opcional)"
                  placeholder="Ej. Regalo para Ana"
                  value={cpRecipient}
                  onChange={setCpRecipient}
                  isOptional
                />
                <Divider />
                <Button
                  type="submit"
                  label="Crear código"
                  variant="primary"
                  width="100%"
                  isLoading={cpSaving}
                  isDisabled={cpSaving || !cpCode.trim()}
                />
              </VStack>
            </form>
          </VStack>
        </VStack>
      ) : (
        <VStack className="ad-split" gap={0}>
          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" gap={2}>
              <VStack gap={0.5} className="rb-grow">
                <Heading level={2} className="lk-serif ad-h2">
                  Paquetes de sesiones
                </Heading>
                <Text type="supporting" color="secondary">
                  Arma paquetes prepagados de retoques o servicios para asignar a tus clientas.
                </Text>
              </VStack>
              <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                {packagesCatalog.length}
              </Text>
            </HStack>

            {packagesLoading && packagesCatalog.length === 0 ? (
              <VStack padding={4} gap={2} role="status" aria-busy="true">
                <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
                <VStack className="ad-skeleton" data-size="row" aria-hidden="true" />
              </VStack>
            ) : packagesCatalog.length === 0 ? (
              <VStack className="ad-empty" gap={2}>
                <EmptyState
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
                            <Badge
                              variant={pkg.isActive ? 'success' : 'neutral'}
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
                              onChange={(nextVal) => void onTogglePackage(pkg, nextVal)}
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
          </VStack>

          {canManagePackages ? (
            <VStack className="ad-surface" data-padded="true" gap={3}>
              <form onSubmit={(e) => void handlePackageSubmit(e)}>
                <VStack gap={3}>
                  <Heading level={3} className="lk-serif ad-h3">
                    Nuevo paquete de sesiones
                  </Heading>
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
            </VStack>
          ) : null}
        </VStack>
      )}
    </VStack>
  );
}
