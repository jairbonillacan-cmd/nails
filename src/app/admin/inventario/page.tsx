'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { PackagePlus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { formatCurrency } from '@/lib/format';
import type { InventoryItem } from '@/lib/types';

export default function AdminInventoryPage() {
  const { data, refresh } = useAdminData();
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<InventoryItem['category']>('Gel / Esmalte');
  const [unit, setUnit] = useState('frasco');
  const [stock, setStock] = useState(5);
  const [minAlert, setMinAlert] = useState(2);
  const [costMxn, setCostMxn] = useState(150);
  const [retailMxn, setRetailMxn] = useState(0);
  const [isForRetail, setIsForRetail] = useState(false);

  if (!data) return null;

  const lowStock = data.inventory.filter(
    (i) => i.isActive && i.stockQuantity <= i.minStockAlert,
  );

  const adjust = async (
    itemId: string,
    delta: number,
    reason: 'restock' | 'service_usage' | 'retail_sale',
    notes: string,
  ) => {
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'inventory',
        data: { itemId, delta, reason, notes },
      }),
    });
    setMsg(
      reason === 'retail_sale'
        ? 'Venta registrada en Caja y descontada de inventario.'
        : 'Movimiento de inventario actualizado.',
    );
    await refresh();
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'inventory',
        data: {
          newItem: {
            sku: sku || `SKU-${Math.floor(100 + Math.random() * 900)}`,
            name,
            category,
            unit,
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
    setName('');
    setSku('');
    setMsg('Producto/insumo agregado al inventario.');
    await refresh();
  };

  return (
    <VStack gap={5}>
      <VStack gap={0.5}>
        <Heading level={1}>Inventario e Insumos</Heading>
        <Text color="secondary">
          Controla geles, acrílicos, tips y productos de reventa con alertas automáticas de stock mínimo y descuento por consumo interno o venta.
        </Text>
      </VStack>

      {lowStock.length > 0 ? (
        <Banner
          status="warning"
          title={`${lowStock.length} insumo(s) por debajo del stock mínimo`}
          description={lowStock.map((i) => `${i.name} (${i.stockQuantity} ${i.unit})`).join(' · ')}
        />
      ) : null}

      {msg ? (
        <Banner status="success" title={msg} isDismissable onDismiss={() => setMsg(null)} />
      ) : null}

      <Grid columns={{ minWidth: 320, max: 3 }} gap={5} align="start">
        <Card padding={0}>
          <Table
            idKey="id"
            hasHover
            data={data.inventory}
            columns={[
              {
                key: 'name',
                header: 'Producto / Insumo',
                renderCell: (i) => (
                  <VStack gap={0}>
                    <Text weight="semibold">{i.name}</Text>
                    <Text type="supporting" color="secondary">
                      {i.sku} · {i.category}
                      {i.isForRetail
                        ? ` · Reventa ${formatCurrency(i.retailPriceCents)}`
                        : ' · Uso en cabina'}
                    </Text>
                  </VStack>
                ),
              },
              {
                key: 'stockQuantity',
                header: 'Stock',
                renderCell: (i) => (
                  <Badge
                    variant={i.stockQuantity <= i.minStockAlert ? 'error' : 'success'}
                    label={`${i.stockQuantity} ${i.unit}`}
                  />
                ),
              },
              {
                key: 'actions',
                header: 'Movimientos rápidos',
                renderCell: (i) => (
                  <HStack gap={1.5} wrap="wrap">
                    <Button
                      label="+1 Entrada"
                      size="sm"
                      variant="secondary"
                      onClick={() => void adjust(i.id, 1, 'restock', 'Reposición de stock')}
                    />
                    <Button
                      label="-1 Consumo"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        void adjust(i.id, -1, 'service_usage', 'Consumo interno de cabina')
                      }
                    />
                    {i.isForRetail ? (
                      <Button
                        label="Vender (Caja)"
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          void adjust(i.id, -1, 'retail_sale', 'Venta directa a clienta')
                        }
                      />
                    ) : null}
                  </HStack>
                ),
              },
            ]}
          />
        </Card>

        <Card padding={5}>
          <form onSubmit={createItem}>
            <VStack gap={3}>
              <HStack gap={2} align="center">
                <PackagePlus size={18} aria-hidden="true" />
                <Heading level={3}>Agregar insumo / producto</Heading>
              </HStack>
              <TextInput
                label="Nombre"
                placeholder="Ej. Top Coat Gloss Sin Capa"
                value={name}
                onChange={setName}
                isRequired
              />
              <Grid columns={2} gap={2}>
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
              <Grid columns={3} gap={2}>
                <NumberInput label="Stock" value={stock} min={0} onChange={setStock} />
                <NumberInput label="Alerta mín." value={minAlert} min={0} onChange={setMinAlert} />
                <TextInput label="Unidad" value={unit} onChange={setUnit} />
              </Grid>
              <NumberInput label="Costo unitario (MXN)" value={costMxn} min={0} onChange={setCostMxn} />
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
              <Button type="submit" label="Guardar producto" variant="primary" width="100%" />
            </VStack>
          </form>
        </Card>
      </Grid>
    </VStack>
  );
}
