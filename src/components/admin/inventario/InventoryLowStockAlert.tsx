'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { AlertTriangle } from 'lucide-react';
import type { InventoryItem } from '@/lib/types';
import { formatUnitCount } from '@/lib/format';
import { ActionRow, StatusTag, SurfaceCard } from '@/components/ui';

interface InventoryLowStockAlertProps {
  lowStock: readonly InventoryItem[];
  isFilteredLow: boolean;
  busyByItem: Readonly<Record<string, string>>;
  optimisticDeltas: Readonly<Record<string, number>>;
  onToggleFilterLow: () => void;
  onRestock: (itemId: string) => void;
}

export function InventoryLowStockAlert({
  lowStock,
  isFilteredLow,
  busyByItem,
  optimisticDeltas,
  onToggleFilterLow,
  onRestock,
}: InventoryLowStockAlertProps) {
  if (lowStock.length === 0) return null;

  return (
    <SurfaceCard
      tone="warning"
      padded
      icon={<AlertTriangle size={16} aria-hidden="true" />}
      title={`${lowStock.length} ${lowStock.length === 1 ? 'producto por acabarse' : 'productos por acabarse'}`}
      subtitle="Repón en un toque o filtra la lista para ver qué falta comprar."
      actions={
        <Button
          type="button"
          label={isFilteredLow ? 'Ver todo' : 'Ver solo por acabarse'}
          variant="secondary"
          size="sm"
          onClick={onToggleFilterLow}
        />
      }
    >
      <VStack gap={2} width="100%">
        {lowStock.map((item) => {
          const isBusy = busyByItem[item.id] === 'restock';
          const pendingDelta = optimisticDeltas[item.id] ?? 0;
          return (
            <ActionRow
              key={item.id}
              className="ad-subpanel"
              title={
                <HStack gap={2} align="center" wrap="wrap">
                  <Text size="sm" weight="semibold">
                    {item.name}
                  </Text>
                  <StatusTag
                    tone="warning"
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
                </HStack>
              }
              actions={
                <Button
                  type="button"
                  label="+1 Reponer"
                  variant="secondary"
                  size="sm"
                  isLoading={isBusy}
                  isDisabled={Boolean(busyByItem[item.id])}
                  onClick={() => onRestock(item.id)}
                />
              }
            />
          );
        })}
      </VStack>
    </SurfaceCard>
  );
}
