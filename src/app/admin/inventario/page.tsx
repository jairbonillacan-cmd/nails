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

export default function AdminInventoryPage() {
  const { data, loading, refresh } = useAdminData();
  const [filterMode, setFilterMode] = useState<InventoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
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
  const lowStock = data.inventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );
  const retailCount = data.inventory.filter((i) => i.isActive && i.isForRetail).length;
  const totalCostCents = data.inventory.reduce(
    (sum, item) => sum + item.costCents * Math.max(0, item.stockQuantity),
    0,
  );

  const kpiItems: AdminConfigKpiItem[] = [
    {
      id: 'inv-total',
      label: 'Total insumos',
      value: String(data.inventory.length),
      sub: `${data.inventory.filter((i) => i.isActive).length} activos`,
    },
    {
      id: 'inv-low',
      label: 'Stock bajo',
      value: String(lowStock.length),
      sub: lowStock.length > 0 ? 'Requieren reposición' : 'Niveles saludables',
      tone: lowStock.length > 0 ? 'warning' : 'success',
    },
    {
      id: 'inv-retail',
      label: 'Reventa',
      value: String(retailCount),
      sub: 'Suman directo a Caja',
    },
    {
      id: 'inv-value',
      label: 'Valor en stock',
      value: formatCurrency(totalCostCents, currency),
      sub: 'A costo unitario',
    },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredInventory = data.inventory.filter((item) => {
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
    const actionKey = `${itemId}:${reason}`;
    setBusyAction(actionKey);
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
              ? 'Venta registrada en Caja y descontada de inventario.'
              : reason === 'restock'
                ? 'Entrada (+1) registrada en inventario.'
                : 'Consumo interno (-1) descontado del stock.',
        });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudo registrar el movimiento.' });
      }
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al actualizar stock.' });
    } finally {
      setBusyAction(null);
    }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    setCreating(true);
    try {
      const generatedSku = sku.trim() || `SKU-${String(Date.now()).slice(-4)}`;
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'inventory',
          data: {
            newItem: {
              sku: generatedSku,
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
        setMsg({ status: 'success', text: 'Producto/insumo agregado al inventario.' });
        await refresh();
      } else {
        setMsg({ status: 'error', text: 'No se pudo guardar el producto.' });
      }
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al guardar el producto.' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Catálogo e insumos"
        title="Inventario e insumos"
        subtitle="Controla geles, acrílicos, tips y productos de reventa con alertas de stock mínimo y descuento instantáneo a cabina o Caja."
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de inventario" items={kpiItems} cols={4} />

      {lowStock.length > 0 ? (
        <AdminConfigSection
          tone="warning"
          padded
          icon={<AlertTriangle size={16} aria-hidden="true" />}
          title={`${lowStock.length} insumo${lowStock.length === 1 ? '' : 's'} por debajo del mínimo`}
          subtitle="Repón en 1 toque o filtra la lista para revisar existencias críticas."
          actions={
            <Button
              type="button"
              label={filterMode === 'low' ? 'Ver todo el inventario' : 'Ver solo stock bajo'}
              variant="secondary"
              size="sm"
              onClick={() => setFilterMode((prev) => (prev === 'low' ? 'all' : 'low'))}
            />
          }
        >
          <VStack gap={2} width="100%">
            {lowStock.map((item) => {
              const isBusy = busyAction === `${item.id}:restock`;
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
                  </HStack>
                  <VStack style={{ flexShrink: 0 }}>
                    <Button
                      type="button"
                      label="+1 Reponer"
                      variant="secondary"
                      size="sm"
                      isLoading={isBusy}
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
          title="Existencias y movimientos"
          subtitle="Registra entradas, consumos de cabina o ventas directas a Caja."
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
                Stock bajo ({lowStock.length})
              </button>
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={filterMode === 'retail' ? 'true' : 'false'}
                aria-pressed={filterMode === 'retail'}
                onClick={() => setFilterMode('retail')}
              >
                Reventa ({retailCount})
              </button>
              <button
                type="button"
                className="ad-pill fx-press"
                data-on={filterMode === 'cabin' ? 'true' : 'false'}
                aria-pressed={filterMode === 'cabin'}
                onClick={() => setFilterMode('cabin')}
              >
                Cabina
              </button>
            </HStack>

            <VStack maxWidth={220} width="100%">
              <TextInput
                label="Buscar insumo"
                isLabelHidden
                size="sm"
                placeholder="Buscar SKU o producto..."
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
              description="Ajusta la búsqueda o agrega un nuevo insumo desde el panel derecho."
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
                const isRowBusy = busyAction?.startsWith(`${item.id}:`) ?? false;

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
                        {item.isForRetail ? (
                          <AdminConfigChip
                            tone="accent"
                            label={`Reventa ${formatCurrency(item.retailPriceCents, currency)}`}
                            hasTabularNumbers
                          />
                        ) : null}
                      </HStack>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {item.sku} · {item.category} · Mín. {item.minStockAlert} · Costo{' '}
                        {formatCurrency(item.costCents, currency)}
                      </Text>
                    </VStack>

                    <HStack gap={1.5} wrap="wrap" align="center">
                      <Button
                        type="button"
                        label="+1 Entrada"
                        size="sm"
                        variant="secondary"
                        isLoading={busyAction === `${item.id}:restock`}
                        isDisabled={isRowBusy}
                        onClick={() =>
                          void adjust(item.id, 1, 'restock', 'Reposición de stock')
                        }
                      />
                      <Button
                        type="button"
                        label="-1 Consumo"
                        size="sm"
                        variant="ghost"
                        isLoading={busyAction === `${item.id}:service_usage`}
                        isDisabled={isRowBusy || item.stockQuantity <= 0}
                        onClick={() =>
                          void adjust(
                            item.id,
                            -1,
                            'service_usage',
                            'Consumo interno de cabina',
                          )
                        }
                      />
                      {item.isForRetail ? (
                        <Button
                          type="button"
                          label="Vender (Caja)"
                          size="sm"
                          variant="primary"
                          icon={<ShoppingBag size={13} aria-hidden="true" />}
                          isLoading={busyAction === `${item.id}:retail_sale`}
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
          title="Agregar insumo / producto"
          subtitle="Define alerta mínima y si estará disponible para reventa."
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
                <TextInput label="SKU" value={sku} onChange={setSku} isOptional />
                <Selector
                  label="Categoría"
                  value={category}
                  onChange={(v) => v && setCategory(v as InventoryItem['category'])}
                  options={[
                    { value: 'Gel / Esmalte', label: 'Gel / Esmalte' },
                    { value: 'Acrílico', label: 'Acrílico' },
                    { value: 'Insumo', label: 'Insumo' },
                    { value: 'Decoración', label: 'Decoración' },
                    { value: 'Reventa', label: 'Reventa' },
                  ]}
                />
              </Grid>
              <Grid columns={{ minWidth: 96, max: 3 }} gap={2}>
                <NumberInput
                  label="Stock"
                  value={stock}
                  min={0}
                  isIntegerOnly
                  onChange={setStock}
                />
                <NumberInput
                  label="Alerta mín."
                  value={minAlert}
                  min={0}
                  isIntegerOnly
                  onChange={setMinAlert}
                />
                <TextInput label="Unidad" value={unit} onChange={setUnit} />
              </Grid>
              <NumberInput
                label="Costo unitario (MXN)"
                value={costMxn}
                min={0}
                onChange={setCostMxn}
              />
              <Switch
                label="Disponible para venta al público (suma directo a Caja)"
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
