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
