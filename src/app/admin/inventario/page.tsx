'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Package, Scissors, Search, ShoppingBag, Wallet } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { AdminAccessGuard } from '@/components/admin/AdminAccessGuard';
import {
  InventoryItemForm,
  inventoryCategoryLabel,
  type NewInventoryItemInput,
} from '@/components/admin/inventario/InventoryItemForm';
import { InventoryLowStockAlert } from '@/components/admin/inventario/InventoryLowStockAlert';
import {
  adjustInventoryRequest,
  applyDeltaMap,
  createInventoryItemRequest,
  removeKey,
} from '@/components/admin/inventario/inventoryActions';
import {
  ActionRow,
  EmptyStateCard,
  FilterPillBar,
  PageHeader,
  PageSkeleton,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import {
  cajaHref,
  inventarioHref,
  parseInventarioParams,
  serviciosHref,
  type InventarioFilterParam,
} from '@/lib/admin-links';
import { formatCurrency, formatUnitCount } from '@/lib/format';
import { FORM_SUBMIT_OK, formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';
import { invalidateAdminDomain } from '@/lib/hooks/useAdminCache';
import { roleCanAccess } from '@/lib/rbac';

export default function AdminInventoryPage() {
  const router = useRouter();
  const { data, loading, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const parsedParams = parseInventarioParams(searchParams);
  const urlSignature = `${parsedParams.filter ?? ''}|${parsedParams.itemId ?? ''}|${parsedParams.q ?? ''}`;
  const [appliedUrlSignature, setAppliedUrlSignature] = useState(urlSignature);
  const [filterMode, setFilterMode] = useState<InventarioFilterParam>(
    () => parsedParams.filter ?? 'all',
  );
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(
    () => parsedParams.itemId ?? null,
  );
  const [searchQuery, setSearchQuery] = useState(() => parsedParams.q ?? '');
  const [busyByItem, setBusyByItem] = useState<Record<string, string>>({});
  const [optimisticDeltas, setOptimisticDeltas] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);

  if (urlSignature !== appliedUrlSignature) {
    setAppliedUrlSignature(urlSignature);
    setFilterMode(parsedParams.filter ?? 'all');
    setHighlightedItemId(parsedParams.itemId ?? null);
    if (parsedParams.q !== undefined) {
      setSearchQuery(parsedParams.q);
    }
  }

  if (loading || !data) {
    return <PageSkeleton kpiCount={0} withSplit ariaLabel="Cargando inventario" />;
  }

  const syncInventoryUrl = (nextFilter: InventarioFilterParam, nextQuery = searchQuery) => {
    const cleanQ = nextQuery.trim();
    router.replace(
      inventarioHref({
        ...(nextFilter !== 'all' ? { filter: nextFilter } : {}),
        ...(cleanQ ? { q: cleanQ } : {}),
      }),
      { scroll: false },
    );
  };

  const handleFilterChange = (nextFilter: InventarioFilterParam) => {
    setFilterMode(nextFilter);
    setHighlightedItemId(null);
    syncInventoryUrl(nextFilter);
  };

  const currency = data.settings.currency;
  const role = data.session.user.role;
  const canViewCash = roleCanAccess(role, 'cash');
  const canViewServices = roleCanAccess(role, 'services');
  const effectiveInventory = data.inventory.map((item) => {
    const pendingDelta = optimisticDeltas[item.id] ?? 0;
    if (pendingDelta === 0) return item;
    return { ...item, stockQuantity: Math.max(0, item.stockQuantity + pendingDelta) };
  });

  const lowStock = effectiveInventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );
  const retailCount = effectiveInventory.filter((i) => i.isActive && i.isForRetail).length;
  const cabinCount = effectiveInventory.filter((i) => i.isActive && !i.isForRetail).length;

  const filterOptions: FilterPillOption<InventarioFilterParam>[] = [
    { value: 'all', label: 'Todos', count: data.inventory.length },
    { value: 'low_stock', label: 'Por acabarse', count: lowStock.length },
    { value: 'retail', label: 'Para venta', count: retailCount },
    { value: 'cabin', label: 'Uso en salón', count: cabinCount },
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredInventory = effectiveInventory
    .filter((item) => {
      if (
        filterMode === 'low_stock' &&
        !(item.isActive && item.stockQuantity <= item.minStockAlert)
      ) {
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
    })
    .toSorted(
      (a, b) => Number(b.id === highlightedItemId) - Number(a.id === highlightedItemId),
    );

  const adjust = async (
    itemId: string,
    delta: number,
    reason: 'restock' | 'service_usage',
    notes: string,
  ) => {
    if (busyByItem[itemId]) return;
    setBusyByItem((prev) => ({ ...prev, [itemId]: reason }));
    setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, delta));
    try {
      const result = await adjustInventoryRequest(itemId, delta, reason, notes);
      setMsg(result);
      if (result.status === 'success') {
        invalidateAdminDomain('cash');
        await refresh();
      }
    } finally {
      setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, -delta));
      setBusyByItem((prev) => removeKey(prev, itemId));
    }
  };

  const handleCreateItem = async (newItem: NewInventoryItemInput): Promise<FormSubmitResult> => {
    const result = await createInventoryItemRequest(newItem);
    if (result.status !== 'success') return formSubmitError(result.text);
    setMsg(result);
    invalidateAdminDomain('cash');
    await refresh();
    return FORM_SUBMIT_OK;
  };

  return (
    <AdminAccessGuard role={role} section="inventory" sectionLabel="Inventario">
      <VStack className="ad-page" gap={5}>
        <PageHeader
          title="Inventario"
          subtitle="Te avisamos cuando algo se esté acabando."
          actions={
            <>
              {canViewCash ? (
                <Button
                  label="Ir a Caja"
                  variant="secondary"
                  size="sm"
                  icon={<Wallet size={14} aria-hidden="true" />}
                  href={cajaHref({ tab: 'resumen' })}
                />
              ) : null}
              {canViewServices ? (
                <Button
                  label="Servicios"
                  variant="ghost"
                  size="sm"
                  icon={<Scissors size={14} aria-hidden="true" />}
                  href={serviciosHref()}
                />
              ) : null}
              <InventoryItemForm currency={currency} onCreateItem={handleCreateItem} />
            </>
          }
        />

        <InventoryLowStockAlert
          lowStock={lowStock}
          isFilteredLow={filterMode === 'low_stock'}
          busyByItem={busyByItem}
          optimisticDeltas={optimisticDeltas}
          onToggleFilterLow={() =>
            handleFilterChange(filterMode === 'low_stock' ? 'all' : 'low_stock')
          }
          onRestock={(itemId) => void adjust(itemId, 1, 'restock', 'Reposición rápida desde alerta')}
        />

        {msg ? (
          <Banner
            status={msg.status}
            role={msg.status === 'error' ? 'alert' : 'status'}
            title={msg.text}
            isDismissable
            onDismiss={() => setMsg(null)}
          />
        ) : null}

        <VStack gap={5}>
          <SurfaceCard
            id="inventory-list-heading"
            title="Material y productos"
            subtitle="Suma lo que compras, resta insumos usados y cobra ventas desde Caja con forma de pago."
            count={filteredInventory.length}
          >
            <HStack
              className="ad-toolbar"
              justify="between"
              align="center"
              gap={2}
              wrap="wrap"
              paddingInline={4}
              paddingBlock={3}
            >
              <FilterPillBar
                ariaLabel="Filtrar inventario"
                mode="pills"
                size="sm"
                value={filterMode}
                options={filterOptions}
                onChange={handleFilterChange}
              />
              <VStack width="min(14rem, 100%)">
                <TextInput
                  label="Buscar producto"
                  isLabelHidden
                  size="sm"
                  placeholder="Buscar producto o categoría…"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  startIcon={<Search size={14} aria-hidden="true" />}
                />
              </VStack>
            </HStack>

            {filteredInventory.length === 0 ? (
              <VStack padding={4}>
                <EmptyStateCard
                  framed={false}
                  isCompact
                  icon={<Package size={22} aria-hidden="true" />}
                  title="Sin productos en este filtro"
                  description='Cambia el filtro o agrega un producto nuevo con el botón "Agregar producto".'
                  actions={
                    filterMode !== 'all' || searchQuery ? (
                      <Button
                        type="button"
                        label="Ver todo"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setFilterMode('all');
                          setSearchQuery('');
                          setHighlightedItemId(null);
                          syncInventoryUrl('all', '');
                        }}
                      />
                    ) : undefined
                  }
                />
              </VStack>
            ) : (
              <VStack className="ad-row-list" gap={0}>
                {filteredInventory.map((item) => {
                  const isLow = item.stockQuantity <= item.minStockAlert;
                  const isHighlighted = highlightedItemId === item.id;
                  const activeReason = busyByItem[item.id] ?? null;
                  const isRowBusy = activeReason !== null;
                  const pendingDelta = optimisticDeltas[item.id] ?? 0;
                  const hasMargin =
                    item.isForRetail && item.retailPriceCents > 0 && item.costCents > 0;
                  const marginCents = hasMargin ? item.retailPriceCents - item.costCents : 0;
                  const marginPercent = hasMargin
                    ? Math.round((marginCents / item.retailPriceCents) * 100)
                    : 0;

                  return (
                    <ActionRow
                      key={item.id}
                      className={isHighlighted ? 'ad-row-highlight' : undefined}
                      title={
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text weight="semibold">{item.name}</Text>
                          <StatusTag
                            tone={isLow ? 'warning' : 'success'}
                            label={formatUnitCount(item.stockQuantity, item.unit)}
                            hasTabularNumbers
                          />
                          {pendingDelta !== 0 ? (
                            <StatusTag
                              tone={pendingDelta > 0 ? 'success' : 'warning'}
                              label={pendingDelta > 0 ? `+${pendingDelta}` : String(pendingDelta)}
                              className="fx-pop"
                              hasTabularNumbers
                            />
                          ) : null}
                          {item.isForRetail ? (
                            <StatusTag
                              tone="accent"
                              label={`Venta ${formatCurrency(item.retailPriceCents, currency)}`}
                              hasTabularNumbers
                            />
                          ) : null}
                          {hasMargin ? (
                            <StatusTag
                              tone={marginCents >= 0 ? 'success' : 'danger'}
                              label={`Margen ${marginCents >= 0 ? '+' : '−'}${formatCurrency(Math.abs(marginCents), currency)} (${marginPercent}%)`}
                              hasTabularNumbers
                            />
                          ) : null}
                        </HStack>
                      }
                      subtitle={`${inventoryCategoryLabel(item.category)} · Avisar al quedar ${item.minStockAlert} · Cuesta ${formatCurrency(item.costCents, currency)}`}
                      actions={
                        <HStack gap={1.5} wrap="wrap" align="center">
                          <Button
                            type="button"
                            label="+1 Compré"
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
                            label="+5 Compré"
                            size="sm"
                            variant="ghost"
                            isDisabled={isRowBusy}
                            onClick={() =>
                              void adjust(item.id, 5, 'restock', 'Reposición rápida (+5)')
                            }
                          />
                          <Button
                            type="button"
                            label="−1 Usé"
                            size="sm"
                            variant="ghost"
                            isLoading={activeReason === 'service_usage'}
                            isDisabled={isRowBusy || item.stockQuantity <= 0}
                            onClick={() =>
                              void adjust(item.id, -1, 'service_usage', 'Consumo interno del salón')
                            }
                          />
                          {item.isForRetail ? (
                            item.stockQuantity > 0 && canViewCash ? (
                              <Button
                                label="Vender"
                                size="sm"
                                variant="primary"
                                icon={<ShoppingBag size={13} aria-hidden="true" />}
                                href={cajaHref({ tab: 'resumen', quickSaleProductId: item.id })}
                              />
                            ) : (
                              <Button
                                type="button"
                                label={item.stockQuantity <= 0 ? 'Sin stock' : 'Vender'}
                                size="sm"
                                variant="secondary"
                                icon={<ShoppingBag size={13} aria-hidden="true" />}
                                isDisabled
                              />
                            )
                          ) : null}
                        </HStack>
                      }
                    />
                  );
                })}
              </VStack>
            )}
          </SurfaceCard>
        </VStack>
      </VStack>
    </AdminAccessGuard>
  );
}
