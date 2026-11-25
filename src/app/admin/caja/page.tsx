'use client';

import React, { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Download, Gift, Plus } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { formatCurrency, formatDateShortInTimezone } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';

export default function AdminCashPage() {
  const { data, refresh } = useAdminData();
  const [tab, setTab] = useState('cash');
  const [countedCashMxn, setCountedCashMxn] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);

  const [entryType, setEntryType] = useState<'service_income' | 'product_sale' | 'expense'>(
    'expense',
  );
  const [desc, setDesc] = useState('');
  const [amountMxn, setAmountMxn] = useState(150);
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const [cpCode, setCpCode] = useState('');
  const [cpKind, setCpKind] = useState<'coupon' | 'gift_card'>('coupon');
  const [cpDiscountType, setCpDiscountType] = useState<'percent' | 'fixed_cents'>('percent');
  const [cpValue, setCpValue] = useState(15);
  const [cpRecipient, setCpRecipient] = useState('');

  const commissionsByStaff = useMemo(() => {
    if (!data) return [];
    return data.staff.map((st) => {
      const entries = data.cashEntries.filter((e) => e.staffId === st.id);
      const sales = entries.reduce((s, e) => s + e.amountCents, 0);
      const commission = entries.reduce((s, e) => s + e.commissionCents, 0);
      const tips = entries.reduce((s, e) => s + e.tipCents, 0);
      return {
        id: st.id,
        name: st.name,
        percent: st.commissionPercent,
        servicesCount: entries.length,
        sales,
        commission,
        tips,
        totalPayout: commission + tips,
      };
    });
  }, [data]);

  if (!data) return null;

  const cashOnlyExpectedCents = data.cashEntries
    .filter((e) => e.paymentMethod === 'cash')
    .reduce((sum, e) => sum + (e.entryType === 'expense' ? -Math.abs(e.amountCents) : e.amountCents + e.tipCents), 0);

  const cashDiffCents = Math.round(countedCashMxn * 100) - cashOnlyExpectedCents;

  const submitCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'cash',
        data: {
          bookingId: null,
          staffId: null,
          entryType,
          description: desc,
          amountCents: Math.round(amountMxn * 100),
          tipCents: 0,
          commissionCents: 0,
          paymentMethod: method,
        },
      }),
    });
    setDesc('');
    setMsg('Movimiento registrado en flujo de caja.');
    await refresh();
  };

  const submitCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpCode.trim()) return;
    const isFixed = cpKind === 'gift_card' || cpDiscountType === 'fixed_cents';
    await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'coupon',
        data: {
          code: cpCode,
          kind: cpKind,
          discountType: isFixed ? 'fixed_cents' : 'percent',
          discountValue: isFixed ? Math.round(cpValue * 100) : cpValue,
          remainingBalanceCents: cpKind === 'gift_card' ? Math.round(cpValue * 100) : null,
          maxUses: cpKind === 'gift_card' ? 1 : 100,
          minSubtotalCents: 0,
          expiresAt: null,
          recipientName: cpRecipient || null,
          isActive: true,
        },
      }),
    });
    setCpCode('');
    setCpRecipient('');
    setMsg('Cupón / Gift Card activado en la página de reservas.');
    await refresh();
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Caja, Comisiones y Cupones</Heading>
          <Text color="secondary">
            Corte diario con arqueo de efectivo, comisiones automáticas por manicurista, exportación CSV y Gift Cards digitales.
          </Text>
        </VStack>
        <Button
          label="Exportar reporte CSV"
          variant="secondary"
          size="sm"
          icon={<Download size={15} />}
          href="/api/admin/operations?export=csv"
        />
      </HStack>

      {msg ? (
        <Banner status="success" title={msg} isDismissable onDismiss={() => setMsg(null)} />
      ) : null}

      <Grid columns={{ minWidth: 180, max: 4 }} gap={4}>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Text type="label" color="secondary">
              Ingresos brutos
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.totalRevenueCents, data.settings.currency)}
            </Heading>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Text type="label" color="secondary">
              Propinas
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.totalTipsCents, data.settings.currency)}
            </Heading>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Text type="label" color="secondary">
              Egresos / Gastos
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.totalExpensesCents, data.settings.currency)}
            </Heading>
          </VStack>
        </Card>
        <Card padding={4} variant="muted">
          <VStack gap={0.5}>
            <Text type="label" color="accent">
              Balance neto
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.netCashCents, data.settings.currency)}
            </Heading>
          </VStack>
        </Card>
      </Grid>

      <TabList value={tab} onChange={setTab} hasDivider>
        <Tab value="cash" label="Flujo de caja y arqueo" />
        <Tab value="commissions" label="Comisiones por manicurista" />
        <Tab value="coupons" label={`Cupones y Gift Cards (${data.coupons.length})`} />
      </TabList>

      {tab === 'cash' ? (
        <Grid columns={{ minWidth: 320, max: 3 }} gap={5} align="start">
          <VStack gap={4}>
            <Card padding={5}>
              <VStack gap={3}>
                <Heading level={3}>Arqueo de efectivo en caja</Heading>
                <Text type="supporting" color="secondary">
                  Efectivo esperado por sistema:{' '}
                  <Text weight="semibold">
                    {formatCurrency(cashOnlyExpectedCents, data.settings.currency)}
                  </Text>
                </Text>
                <NumberInput
                  label="Efectivo contado físicamente (MXN)"
                  value={countedCashMxn}
                  min={0}
                  onChange={setCountedCashMxn}
                />
                <Badge
                  variant={cashDiffCents === 0 ? 'success' : 'warning'}
                  label={
                    cashDiffCents === 0
                      ? 'Caja cuadrada'
                      : `Diferencia: ${formatCurrency(cashDiffCents, data.settings.currency)}`
                  }
                />
              </VStack>
            </Card>

            {data.session.user.role !== 'specialist' ? (
              <Card padding={5}>
                <form onSubmit={submitCashEntry}>
                  <VStack gap={3}>
                    <Heading level={3}>Registrar movimiento</Heading>
                    <Selector
                      label="Tipo"
                      value={entryType}
                      onChange={(v) =>
                        v && setEntryType(v as 'service_income' | 'product_sale' | 'expense')
                      }
                      options={[
                        { value: 'expense', label: 'Egreso / Compra de insumos' },
                        { value: 'product_sale', label: 'Venta rápida de producto' },
                        { value: 'service_income', label: 'Ingreso adicional' },
                      ]}
                    />
                    <TextInput
                      label="Concepto"
                      placeholder="Ej. Compra de limas y acetona"
                      value={desc}
                      onChange={setDesc}
                      isRequired
                    />
                    <Grid columns={2} gap={2}>
                      <NumberInput
                        label="Monto (MXN)"
                        value={amountMxn}
                        min={1}
                        onChange={setAmountMxn}
                      />
                      <Selector
                        label="Método"
                        value={method}
                        onChange={(v) => v && setMethod(v as PaymentMethod)}
                        options={[
                          { value: 'cash', label: 'Efectivo' },
                          { value: 'transfer', label: 'Transferencia' },
                          { value: 'card', label: 'Tarjeta' },
                        ]}
                      />
                    </Grid>
                    <Button
                      type="submit"
                      label="Registrar en caja"
                      variant="primary"
                      icon={<Plus size={15} />}
                      width="100%"
                    />
                  </VStack>
                </form>
              </Card>
            ) : null}
          </VStack>

          <Card padding={0}>
            <Table
              idKey="id"
              hasHover
              data={data.cashEntries}
              columns={[
                {
                  key: 'occurredAt',
                  header: 'Fecha',
                  renderCell: (e) => (
                    <Text type="supporting">
                      {formatDateShortInTimezone(e.occurredAt, data.settings.timezone)}
                    </Text>
                  ),
                },
                {
                  key: 'description',
                  header: 'Descripción',
                  renderCell: (e) => (
                    <VStack gap={0}>
                      <Text weight="medium">{e.description}</Text>
                      <Text type="supporting" color="secondary">
                        {e.paymentMethod} · {e.recordedBy}
                      </Text>
                    </VStack>
                  ),
                },
                {
                  key: 'amountCents',
                  header: 'Monto',
                  align: 'end',
                  renderCell: (e) => (
                    <Text weight="semibold" hasTabularNumbers>
                      {e.entryType === 'expense' ? '-' : '+'}
                      {formatCurrency(Math.abs(e.amountCents), data.settings.currency)}
                    </Text>
                  ),
                },
                {
                  key: 'tipCents',
                  header: 'Propina / Com.',
                  align: 'end',
                  renderCell: (e) => (
                    <Text type="supporting" hasTabularNumbers>
                      Prop: {formatCurrency(e.tipCents)} · Com: {formatCurrency(e.commissionCents)}
                    </Text>
                  ),
                },
              ]}
            />
          </Card>
        </Grid>
      ) : tab === 'commissions' ? (
        <Card padding={0}>
          <Table
            idKey="id"
            hasHover
            data={commissionsByStaff}
            columns={[
              { key: 'name', header: 'Manicurista' },
              {
                key: 'percent',
                header: '% Comisión',
                renderCell: (r) => <Badge variant="info" label={`${r.percent}%`} />,
              },
              { key: 'servicesCount', header: 'Servicios / Ventas' },
              {
                key: 'sales',
                header: 'Venta generada',
                align: 'end',
                renderCell: (r) => (
                  <Text hasTabularNumbers>{formatCurrency(r.sales)}</Text>
                ),
              },
              {
                key: 'commission',
                header: 'Comisión',
                align: 'end',
                renderCell: (r) => (
                  <Text hasTabularNumbers>{formatCurrency(r.commission)}</Text>
                ),
              },
              {
                key: 'tips',
                header: 'Propinas',
                align: 'end',
                renderCell: (r) => (
                  <Text hasTabularNumbers>{formatCurrency(r.tips)}</Text>
                ),
              },
              {
                key: 'totalPayout',
                header: 'Total a pagar',
                align: 'end',
                renderCell: (r) => (
                  <Text weight="bold" hasTabularNumbers>
                    {formatCurrency(r.totalPayout)}
                  </Text>
                ),
              },
            ]}
          />
        </Card>
      ) : (
        <Grid columns={{ minWidth: 300, max: 2 }} gap={5} align="start">
          <Card padding={0}>
            <Table
              idKey="id"
              hasHover
              data={data.coupons}
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
                    <Badge
                      variant={c.kind === 'gift_card' ? 'purple' : 'info'}
                      label={c.kind === 'gift_card' ? 'Gift Card' : 'Cupón'}
                    />
                  ),
                },
                {
                  key: 'discountValue',
                  header: 'Valor / Saldo',
                  renderCell: (c) =>
                    c.kind === 'gift_card'
                      ? `Saldo: ${formatCurrency(c.remainingBalanceCents ?? 0)}`
                      : c.discountType === 'percent'
                        ? `${c.discountValue}%`
                        : formatCurrency(c.discountValue),
                },
                {
                  key: 'usedCount',
                  header: 'Usos',
                  renderCell: (c) =>
                    `${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}`,
                },
              ]}
            />
          </Card>

          <Card padding={5}>
            <form onSubmit={submitCoupon}>
              <VStack gap={3}>
                <Heading level={3}>Crear Cupón o Gift Card digital</Heading>
                <TextInput
                  label="Código"
                  placeholder="Ej. CUMPLE20 o REGALO500"
                  value={cpCode}
                  onChange={setCpCode}
                  isRequired
                />
                <Selector
                  label="Modalidad"
                  value={cpKind}
                  onChange={(v) => v && setCpKind(v as 'coupon' | 'gift_card')}
                  options={[
                    { value: 'coupon', label: 'Cupón promocional' },
                    { value: 'gift_card', label: 'Gift Card con saldo' },
                  ]}
                />
                {cpKind === 'coupon' ? (
                  <Selector
                    label="Tipo de descuento"
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
                  label="Nota / Destinataria (opcional)"
                  value={cpRecipient}
                  onChange={setCpRecipient}
                />
                <Divider />
                <Button type="submit" label="Crear código" variant="primary" width="100%" />
              </VStack>
            </form>
          </Card>
        </Grid>
      )}
    </VStack>
  );
}
