'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Package, Search, ShoppingBag } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
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
import { formatCurrency, formatUnitCount } from '@/lib/format';
import { FORM_SUBMIT_OK, formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';

type InventoryFilter = 'all' | 'low' | 'retail' | 'cabin';

export default function AdminInventoryPage() {
  const { data, loading, refresh } = useAdminData();
  const [filterMode, setFilterMode] = useState<InventoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyByItem, setBusyByItem] = useState<Record<string, string>>({});
  const [optimisticDeltas, setOptimisticDeltas] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);

  if (loading || !data) {
    return <PageSkeleton kpiCount={0} withSplit ariaLabel="Cargando inventario" />;
  }

  const currency = data.settings.currency;
  const effectiveInventory = data.inventory.map((item) => {
    const pendingDelta = optimisticDeltas[item.id] ?? 0;
    if (pendingDelta === 0) return item;
    return { ...item, stockQuantity: Math.max(0, item.stockQuantity + pendingDelta) };
  });

  const lowStock = effectiveInventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );
  const retailCount = effectiveInventory.filter((i) => i.isActive && i.isForRetail).length;

  const filterOptions: FilterPillOption<InventoryFilter>[] = [
    { value: 'all', label: 'Todos', count: data.inventory.length },
    { value: 'low', label: 'Por acabarse', count: lowStock.length },
    { value: 'retail', label: 'Para venta', count: retailCount },
    { value: 'cabin', label: 'Uso en salón' },
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
      const result = await adjustInventoryRequest(itemId, delta, reason, notes);
      setMsg(result);
      if (result.status === 'success') await refresh();
      setOptimisticDeltas((prev) => applyDeltaMap(prev, itemId, -delta));
    } finally {
      setBusyByItem((prev) => removeKey(prev, itemId));
    }
  };

  const handleCreateItem = async (newItem: NewInventoryItemInput): Promise<FormSubmitResult> => {
    const result = await createInventoryItemRequest(newItem);
    if (result.status !== 'success') return formSubmitError(result.text);
    setMsg(result);
    await refresh();
    return FORM_SUBMIT_OK;
  };

  return (
    <VStack className="ad-page" gap={5}>
      <PageHeader
        title="Inventario"
        subtitle="Te avisamos cuando algo se esté acabando."
        actions={<InventoryItemForm onCreateItem={handleCreateItem} />}
      />

      <InventoryLowStockAlert
        lowStock={lowStock}
        isFilteredLow={filterMode === 'low'}
        busyByItem={busyByItem}
        optimisticDeltas={optimisticDeltas}
        onToggleFilterLow={() => setFilterMode((prev) => (prev === 'low' ? 'all' : 'low'))}
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
          subtitle="Suma lo que compras y resta lo que usas o vendes."
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
              onChange={setFilterMode}
            />
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
            <VStack padding={4}>
              <EmptyStateCard
                framed={false}
                isCompact
                icon={<Package size={22} aria-hidden="true" />}
                title="Sin productos en este filtro"
                description='Cambia el filtro o agrega un producto nuevo con el botón "Agregar producto" arriba a la derecha.'
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
                const activeReason = busyByItem[item.id] ?? null;
                const isRowBusy = activeReason !== null;
                const pendingDelta = optimisticDeltas[item.id] ?? 0;

                return (
                  <ActionRow
                    key={item.id}
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
                          <Button
                            type="button"
                            label="Vender"
                            size="sm"
                            variant="primary"
                            icon={<ShoppingBag size={13} aria-hidden="true" />}
                            isLoading={activeReason === 'retail_sale'}
                            isDisabled={isRowBusy || item.stockQuantity <= 0}
                            onClick={() =>
                              void adjust(item.id, -1, 'retail_sale', 'Venta directa a clienta')
                            }
                          />
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
  );
}
