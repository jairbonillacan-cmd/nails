import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
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
  reason: 'restock' | 'service_usage',
  notes: string,
): Promise<{ status: 'success' | 'error'; text: string }> {
  const result = await fetchJsonWithTimeout('/api/admin/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'inventory', data: { itemId, delta, reason, notes } }),
  });
  if (result.ok) {
    return {
      status: 'success',
      text:
        reason === 'restock'
          ? `Entrada (+${Math.abs(delta)}) sumada al inventario.`
          : `Consumo (−${Math.abs(delta)}) descontado del inventario.`,
    };
  }
  return { status: 'error', text: result.error || 'No se pudo actualizar el inventario.' };
}

export async function createInventoryItemRequest(
  newItem: NewInventoryItemInput,
): Promise<{ status: 'success' | 'error'; text: string }> {
  const result = await fetchJsonWithTimeout('/api/admin/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'inventory', data: { newItem } }),
  });
  if (result.ok) {
    return { status: 'success', text: 'Producto agregado a tu inventario.' };
  }
  return { status: 'error', text: result.error || 'No se pudo guardar el producto.' };
}
