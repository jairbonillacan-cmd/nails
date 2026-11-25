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
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Table } from '@astryxdesign/core/Table';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Link } from '@astryxdesign/core/Link';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Token } from '@astryxdesign/core/Token';
import { Check, Download, ExternalLink, Gift, Plus } from 'lucide-react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';

type SectionTab = 'sales' | 'commissions' | 'coupons';
type SalesSubView = 'sold' | 'cash' | 'receivable';
type LedgerFilter = 'all' | 'paid' | 'deposits' | 'pending';
type PendingDepositRow = AdminOverviewPayload['pendingDeposits'][number];

type SalesLedgerRow = {
  id: string;
  dateIso: string;
  title: string;
  subtitle: string;
  kindLabel: string;
  statusVariant: 'success' | 'warning' | 'info' | 'neutral';
  statusLabel: string;
  amountCents: number;
  isExpense: boolean;
  category: 'paid' | 'deposits' | 'pending';
};

function formatInstagramDisplay(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

function formatInstagramUrl(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`;
}

function proofMethodMeta(method: PendingDepositRow['proofDeliveryMethod']): {
  label: string;
  color: 'blue' | 'purple' | 'yellow';
} {
  if (method === 'web_upload') return { label: 'Comprobante Web', color: 'blue' };
  if (method === 'instagram_dm') return { label: 'Instagram DM', color: 'purple' };
  return { label: 'Sin comprobante aún', color: 'yellow' };
}

function isSafeProofHref(url: string | null): url is string {
  if (!url) return false;
  return url.startsWith('/api/media/') || url.startsWith('https://');
}

export default function AdminCashPage() {
  const { data, refresh } = useAdminData();
  const [sectionTab, setSectionTab] = useState<SectionTab>('sales');
  const [salesView, setSalesView] = useState<SalesSubView>(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('tab');
      if (param === 'anticipos' || param === 'receivable') return 'receivable';
      if (param === 'vendido' || param === 'sold') return 'sold';
    }
    return 'cash';
  });
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [countedCashMxn, setCountedCashMxn] = useState<number>(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [entryType, setEntryType] = useState<
    'service_income' | 'product_sale' | 'expense'
  >('expense');
  const [desc, setDesc] = useState('');
  const [amountMxn, setAmountMxn] = useState(150);
  const [method, setMethod] = useState<PaymentMethod>('cash');

  const [cpCode, setCpCode] = useState('');
  const [cpKind, setCpKind] = useState<'coupon' | 'gift_card'>('coupon');
  const [cpDiscountType, setCpDiscountType] = useState<'percent' | 'fixed_cents'>(
    'percent',
  );
  const [cpValue, setCpValue] = useState(15);
  const [cpRecipient, setCpRecipient] = useState('');

  const pendingDeposits = useMemo<PendingDepositRow[]>(
    () => (data ? data.pendingDeposits : []),
    [data],
  );

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

  const salesLedger = useMemo<SalesLedgerRow[]>(() => {
    if (!data) return [];
    const cashRows: SalesLedgerRow[] = data.cashEntries.map((entry) => {
      const isDeposit = entry.entryType === 'deposit';
      const isExpense = entry.entryType === 'expense';
      return {
        id: `cash-${entry.id}`,
        dateIso: entry.occurredAt,
        title: entry.description,
        subtitle: `${entry.paymentMethod} · ${entry.recordedBy}`,
        kindLabel: isDeposit
          ? 'Anticipo'
          : isExpense
            ? 'Egreso'
            : entry.entryType === 'product_sale'
              ? 'Producto'
              : 'Servicio',
        statusVariant: isExpense ? 'neutral' : isDeposit ? 'info' : 'success',
        statusLabel: isExpense ? 'Egreso' : isDeposit ? 'Anticipo' : 'Pagado',
        amountCents: Math.abs(entry.amountCents),
        isExpense,
        category: isDeposit ? 'deposits' : 'paid',
      };
    });

    const pendingRows: SalesLedgerRow[] = pendingDeposits.map((dep) => ({
      id: `dep-${dep.bookingId}`,
      dateIso: dep.startAt,
      title: `${dep.clientName} — ${dep.serviceName}`,
      subtitle: `${dep.bookingCode} · ${dep.staffName}`,
      kindLabel: 'Anticipo pendiente',
      statusVariant: 'warning',
      statusLabel: 'Pendiente',
      amountCents: dep.depositAmountCents > 0 ? dep.depositAmountCents : dep.totalPriceCents,
      isExpense: false,
      category: 'pending',
    }));

    const combined = [...pendingRows, ...cashRows].toSorted(
      (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime(),
    );

    if (ledgerFilter === 'all') return combined;
    return combined.filter((row) => row.category === ledgerFilter);
  }, [data, pendingDeposits, ledgerFilter]);

  const filteredCashEntries = useMemo(() => {
    if (!data) return [];
    if (ledgerFilter === 'all') return data.cashEntries;
    if (ledgerFilter === 'deposits') {
      return data.cashEntries.filter((e) => e.entryType === 'deposit');
    }
    if (ledgerFilter === 'paid') {
      return data.cashEntries.filter(
        (e) => e.entryType !== 'expense' && e.entryType !== 'deposit',
      );
    }
    return data.cashEntries.filter((e) => e.entryType === 'expense');
  }, [data, ledgerFilter]);

  if (!data) return null;

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const defaultDepositLabel = formatCurrency(
    data.settings.depositAmountCents ?? 20000,
    currency,
  );
  const pendingDepositsTotalCents = pendingDeposits.reduce(
    (sum, item) => sum + item.depositAmountCents,
    0,
  );

  const cashOnlyExpectedCents = data.cashEntries
    .filter((e) => e.paymentMethod === 'cash')
    .reduce(
      (sum, e) =>
        sum +
        (e.entryType === 'expense'
          ? -Math.abs(e.amountCents)
          : e.amountCents + e.tipCents),
      0,
    );

  const cashDiffCents = Math.round(countedCashMxn * 100) - cashOnlyExpectedCents;

  const handleApproveDeposit = async (bookingId: string, bookingCode: string) => {
    setApprovingId(bookingId);
    setErrorMsg(null);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          status: 'confirmed',
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(json.error || 'No se pudo aprobar el anticipo.');
        return;
      }
      setMsg(`Anticipo aprobado y cita ${bookingCode} confirmada.`);
      await refresh();
    } catch {
      setErrorMsg('Error de conexión al confirmar el anticipo.');
    } finally {
      setApprovingId(null);
    }
  };

  const submitCashEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc.trim()) return;
    setErrorMsg(null);
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
    setErrorMsg(null);
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
          remainingBalanceCents:
            cpKind === 'gift_card' ? Math.round(cpValue * 100) : null,
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
          <Heading level={1}>Ventas, Caja y Anticipos</Heading>
          <Text color="secondary">
            Control de ventas, arqueo de efectivo, anticipos SPEI ({defaultDepositLabel}), comisiones por especialista y Gift Cards.
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Ver citas"
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={14} />}
            href="/admin/citas"
          />
          <Button
            label="Exportar reporte CSV"
            variant="secondary"
            size="sm"
            icon={<Download size={15} />}
            href="/api/admin/operations?export=csv"
          />
        </HStack>
      </HStack>

      {msg ? (
        <Banner
          status="success"
          title={msg}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      {errorMsg ? (
        <Banner
          status="error"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      ) : null}

      {pendingDeposits.length > 0 && (sectionTab !== 'sales' || salesView !== 'receivable') ? (
        <Banner
          status="warning"
          title={`Tienes ${pendingDeposits.length} anticipo(s) pendiente(s) por validar (${formatCurrency(pendingDepositsTotalCents, currency)})`}
          description="Revisa comprobantes web o de Instagram DM y confirma cada cita en 1 clic."
          endContent={
            <Button
              label="Revisar anticipos"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSectionTab('sales');
                setSalesView('receivable');
              }}
            />
          }
        />
      ) : null}

      <Grid columns={{ minWidth: 180, max: 4 }} gap={4}>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Text type="label" color="secondary">
              Ingresos brutos
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.totalRevenueCents, currency)}
            </Heading>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Text type="label" color="secondary">
              Propinas
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.totalTipsCents, currency)}
            </Heading>
          </VStack>
        </Card>
        <Card padding={4}>
          <VStack gap={0.5}>
            <Text type="label" color="secondary">
              Por cobrar / Anticipos
            </Text>
            <Heading level={2}>
              {formatCurrency(pendingDepositsTotalCents, currency)}
            </Heading>
            <Text type="supporting" color="secondary">
              {pendingDeposits.length} cita(s) pendientes
            </Text>
          </VStack>
        </Card>
        <Card padding={4} variant="muted">
          <VStack gap={0.5}>
            <Text type="label" color="accent">
              Balance neto
            </Text>
            <Heading level={2}>
              {formatCurrency(data.kpis.netCashCents, currency)}
            </Heading>
            <Text type="supporting" color="secondary">
              Egresos: {formatCurrency(data.kpis.totalExpensesCents, currency)}
            </Text>
          </VStack>
        </Card>
      </Grid>

      <TabList
        value={sectionTab}
        onChange={(v) => setSectionTab(v as SectionTab)}
        hasDivider
      >
        <Tab value="sales" label="Ventas, Caja y Anticipos" />
        <Tab value="commissions" label="Comisiones por manicurista" />
        <Tab value="coupons" label={`Cupones y Gift Cards (${data.coupons.length})`} />
      </TabList>

      {sectionTab === 'sales' ? (
        <VStack gap={4}>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <SegmentedControl
              label="Vista de ventas y caja"
              value={salesView}
              onChange={(v) => setSalesView(v as SalesSubView)}
            >
              <SegmentedControlItem value="sold" label="Vendido" />
              <SegmentedControlItem value="cash" label="Caja" />
              <SegmentedControlItem
                value="receivable"
                label={`Por cobrar / Anticipos (${pendingDeposits.length})`}
              />
            </SegmentedControl>

            {salesView !== 'receivable' ? (
              <HStack gap={1.5} wrap="wrap">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'paid', label: 'Pagados' },
                    { id: 'deposits', label: 'Anticipos' },
                    { id: 'pending', label: 'Pendientes' },
                  ] as const
                ).map((pill) => (
                  <Button
                    key={pill.id}
                    label={pill.label}
                    size="sm"
                    variant={ledgerFilter === pill.id ? 'primary' : 'secondary'}
                    onClick={() => {
                      if (pill.id === 'pending' && salesView === 'cash') {
                        setSalesView('receivable');
                        return;
                      }
                      setLedgerFilter(pill.id);
                    }}
                  />
                ))}
              </HStack>
            ) : null}
          </HStack>

          {salesView === 'receivable' ? (
            <Card padding={5}>
              <VStack gap={4}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <VStack gap={0.5}>
                    <Heading level={2}>
                      Anticipos pendientes ({defaultDepositLabel} MXN)
                    </Heading>
                    <Text type="supporting" color="secondary">
                      Valida transferencias SPEI a {data.settings.depositBankName} ({data.settings.depositClabe}) recibidas en web o por DM en {data.settings.instagramHandle}.
                    </Text>
                  </VStack>
                  <Button
                    label="Abrir agenda de citas"
                    variant="secondary"
                    size="sm"
                    icon={<ExternalLink size={14} />}
                    href="/admin/citas"
                  />
                </HStack>

                {pendingDeposits.length === 0 ? (
                  <EmptyState
                    isCompact
                    title="Sin anticipos pendientes"
                    description="Todas las citas activas tienen su anticipo verificado o confirmado."
                    actions={
                      <Button
                        label="Ir a Citas"
                        variant="secondary"
                        size="sm"
                        href="/admin/citas"
                      />
                    }
                  />
                ) : (
                  <Table
                    idKey="bookingId"
                    hasHover
                    data={pendingDeposits}
                    columns={[
                      {
                        key: 'clientName',
                        header: 'Clienta e Instagram',
                        renderCell: (dep) => (
                          <VStack gap={0.5}>
                            <Text weight="semibold">{dep.clientName}</Text>
                            <HStack gap={2} wrap="wrap" align="center">
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {dep.clientPhone}
                              </Text>
                              {dep.clientInstagram ? (
                                <Link
                                  href={formatInstagramUrl(dep.clientInstagram)}
                                  isExternalLink
                                  type="supporting"
                                >
                                  {formatInstagramDisplay(dep.clientInstagram)}
                                </Link>
                              ) : null}
                            </HStack>
                          </VStack>
                        ),
                      },
                      {
                        key: 'serviceName',
                        header: 'Cita y especialista',
                        renderCell: (dep) => (
                          <VStack gap={0}>
                            <Text weight="medium">
                              {dep.serviceName} ({dep.bookingCode})
                            </Text>
                            <Text type="supporting" color="secondary">
                              {formatDateShortInTimezone(dep.startAt, tz)} ·{' '}
                              {formatTimeInTimezone(dep.startAt, tz)} · {dep.staffName}
                            </Text>
                          </VStack>
                        ),
                      },
                      {
                        key: 'proofDeliveryMethod',
                        header: 'Comprobante',
                        renderCell: (dep) => {
                          const meta = proofMethodMeta(dep.proofDeliveryMethod);
                          return (
                            <VStack gap={1}>
                              <Token size="sm" color={meta.color} label={meta.label} />
                              {isSafeProofHref(dep.paymentProofUrl) ? (
                                <Link
                                  href={dep.paymentProofUrl}
                                  isExternalLink
                                  type="supporting"
                                >
                                  Ver comprobante
                                </Link>
                              ) : null}
                            </VStack>
                          );
                        },
                      },
                      {
                        key: 'depositAmountCents',
                        header: 'Anticipo / Total',
                        align: 'end',
                        renderCell: (dep) => (
                          <VStack gap={0} align="end">
                            <Text weight="semibold" hasTabularNumbers>
                              {formatCurrency(dep.depositAmountCents, currency)}
                            </Text>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              Total: {formatCurrency(dep.totalPriceCents, currency)}
                            </Text>
                          </VStack>
                        ),
                      },
                      {
                        key: 'actions',
                        header: 'Acción',
                        align: 'end',
                        renderCell: (dep) => (
                          <HStack gap={1.5} justify="end">
                            <Button
                              label="Aprobar anticipo"
                              variant="primary"
                              size="sm"
                              icon={<Check size={14} />}
                              isLoading={approvingId === dep.bookingId}
                              onClick={() =>
                                void handleApproveDeposit(dep.bookingId, dep.bookingCode)
                              }
                            />
                            <Button
                              label="Ver cita"
                              variant="ghost"
                              size="sm"
                              href="/admin/citas"
                            />
                          </HStack>
                        ),
                      },
                    ]}
                  />
                )}
              </VStack>
            </Card>
          ) : salesView === 'sold' ? (
            <Card padding={0}>
              {salesLedger.length === 0 ? (
                <VStack padding={5}>
                  <EmptyState
                    isCompact
                    title="Sin movimientos con este filtro"
                    description="Prueba seleccionando Todos para ver el historial completo de ventas y anticipos."
                  />
                </VStack>
              ) : (
                <Table
                  idKey="id"
                  hasHover
                  data={salesLedger}
                  columns={[
                    {
                      key: 'dateIso',
                      header: 'Fecha',
                      renderCell: (row) => (
                        <Text type="supporting">
                          {formatDateShortInTimezone(row.dateIso, tz)}
                        </Text>
                      ),
                    },
                    {
                      key: 'title',
                      header: 'Concepto',
                      renderCell: (row) => (
                        <VStack gap={0}>
                          <Text weight="medium">{row.title}</Text>
                          <Text type="supporting" color="secondary">
                            {row.subtitle}
                          </Text>
                        </VStack>
                      ),
                    },
                    {
                      key: 'statusLabel',
                      header: 'Estado',
                      renderCell: (row) => (
                        <Badge variant={row.statusVariant} label={row.statusLabel} />
                      ),
                    },
                    {
                      key: 'amountCents',
                      header: 'Monto',
                      align: 'end',
                      renderCell: (row) => (
                        <Text weight="semibold" hasTabularNumbers>
                          {row.isExpense ? '-' : '+'}
                          {formatCurrency(row.amountCents, currency)}
                        </Text>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          ) : (
            <Grid columns={{ minWidth: 320, max: 3 }} gap={5} align="start">
              <VStack gap={4}>
                <Card padding={5}>
                  <VStack gap={3}>
                    <Heading level={3}>Arqueo de efectivo en caja</Heading>
                    <Text type="supporting" color="secondary">
                      Efectivo esperado por sistema:{' '}
                      <Text weight="semibold">
                        {formatCurrency(cashOnlyExpectedCents, currency)}
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
                          : `Diferencia: ${formatCurrency(cashDiffCents, currency)}`
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
                            v &&
                            setEntryType(
                              v as 'service_income' | 'product_sale' | 'expense',
                            )
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
                  data={filteredCashEntries}
                  columns={[
                    {
                      key: 'occurredAt',
                      header: 'Fecha',
                      renderCell: (e) => (
                        <Text type="supporting">
                          {formatDateShortInTimezone(e.occurredAt, tz)}
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
                          {formatCurrency(Math.abs(e.amountCents), currency)}
                        </Text>
                      ),
                    },
                    {
                      key: 'tipCents',
                      header: 'Propina / Com.',
                      align: 'end',
                      renderCell: (e) => (
                        <Text type="supporting" hasTabularNumbers>
                          Prop: {formatCurrency(e.tipCents)} · Com:{' '}
                          {formatCurrency(e.commissionCents)}
                        </Text>
                      ),
                    },
                  ]}
                />
              </Card>
            </Grid>
          )}
        </VStack>
      ) : sectionTab === 'commissions' ? (
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
                <Button
                  type="submit"
                  label="Crear código"
                  variant="primary"
                  width="100%"
                />
              </VStack>
            </form>
          </Card>
        </Grid>
      )}
    </VStack>
  );
}
