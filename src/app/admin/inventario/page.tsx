'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import {
  AlertTriangle,
  Package,
  PackagePlus,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigKpiStrip,
  AdminConfigPageHeader,
  AdminConfigSection,
  AdminConfigSkeleton,
  type AdminConfigKpiItem,
} from '@/components/admin/config/AdminConfigPrimitives';
import { formatCurrency } from '@/lib/format';
import type { InventoryItem } from '@/lib/types';

type InventoryFilter = 'all' | 'low' | 'retail' | 'cabin';

function applyDeltaMap(
  prev: Record<string, number>,
  itemId: string,
  delta: number,
): Record<string, number> {
  const nextVal = (prev[itemId] ?? 0) + delta;
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(prev)) {
    if (key !== itemId) {
      next[key] = value;
    }
  }
  if (nextVal !== 0) {
    next[itemId] = nextVal;
  }
  return next;
}

function removeKey(prev: Record<string, string>, keyToRemove: string): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(prev)) {
    if (key !== keyToRemove) {
      next[key] = value;
    }
  }
  return next;
}

export default function AdminInventoryPage() {
  const { data, loading, refresh } = useAdminData();
  const [filterMode, setFilterMode] = useState<InventoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyByItem, setBusyByItem] = useState<Record<string, string>>({});
  const [optimisticDeltas, setOptimisticDeltas] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<InventoryItem['category']>('Gel / Esmalte');
  const [unit, setUnit] = useState('frasco');
  const [stock, setStock] = useState(5);
  const [minAlert, setMinAlert] = useState(2);
  const [costMxn, setCostMxn] = useState(150);
  const [retailMxn, setRetailMxn] = useState(0);
  const [isForRetail, setIsForRetail] = useState(false);
  const [creating, setCreating] = useState(false);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={4} withSplit />;
  }

  const currency = data.settings.currency;
  const effectiveInventory = data.inventory.map((item) => {
    const pendingDelta = optimisticDeltas[item.id] ?? 0;
    if (pendingDelta === 0) return item;
    return {
      ...item,
      stockQuantity: Math.max(0, item.stockQuantity + pendingDelta),
    };
  });

  const lowStock = effectiveInventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );
  const retailCount = effectiveInventory.filter((i) => i.isActive && i.isForRetail).length;
  const totalCostCents = effectiveInventory.reduce(
    (sum, item) => sum + item.costCents * Math.max(0, item.stockQuantity),
    0,
  );

  const kpiItems: AdminConfigKpiItem[] = [
    {
      id: 'inv-total',
      label: 'Productos',
      value: String(effectiveInventory.length),
      sub: `${effectiveInventory.filter((i) => i.isActive).length} activos`,
    },
    {
      id: 'inv-low',
      label: 'Por acabarse',
      value: String(lowStock.length),
      sub: lowStock.length > 0 ? 'Falta resurtir' : 'Todo completo',
      tone: lowStock.length > 0 ? 'warning' : 'success',
    },
    {
      id: 'inv-retail',
      label: 'Para venta',
      value: String(retailCount),
      sub: 'Se cobran en Caja',
    },
    {
      id: 'inv-value',
      label: 'Valor invertido',
      value: formatCurrency(totalCostCents, currency),
      sub: 'A precio de compra',
    },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredInventory = effectiveInventory.filter((item) => {
    if (filterMode === 'low' && !(item.isActive && item.stockQuantity <= item.minStockAlert)) {
      return false;
    }
    if (filterMode === 'retail' && !item.isForRetail) return false;
    if (filterMode === 'cabin' && item.isForRetail) return false;
    if (!normalizedQuery) return true;
    return (
      item.name.toLowerCase().includes(normalizedQuery) ||
      item.sku.toLowerCase().includes(normalizedQuery) ||
      item.category.toLowerCase().includes(normalizedQuery)
    );
  });

  const adjust = async (
    itemId: string,
    delta: number,
    reason: 'restock' | 'service_usage' | 'retail_sale',
    notes: string,
  ) => {
    setBusyByItem((prev) => ({ ...prev, [itemId]: reason }));
    setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, delta));
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'inventory',
          data: { itemId, delta, reason, notes },
        }),
      });
      if (res.ok) {
        setMsg({
          status: 'success',
          text:
            reason === 'retail_sale'
              ? 'Venta registrada en Caja y descontada del inventario.'
              : reason === 'restock'
                ? 'Entrada (+1) sumada al inventario.'
                : 'Consumo (-1) descontado del inventario.',
        });
        await refresh();
        setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, -delta));
      } else {
        setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, -delta));
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar el inventario.',
        });
      }
    } catch {
      setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, -delta));
      setMsg({ status: 'error', text: 'No se pudo conectar para actualizar las existencias.' });
    } finally {
      setBusyByItem((prev) => removeKey(prev, itemId));
    }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setCreating(true);
    try {
      const generatedCode = sku.trim() || `PROD-${String(Date.now()).slice(-4)}`;
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'inventory',
          data: {
            newItem: {
              sku: generatedCode,
              name: name.trim(),
              category,
              unit: unit.trim() || 'pieza',
              stockQuantity: stock,
              minStockAlert: minAlert,
              costCents: Math.round(costMxn * 100),
              retailPriceCents: isForRetail ? Math.round(retailMxn * 100) : 0,
              isForRetail,
              isActive: true,
            },
          },
        }),
      });
      if (res.ok) {
        setName('');
        setSku('');
        setMsg({ status: 'success', text: 'Producto agregado a tu inventario.' });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudo guardar el producto.' });
      }
    } catch {
      setMsg({ status: 'error', text: 'No se pudo conectar para guardar el producto.' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Tu salón"
        title="Inventario"
        subtitle="Lleva el control de geles, acrílicos, tips y productos de venta con avisos cuando algo esté por acabarse."
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de inventario" items={kpiItems} cols={4} />

      {lowStock.length > 0 ? (
        <AdminConfigSection
          tone="warning"
          padded
          icon={<AlertTriangle size={16} aria-hidden="true" />}
          title={`${lowStock.length} ${lowStock.length === 1 ? 'producto por acabarse' : 'productos por acabarse'}`}
          subtitle="Repón en un toque o filtra la lista para ver qué falta comprar."
          actions={
            <Button
              type="button"
              label={filterMode === 'low' ? 'Ver todo' : 'Ver solo por acabarse'}
              variant="secondary"
              size="sm"
              onClick={() => setFilterMode((prev) => (prev === 'low' ? 'all' : 'low'))}
            />
          }
        >
          <VStack gap={2} width="100%">
            {lowStock.map((item) => {
              const isBusy = busyByItem[item.id] === 'restock';
              const pendingDelta = optimisticDeltas[item.id] ?? 0;
              return (
                <HStack
                  key={item.id}
                  gap={2}
                  justify="between"
                  align="center"
                  wrap="wrap"
                  className="ad-subpanel"
                >
                  <HStack gap={2} align="center" wrap="wrap" className="rb-grow">
                    <Text size="sm" weight="semibold">
                      {item.name}
                    </Text>
                    <AdminConfigChip
                      tone="warning"
                      label={`${item.stockQuantity} ${item.unit}`}
                      hasTabularNumbers
                    />
                    {pendingDelta !== 0 ? (
                      <AdminConfigChip
                        tone={pendingDelta > 0 ? 'success' : 'warning'}
                        label={pendingDelta > 0 ? `+${pendingDelta}` : String(pendingDelta)}
                        className="fx-pop"
                        hasTabularNumbers
                      />
                    ) : null}
                  </HStack>
                  <VStack style={{ flexShrink: 0 }}>
                    <Button
                      type="button"
                      label="+1 Reponer"
                      variant="secondary"
                      size="sm"
                      isLoading={isBusy}
                      isDisabled={Boolean(busyByItem[item.id])}
                      onClick={() =>
                        void adjust(item.id, 1, 'restock', 'Reposición rápida desde alerta')
                      }
                    />
                  </VStack>
                </HStack>
              );
            })}
          </VStack>
        </AdminConfigSection>
      ) : null}

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <VStack className="ad-split" gap={5}>
        <AdminConfigSection
          id="inventory-list-heading"
          title="Material y productos"
          subtitle="Registra entradas, consumos del salón o ventas directas a Caja."
          badge={
            <AdminConfigChip
              label={String(filteredInventory.length)}
              tone="neutral"
              hasTabularNumbers
            />
          }
        >
          <HStack className="ad-toolbar" justify="between" align="center" gap={2} wrap="wrap">
            <HStack gap={1.5} wrap="wrap" role="group" aria-label="Filtrar inventario">
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={filterMode === 'all' ? 'true' : 'false'}
                aria-pressed={filterMode === 'all'}
                onClick={() => setFilterMode('all')}
              >
                Todos ({data.inventory.length})
              </button>
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={filterMode === 'low' ? 'true' : 'false'}
                aria-pressed={filterMode === 'low'}
                onClick={() => setFilterMode('low')}
              >
                Por acabarse ({lowStock.length})
              </button>
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={filterMode === 'retail' ? 'true' : 'false'}
                aria-pressed={filterMode === 'retail'}
                onClick={() => setFilterMode('retail')}
              >
                Para venta ({retailCount})
              </button>
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={filterMode === 'cabin' ? 'true' : 'false'}
                aria-pressed={filterMode === 'cabin'}
                onClick={() => setFilterMode('cabin')}
              >
                Uso en salón
              </button>
            </HStack>

            <VStack width="min(14rem, 100%)">
              <TextInput
                label="Buscar producto"
                isLabelHidden
                size="sm"
                placeholder="Buscar producto o categoría..."
                value={searchQuery}
                onChange={setSearchQuery}
                startIcon={<Search size={14} aria-hidden="true" />}
              />
            </VStack>
          </HStack>

          {filteredInventory.length === 0 ? (
            <AdminConfigEmpty
              icon={<Package size={22} aria-hidden="true" />}
              title="Sin productos en este filtro"
              description="Cambia el filtro o agrega un producto nuevo desde el panel derecho."
              action={
                filterMode !== 'all' || searchQuery ? (
                  <Button
                    type="button"
                    label="Ver todo"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFilterMode('all');
                      setSearchQuery('');
                    }}
                  />
                ) : null
              }
            />
          ) : (
            <VStack as="ul" className="ad-row-list" gap={0}>
              {filteredInventory.map((item) => {
                const isLow = item.stockQuantity <= item.minStockAlert;
                const activeReason = busyByItem[item.id] ?? null;
                const isRowBusy = activeReason !== null;
                const pendingDelta = optimisticDeltas[item.id] ?? 0;

                return (
                  <li key={item.id} className="ad-row-item">
                    <VStack gap={1} className="rb-grow">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="semibold">{item.name}</Text>
                        <AdminConfigChip
                          tone={isLow ? 'warning' : 'success'}
                          label={`${item.stockQuantity} ${item.unit}`}
                          hasTabularNumbers
                        />
                        {pendingDelta !== 0 ? (
                          <AdminConfigChip
                            tone={pendingDelta > 0 ? 'success' : 'warning'}
                            label={pendingDelta > 0 ? `+${pendingDelta}` : String(pendingDelta)}
                            className="fx-pop"
                            hasTabularNumbers
                          />
                        ) : null}
                        {item.isForRetail ? (
                          <AdminConfigChip
                            tone="accent"
                            label={`Venta ${formatCurrency(item.retailPriceCents, currency)}`}
                            hasTabularNumbers
                          />
                        ) : null}
                      </HStack>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {item.category} · Mín. {item.minStockAlert} · Compra{' '}
                        {formatCurrency(item.costCents, currency)}
                      </Text>
                    </VStack>

                    <HStack gap={1.5} wrap="wrap" align="center">
                      <Button
                        type="button"
                        label="+1 Entrada"
                        size="sm"
                        variant="secondary"
                        isLoading={activeReason === 'restock'}
                        isDisabled={isRowBusy}
                        onClick={() =>
                          void adjust(item.id, 1, 'restock', 'Reposición de material')
                        }
                      />
                      <Button
                        type="button"
                        label="-1 Consumo"
                        size="sm"
                        variant="ghost"
                        isLoading={activeReason === 'service_usage'}
                        isDisabled={isRowBusy || item.stockQuantity <= 0}
                        onClick={() =>
                          void adjust(
                            item.id,
                            -1,
                            'service_usage',
                            'Consumo interno del salón',
                          )
                        }
                      />
                      {item.isForRetail ? (
                        <Button
                          type="button"
                          label="Vender"
                          size="sm"
                          variant="primary"
                          icon={<ShoppingBag size={13} aria-hidden="true" />}
                          isLoading={activeReason === 'retail_sale'}
                          isDisabled={isRowBusy || item.stockQuantity <= 0}
                          onClick={() =>
                            void adjust(
                              item.id,
                              -1,
                              'retail_sale',
                              'Venta directa a clienta',
                            )
                          }
                        />
                      ) : null}
                    </HStack>
                  </li>
                );
              })}
            </VStack>
          )}
        </AdminConfigSection>

        <AdminConfigSection
          id="inventory-create-heading"
          icon={<PackagePlus size={16} aria-hidden="true" />}
          title="Agregar producto"
          subtitle="Define cuándo avisarte y si también se vende a tus clientas."
        >
          <form onSubmit={createItem}>
            <VStack gap={3} className="ad-card-body" paddingBlockStart={4}>
              <TextInput
                label="Nombre"
                placeholder="Ej. Top Coat Gloss Sin Capa"
                value={name}
                onChange={setName}
                isRequired
              />
              <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
                <TextInput
                  label="Código"
                  placeholder="Ej. GEL-01"
                  value={sku}
                  onChange={setSku}
                  isOptional
                />
                <Selector
                  label="Categoría"
                  value={category}
                  onChange={(v) => v && setCategory(v as InventoryItem['category'])}
                  options={[
                    { value: 'Gel / Esmalte', label: 'Gel / Esmalte' },
                    { value: 'Acrílico', label: 'Acrílico' },
                    { value: 'Insumo', label: 'Material de salón' },
                    { value: 'Decoración', label: 'Decoración' },
                    { value: 'Reventa', label: 'Para venta' },
                  ]}
                />
              </Grid>
              <Grid columns={{ minWidth: 96, max: 3 }} gap={2}>
                <NumberInput
                  label="Cantidad"
                  value={stock}
                  min={0}
                  isIntegerOnly
                  onChange={setStock}
                />
                <NumberInput
                  label="Avisar en"
                  value={minAlert}
                  min={0}
                  isIntegerOnly
                  onChange={setMinAlert}
                />
                <TextInput label="Unidad" value={unit} onChange={setUnit} />
              </Grid>
              <NumberInput
                label="Precio de compra (MXN)"
                value={costMxn}
                min={0}
                onChange={setCostMxn}
              />
              <Switch
                label="También se vende a clientas (se suma directo a Caja)"
                value={isForRetail}
                onChange={setIsForRetail}
              />
              {isForRetail ? (
                <NumberInput
                  label="Precio de venta (MXN)"
                  value={retailMxn}
                  min={0}
                  onChange={setRetailMxn}
                />
              ) : null}
              <Button
                type="submit"
                label="Guardar producto"
                variant="primary"
                icon={<PackagePlus size={15} aria-hidden="true" />}
                width="100%"
                isLoading={creating}
                isDisabled={name.trim().length < 2 || creating}
              />
            </VStack>
          </form>
        </AdminConfigSection>
      </VStack>
    </VStack>
  );
}
