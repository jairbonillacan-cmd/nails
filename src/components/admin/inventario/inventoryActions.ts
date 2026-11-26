import { formatCurrency } from '@/lib/format';
import type { InventoryItem } from '@/lib/types';
import type { MetricTileItem } from '@/components/ui';
import type { NewInventoryItemInput } from './InventoryItemForm';

export function applyDeltaMap(
  prev: Record<string, number>,
  itemId: string,
  delta: number,
): Record<string, number> {
  const nextVal = (prev[itemId] ?? 0) + delta;
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(prev)) {
    if (key !== itemId) next[key] = value;
  }
  if (nextVal !== 0) next[itemId] = nextVal;
  return next;
}

export function removeKey(
  prev: Record<string, string>,
  keyToRemove: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(prev)) {
    if (key !== keyToRemove) next[key] = value;
  }
  return next;
}

export function buildInventoryKpiItems(
  effectiveInventory: readonly InventoryItem[],
  lowStockCount: number,
  retailCount: number,
  currency: 'MXN' | 'USD',
): MetricTileItem[] {
  const totalCostCents = effectiveInventory.reduce(
    (sum, item) => sum + item.costCents * Math.max(0, item.stockQuantity),
    0,
  );
  return [
    {
      id: 'inv-total',
      label: 'Productos',
      value: String(effectiveInventory.length),
      sub: `${effectiveInventory.filter((i) => i.isActive).length} activos`,
    },
    {
      id: 'inv-low',
      label: 'Por acabarse',
      value: String(lowStockCount),
      sub: lowStockCount > 0 ? 'Falta resurtir' : 'Todo completo',
      tone: lowStockCount > 0 ? 'warning' : 'success',
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
}

export async function adjustInventoryRequest(
  itemId: string,
  delta: number,
  reason: 'restock' | 'service_usage' | 'retail_sale',
  notes: string,
): Promise<{ status: 'success' | 'error'; text: string }> {
  try {
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'inventory', data: { itemId, delta, reason, notes } }),
    });
    if (res.ok) {
      return {
        status: 'success',
        text:
          reason === 'retail_sale'
            ? 'Venta registrada en Caja y descontada del inventario.'
            : reason === 'restock'
              ? 'Entrada (+1) sumada al inventario.'
              : 'Consumo (-1) descontado del inventario.',
      };
    }
    const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
    return { status: 'error', text: errJson?.error || 'No se pudo actualizar el inventario.' };
  } catch {
    return { status: 'error', text: 'No se pudo conectar para actualizar las existencias.' };
  }
}

export async function createInventoryItemRequest(
  newItem: NewInventoryItemInput,
): Promise<{ status: 'success' | 'error'; text: string }> {
  try {
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'inventory', data: { newItem } }),
    });
    if (res.ok) {
      return { status: 'success', text: 'Producto agregado a tu inventario.' };
    }
    return { status: 'error', text: 'No se pudo guardar el producto.' };
  } catch {
    return { status: 'error', text: 'No se pudo conectar para guardar el producto.' };
  }
}
