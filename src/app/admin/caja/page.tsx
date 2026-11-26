'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
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
import {
  AlertTriangle,
  Check,
  CreditCard,
  Download,
  ExternalLink,
  Gift,
  Plus,
  Wallet,
} from 'lucide-react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';
import type { PaymentMethod, PaymentSplitMethod } from '@/lib/types';

type SectionTab = 'sales' | 'commissions' | 'coupons';
type SalesSubView = 'sold' | 'cash' | 'receivable' | 'uncollected';
type LedgerFilter = 'all' | 'paid' | 'deposits' | 'pending';
type PendingDepositRow = AdminOverviewPayload['pendingDeposits'][number];
type UncollectedBookingRow = AdminOverviewPayload['uncollectedBookings'][number];

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

type SplitDetailRow = {
  id: string;
  createdAt: string;
  bookingCode: string;
  clientName: string;
  method: PaymentSplitMethod;
  amountCents: number;
  tipCents: number;
  tipStaffName: string | null;
  reference: string | null;
};

type MethodSummaryRow = {
  method: PaymentSplitMethod;
  label: string;
  count: number;
  amountCents: number;
  tipCents: number;
};

const SPLIT_METHOD_ORDER: readonly PaymentSplitMethod[] = [
  'cash',
  'card',
  'transfer',
  'giftcard',
  'online',
];

function splitMethodLabel(method: PaymentSplitMethod): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia SPEI';
  if (method === 'giftcard') return 'Gift Card';
  return 'Pago en línea';
}

function splitMethodTokenColor(
  method: PaymentSplitMethod,
): 'green' | 'blue' | 'purple' | 'pink' | 'teal' {
  if (method === 'cash') return 'green';
  if (method === 'card') return 'blue';
  if (method === 'transfer') return 'purple';
  if (method === 'giftcard') return 'pink';
  return 'teal';
}

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

function resolveInitialCajaRoute(param: string | null): {
  section: SectionTab;
  salesView: SalesSubView;
} {
  if (param === 'comisiones' || param === 'commissions') {
    return { section: 'commissions', salesView: 'cash' };
  }
  if (param === 'cupones' || param === 'coupons') {
    return { section: 'coupons', salesView: 'cash' };
  }
  if (param === 'sin-cobrar' || param === 'uncollected') {
    return { section: 'sales', salesView: 'uncollected' };
  }
  if (param === 'anticipos' || param === 'receivable') {
    return { section: 'sales', salesView: 'receivable' };
  }
  if (param === 'vendido' || param === 'sold') {
    return { section: 'sales', salesView: 'sold' };
  }
  return { section: 'sales', salesView: 'cash' };
}

export default function AdminCashPage() {
  const { data, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialRoute = resolveInitialCajaRoute(tabParam);

  const [sectionTab, setSectionTab] = useState<SectionTab>(initialRoute.section);
  const [salesView, setSalesView] = useState<SalesSubView>(initialRoute.salesView);
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

  const lastTabParamRef = useRef<string | null>(tabParam);

  useExternalSync(`caja-tab|${tabParam ?? ''}`, async (signal) => {
    if (signal.aborted || lastTabParamRef.current === tabParam) return;
    lastTabParamRef.current = tabParam;
    const next = resolveInitialCajaRoute(tabParam);
    setSectionTab(next.section);
    setSalesView(next.salesView);
  });

  const pendingDeposits = useMemo<PendingDepositRow[]>(
    () => (data ? data.pendingDeposits : []),
    [data],
  );

  const uncollectedBookings = useMemo<UncollectedBookingRow[]>(
    () => (data ? data.uncollectedBookings : []),
    [data],
  );

  const splitSummaryByMethod = useMemo<MethodSummaryRow[]>(() => {
    if (!data) return [];
    const grouped = new Map<
      PaymentSplitMethod,
      { count: number; amountCents: number; tipCents: number }
    >();
    for (const split of data.paymentSplits) {
      const current = grouped.get(split.method) ?? {
        count: 0,
        amountCents: 0,
        tipCents: 0,
      };
      current.count += 1;
      current.amountCents += split.amountCents;
      current.tipCents += split.tipCents;
      grouped.set(split.method, current);
    }
    const rows: MethodSummaryRow[] = [];
    for (const m of SPLIT_METHOD_ORDER) {
      const stats = grouped.get(m);
      if (!stats) continue;
      rows.push({
        method: m,
        label: splitMethodLabel(m),
        count: stats.count,
        amountCents: stats.amountCents,
        tipCents: stats.tipCents,
      });
    }
    return rows;
  }, [data]);

  const splitDetails = useMemo<SplitDetailRow[]>(() => {
    if (!data) return [];
    const bookingMap = new Map(data.bookings.map((b) => [b.id, b]));
    const staffMap = new Map(data.staff.map((s) => [s.id, s.name]));
    return data.paymentSplits
      .map((split) => {
        const bk = bookingMap.get(split.bookingId);
        return {
          id: split.id,
          createdAt: split.createdAt,
          bookingCode: bk?.bookingCode ?? split.bookingId,
          clientName: bk?.client.fullName ?? 'Clienta',
          method: split.method,
          amountCents: split.amountCents,
          tipCents: split.tipCents,
          tipStaffName: split.tipStaffId ? (staffMap.get(split.tipStaffId) ?? null) : null,
          reference: split.reference ?? null,
        };
      })
      .toSorted(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [data]);

  const commissionsByStaff = useMemo(() => {
    if (!data) return [];
    return data.staff.map((st) => {
      const entries = data.cashEntries.filter((e) => e.staffId === st.id);
      const sales = entries.reduce((s, e) => s + e.amountCents, 0);
      const commission = entries.reduce((s, e) => s + e.commissionCents, 0);
      const tips = entries.reduce((s, e) => s + e.tipCents, 0);
      const splitTipsEntries = data.paymentSplits.filter(
        (split) => split.tipStaffId === st.id && split.tipCents > 0,
      );
      const splitTipsCents = splitTipsEntries.reduce((s, item) => s + item.tipCents, 0);
      return {
        id: st.id,
        name: st.name,
        percent: st.commissionPercent,
        servicesCount: entries.filter((e) => e.amountCents > 0).length,
        sales,
        commission,
        tips,
        splitTipsCents,
        splitTipsCount: splitTipsEntries.length,
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
  const uncollectedTotalCents = uncollectedBookings.reduce(
    (sum, item) => sum + item.remainingCents,
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

  const showUncollectedNotice =
    uncollectedBookings.length > 0 &&
    (sectionTab !== 'sales' || salesView !== 'uncollected');
  const showPendingDepositsNotice =
    pendingDeposits.length > 0 &&
    (sectionTab !== 'sales' || salesView !== 'receivable');

  return (
    <VStack gap={5} className="ad-page fx-fade-up">
      <HStack as="header" className="ad-page-head" justify="between" align="end" wrap="wrap" gap={3}>
        <VStack gap={1} className="ad-head-copy">
          <Heading level={1} className="ad-page-title">
            Ventas, caja y anticipos
          </Heading>
          <Text className="ad-page-sub">
            Control de ventas, fuga de ingresos sin cobrar, pagos divididos, arqueo, anticipos SPEI ({defaultDepositLabel}) y comisiones.
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

      {showUncollectedNotice || showPendingDepositsNotice ? (
        <VStack className="ad-surface" data-tone="warning" gap={0}>
          <VStack className="ad-row-list" gap={0}>
            {showUncollectedNotice ? (
              <HStack className="ad-row-item" justify="between" align="center" wrap="wrap" gap={3}>
                <HStack gap={3} align="center" className="rb-grow">
                  <VStack
                    className="ad-task-icon"
                    data-tone="accent"
                    align="center"
                    justify="center"
                    aria-hidden="true"
                  >
                    <AlertTriangle size={17} />
                  </VStack>
                  <VStack gap={0} className="rb-grow">
                    <Text weight="semibold" size="sm" hasTabularNumbers>
                      Citas sin cobrar (Fuga de ingresos): {uncollectedBookings.length} cita
                      {uncollectedBookings.length === 1 ? '' : 's'} por{' '}
                      {formatCurrency(uncollectedTotalCents, currency)}
                    </Text>
                    <Text type="supporting" color="secondary">
                      Citas terminadas o pasadas con saldo pendiente por registrar en caja.
                    </Text>
                  </VStack>
                </HStack>
                <Button
                  label="Ver citas sin cobrar"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSectionTab('sales');
                    setSalesView('uncollected');
                  }}
                />
              </HStack>
            ) : null}

            {showPendingDepositsNotice ? (
              <HStack className="ad-row-item" justify="between" align="center" wrap="wrap" gap={3}>
                <HStack gap={3} align="center" className="rb-grow">
                  <VStack
                    className="ad-task-icon"
                    data-tone="warning"
                    align="center"
                    justify="center"
                    aria-hidden="true"
                  >
                    <Wallet size={17} />
                  </VStack>
                  <VStack gap={0} className="rb-grow">
                    <Text weight="semibold" size="sm" hasTabularNumbers>
                      {pendingDeposits.length} anticipo{pendingDeposits.length === 1 ? '' : 's'}{' '}
                      pendiente{pendingDeposits.length === 1 ? '' : 's'} por validar (
                      {formatCurrency(pendingDepositsTotalCents, currency)})
                    </Text>
                    <Text type="supporting" color="secondary">
                      Revisa comprobantes web o de Instagram DM y confirma cada cita en 1 clic.
                    </Text>
                  </VStack>
                </HStack>
                <Button
                  label="Revisar anticipos"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSectionTab('sales');
                    setSalesView('receivable');
                  }}
                />
              </HStack>
            ) : null}
          </VStack>
        </VStack>
      ) : null}

      <section aria-label="Resumen financiero" className="ad-kpi-grid fx-stagger" data-cols="4">
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Ingresos brutos
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {formatCurrency(data.kpis.totalRevenueCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Total registrado
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Propinas universales
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {formatCurrency(data.kpis.totalTipsCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Para el equipo
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Sin cobrar / Anticipos
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={
              uncollectedTotalCents + pendingDepositsTotalCents > 0 ? 'warning' : 'success'
            }
            hasTabularNumbers
          >
            {formatCurrency(uncollectedTotalCents + pendingDepositsTotalCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            {uncollectedBookings.length} sin cobrar · {pendingDeposits.length} anticipos
          </Text>
        </VStack>
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Balance neto
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={data.kpis.netCashCents >= 0 ? 'success' : 'warning'}
            hasTabularNumbers
          >
            {formatCurrency(data.kpis.netCashCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            Egresos: {formatCurrency(data.kpis.totalExpensesCents, currency)}
          </Text>
        </VStack>
      </section>

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
        <VStack gap={4} key={`sales-${salesView}`} className="fx-step-in">
          <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={3}>
            <SegmentedControl
              label="Vista de ventas y caja"
              size="sm"
              value={salesView}
              onChange={(v) => setSalesView(v as SalesSubView)}
            >
              <SegmentedControlItem value="sold" label="Vendido" />
              <SegmentedControlItem value="cash" label="Caja" />
              <SegmentedControlItem
                value="uncollected"
                label={`Citas sin cobrar (${uncollectedBookings.length})`}
              />
              <SegmentedControlItem
                value="receivable"
                label={`Anticipos (${pendingDeposits.length})`}
              />
            </SegmentedControl>

            {salesView === 'sold' || salesView === 'cash' ? (
              <HStack gap={1.5} wrap="wrap">
                {(
                  [
                    { id: 'all', label: 'Todos' },
                    { id: 'paid', label: 'Pagados' },
                    { id: 'deposits', label: 'Anticipos' },
                    { id: 'pending', label: 'Pendientes' },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    className="ad-pill fx-press"
                    data-on={ledgerFilter === pill.id ? 'true' : 'false'}
                    aria-pressed={ledgerFilter === pill.id}
                    onClick={() => {
                      if (pill.id === 'pending' && salesView === 'cash') {
                        setSalesView('receivable');
                        return;
                      }
                      setLedgerFilter(pill.id);
                    }}
                  >
                    {pill.label}
                  </button>
                ))}
              </HStack>
            ) : null}
          </HStack>

          {salesView === 'uncollected' ? (
            <VStack className="ad-surface" gap={0}>
              <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
                <VStack gap={0.5} className="rb-grow">
                  <Heading level={2} className="lk-serif ad-h2">
                    Citas sin cobrar (Fuga de ingresos)
                  </Heading>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    Citas completadas o con horario ya vencido cuyo cobro total aún no cubre el servicio. Total pendiente:{' '}
                    <Text weight="semibold" hasTabularNumbers>
                      {formatCurrency(uncollectedTotalCents, currency)}
                    </Text>
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

              {uncollectedBookings.length === 0 ? (
                <VStack className="ad-empty" gap={2}>
                  <EmptyState
                    isCompact
                    title="Cero fugas de ingresos"
                    description="Todas las citas completadas y pasadas tienen su cobro registrado al 100%."
                    actions={
                      <Button
                        label="Ir a Citas"
                        variant="secondary"
                        size="sm"
                        href="/admin/citas"
                      />
                    }
                  />
                </VStack>
              ) : (
                <VStack className="ad-table-scroll" gap={0}>
                  <Table
                    idKey="bookingId"
                    hasHover
                    data={uncollectedBookings}
                    columns={[
                      {
                        key: 'clientName',
                        header: 'Clienta',
                        renderCell: (row) => (
                          <VStack gap={0.5}>
                            <Text weight="semibold">{row.clientName}</Text>
                            <HStack gap={2} wrap="wrap" align="center">
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {row.clientPhone}
                              </Text>
                              {row.clientInstagram ? (
                                <Link
                                  href={formatInstagramUrl(row.clientInstagram)}
                                  isExternalLink
                                  type="supporting"
                                >
                                  {formatInstagramDisplay(row.clientInstagram)}
                                </Link>
                              ) : null}
                            </HStack>
                          </VStack>
                        ),
                      },
                      {
                        key: 'serviceName',
                        header: 'Cita y especialista',
                        renderCell: (row) => (
                          <VStack gap={0.5}>
                            <Text weight="medium">
                              {row.serviceName} ({row.bookingCode})
                            </Text>
                            <HStack gap={2} wrap="wrap" align="center">
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {formatDateShortInTimezone(row.startAt, tz)} ·{' '}
                                {formatTimeInTimezone(row.startAt, tz, true)} · {row.staffName}
                              </Text>
                              <Badge
                                variant={row.status === 'completed' ? 'error' : 'warning'}
                                label={
                                  row.status === 'completed'
                                    ? 'Completada sin cobro'
                                    : 'Pasada sin cerrar'
                                }
                              />
                            </HStack>
                          </VStack>
                        ),
                      },
                      {
                        key: 'totalPriceCents',
                        header: 'Total vs. Pagado',
                        align: 'end',
                        renderCell: (row) => (
                          <VStack gap={0} align="end">
                            <Text weight="medium" hasTabularNumbers>
                              Total: {formatCurrency(row.totalPriceCents, currency)}
                            </Text>
                            <Text type="supporting" color="secondary" hasTabularNumbers>
                              Pagado: {formatCurrency(row.paidCents, currency)}
                            </Text>
                          </VStack>
                        ),
                      },
                      {
                        key: 'remainingCents',
                        header: 'Saldo restante',
                        align: 'end',
                        renderCell: (row) => (
                          <Text weight="bold" hasTabularNumbers>
                            {formatCurrency(row.remainingCents, currency)}
                          </Text>
                        ),
                      },
                      {
                        key: 'actions',
                        header: 'Acción',
                        align: 'end',
                        renderCell: (row) => (
                          <Button
                            label="Ir a cobrar"
                            variant="primary"
                            size="sm"
                            icon={<CreditCard size={14} />}
                            href={`/admin/citas?collect=${encodeURIComponent(row.bookingId)}`}
                          />
                        ),
                      },
                    ]}
                  />
                </VStack>
              )}
            </VStack>
          ) : salesView === 'receivable' ? (
            <VStack gap={4}>
              <VStack className="ad-surface" gap={0}>
                <HStack className="ad-section-head" justify="between" align="center" wrap="wrap" gap={2}>
                  <VStack gap={0.5} className="rb-grow">
                    <Heading level={2} className="lk-serif ad-h2">
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
                  <VStack className="ad-empty" gap={2}>
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
                  </VStack>
                ) : (
                  <VStack className="ad-table-scroll" gap={0}>
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
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                {formatDateShortInTimezone(dep.startAt, tz)} ·{' '}
                                {formatTimeInTimezone(dep.startAt, tz, true)} · {dep.staffName}
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
                                href={`/admin/citas?q=${encodeURIComponent(dep.bookingCode)}`}
                              />
                            </HStack>
                          ),
                        },
                      ]}
                    />
                  </VStack>
                )}
              </VStack>
            </VStack>
          ) : salesView === 'sold' ? (
            <VStack gap={4}>
              {splitSummaryByMethod.length > 0 ? (
                <VStack className="ad-surface" data-padded="true" gap={3}>
                  <VStack gap={0.5}>
                    <Heading level={3} className="lk-serif ad-h3">
                      Desglose por método de pago (Cobros divididos)
                    </Heading>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      Resumen real de pagos divididos registrados en cobro de citas ({data.paymentSplits.length} movimiento{data.paymentSplits.length === 1 ? '' : 's'}).
                    </Text>
                  </VStack>
                  <Grid columns={{ minWidth: 160, max: 5 }} gap={3}>
                    {splitSummaryByMethod.map((item) => (
                      <VStack
                        key={item.method}
                        className="ad-surface"
                        data-tone="subtle"
                        data-padded="true"
                        gap={1}
                      >
                        <Token
                          size="sm"
                          color={splitMethodTokenColor(item.method)}
                          label={item.label}
                        />
                        <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
                          {formatCurrency(item.amountCents, currency)}
                        </Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {item.count} cobro{item.count === 1 ? '' : 's'} · Propina:{' '}
                          {formatCurrency(item.tipCents, currency)}
                        </Text>
                      </VStack>
                    ))}
                  </Grid>
                </VStack>
              ) : null}

              <VStack className="ad-surface" gap={0}>
                {salesLedger.length === 0 ? (
                  <VStack className="ad-empty" gap={2}>
                    <EmptyState
                      isCompact
                      title="Sin movimientos con este filtro"
                      description="Prueba seleccionando Todos para ver el historial completo de ventas y anticipos."
                    />
                  </VStack>
                ) : (
                  <VStack className="ad-table-scroll" gap={0}>
                    <Table
                      idKey="id"
                      hasHover
                      data={salesLedger}
                      columns={[
                        {
                          key: 'dateIso',
                          header: 'Fecha',
                          renderCell: (row) => (
                            <Text type="supporting" hasTabularNumbers>
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
                              {row.isExpense ? '−' : '+'}
                              {formatCurrency(row.amountCents, currency)}
                            </Text>
                          ),
                        },
                      ]}
                    />
                  </VStack>
                )}
              </VStack>

              {splitDetails.length > 0 ? (
                <VStack className="ad-surface" gap={0}>
                  <HStack className="ad-section-head" justify="between" align="center" gap={2}>
                    <Heading level={3} className="lk-serif ad-h3">
                      Detalle de pagos divididos
                    </Heading>
                    <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                      {splitDetails.length}
                    </Text>
                  </HStack>
                  <VStack className="ad-table-scroll" gap={0}>
                    <Table
                      idKey="id"
                      hasHover
                      data={splitDetails}
                      columns={[
                        {
                          key: 'createdAt',
                          header: 'Fecha',
                          renderCell: (row) => (
                            <Text type="supporting" hasTabularNumbers>
                              {formatDateShortInTimezone(row.createdAt, tz)}
                            </Text>
                          ),
                        },
                        {
                          key: 'bookingCode',
                          header: 'Cita y clienta',
                          renderCell: (row) => (
                            <VStack gap={0}>
                              <Text weight="medium">{row.clientName}</Text>
                              <Text type="supporting" color="secondary">
                                {row.bookingCode}
                                {row.reference ? ` · Ref: ${row.reference}` : ''}
                              </Text>
                            </VStack>
                          ),
                        },
                        {
                          key: 'method',
                          header: 'Método',
                          renderCell: (row) => (
                            <Token
                              size="sm"
                              color={splitMethodTokenColor(row.method)}
                              label={splitMethodLabel(row.method)}
                            />
                          ),
                        },
                        {
                          key: 'amountCents',
                          header: 'Cobro',
                          align: 'end',
                          renderCell: (row) => (
                            <Text weight="semibold" hasTabularNumbers>
                              {formatCurrency(row.amountCents, currency)}
                            </Text>
                          ),
                        },
                        {
                          key: 'tipCents',
                          header: 'Propina / Especialista',
                          align: 'end',
                          renderCell: (row) => (
                            <VStack gap={0} align="end">
                              <Text hasTabularNumbers>
                                {formatCurrency(row.tipCents, currency)}
                              </Text>
                              {row.tipStaffName ? (
                                <Text type="supporting" color="secondary">
                                  Para {row.tipStaffName}
                                </Text>
                              ) : null}
                            </VStack>
                          ),
                        },
                      ]}
                    />
                  </VStack>
                </VStack>
              ) : null}
            </VStack>
          ) : (
            <VStack className="ad-split" gap={0}>
              <VStack className="ad-surface" gap={0}>
                <HStack className="ad-section-head" justify="between" align="center" gap={2}>
                  <Heading level={3} className="lk-serif ad-h3">
                    Movimientos de caja
                  </Heading>
                  <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                    {filteredCashEntries.length} movimiento{filteredCashEntries.length === 1 ? '' : 's'}
                  </Text>
                </HStack>

                {filteredCashEntries.length === 0 ? (
                  <VStack className="ad-empty" gap={2}>
                    <EmptyState
                      isCompact
                      title="Sin movimientos con este filtro"
                      description="Cambia el filtro o registra un ingreso o egreso en el panel derecho."
                    />
                  </VStack>
                ) : (
                  <VStack className="ad-table-scroll" gap={0}>
                    <Table
                      idKey="id"
                      hasHover
                      data={filteredCashEntries}
                      columns={[
                        {
                          key: 'occurredAt',
                          header: 'Fecha',
                          renderCell: (e) => (
                            <Text type="supporting" hasTabularNumbers>
                              {formatDateShortInTimezone(e.occurredAt, tz)}
                            </Text>
                          ),
                        },
                        {
                          key: 'description',
                          header: 'Concepto',
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
                              {e.entryType === 'expense' ? '−' : '+'}
                              {formatCurrency(Math.abs(e.amountCents), currency)}
                            </Text>
                          ),
                        },
                        {
                          key: 'tipCents',
                          header: 'Propina / Com.',
                          align: 'end',
                          renderCell: (e) => (
                            <VStack gap={0} align="end">
                              <Text type="supporting" hasTabularNumbers>
                                Prop: {formatCurrency(e.tipCents, currency)}
                              </Text>
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                Com: {formatCurrency(e.commissionCents, currency)}
                              </Text>
                            </VStack>
                          ),
                        },
                      ]}
                    />
                  </VStack>
                )}
              </VStack>

              <VStack gap={4}>
                <VStack className="ad-surface" data-padded="true" gap={3}>
                  <Heading level={3} className="lk-serif ad-h3">
                    Arqueo de efectivo en caja
                  </Heading>
                  <HStack justify="between" align="center" className="ad-cash-row">
                    <Text type="supporting" color="secondary">
                      Efectivo esperado por sistema
                    </Text>
                    <Text weight="semibold" hasTabularNumbers>
                      {formatCurrency(cashOnlyExpectedCents, currency)}
                    </Text>
                  </HStack>
                  <NumberInput
                    label="Efectivo contado físicamente (MXN)"
                    value={countedCashMxn}
                    min={0}
                    onChange={setCountedCashMxn}
                  />
                  <HStack justify="start">
                    <Text
                      color="inherit"
                      className="ad-chip"
                      data-tone={cashDiffCents === 0 ? 'success' : 'warning'}
                      hasTabularNumbers
                    >
                      {cashDiffCents === 0
                        ? 'Caja cuadrada'
                        : `Diferencia: ${formatCurrency(cashDiffCents, currency)}`}
                    </Text>
                  </HStack>
                </VStack>

                {data.session.user.role !== 'specialist' ? (
                  <VStack className="ad-surface" data-padded="true" gap={3}>
                    <form onSubmit={submitCashEntry}>
                      <VStack gap={3}>
                        <Heading level={3} className="lk-serif ad-h3">
                          Registrar movimiento
                        </Heading>
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
                        <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
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
                  </VStack>
                ) : null}
              </VStack>
            </VStack>
          )}
        </VStack>
      ) : sectionTab === 'commissions' ? (
        <VStack gap={4} key="commissions" className="fx-step-in">
          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" gap={2}>
              <Heading level={2} className="lk-serif ad-h2">
                Comisiones y propinas por manicurista
              </Heading>
              <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                {commissionsByStaff.length} especialista{commissionsByStaff.length === 1 ? '' : 's'}
              </Text>
            </HStack>
            <VStack className="ad-table-scroll" gap={0}>
              <Table
                idKey="id"
                hasHover
                data={commissionsByStaff}
                columns={[
                  { key: 'name', header: 'Manicurista' },
                  {
                    key: 'percent',
                    header: '% Comisión',
                    renderCell: (r) => (
                      <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                        {r.percent}%
                      </Text>
                    ),
                  },
                  {
                    key: 'servicesCount',
                    header: 'Servicios / Ventas',
                    renderCell: (r) => <Text hasTabularNumbers>{r.servicesCount}</Text>,
                  },
                  {
                    key: 'sales',
                    header: 'Venta generada',
                    align: 'end',
                    renderCell: (r) => (
                      <Text hasTabularNumbers>{formatCurrency(r.sales, currency)}</Text>
                    ),
                  },
                  {
                    key: 'commission',
                    header: 'Comisión',
                    align: 'end',
                    renderCell: (r) => (
                      <Text hasTabularNumbers>{formatCurrency(r.commission, currency)}</Text>
                    ),
                  },
                  {
                    key: 'tips',
                    header: 'Propinas (universales)',
                    align: 'end',
                    renderCell: (r) => (
                      <VStack gap={0} align="end">
                        <Text hasTabularNumbers>{formatCurrency(r.tips, currency)}</Text>
                        {r.splitTipsCount > 0 ? (
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {r.splitTipsCount} en cobro dividido ({formatCurrency(r.splitTipsCents, currency)})
                          </Text>
                        ) : null}
                      </VStack>
                    ),
                  },
                  {
                    key: 'totalPayout',
                    header: 'Total a pagar',
                    align: 'end',
                    renderCell: (r) => (
                      <Text weight="bold" hasTabularNumbers>
                        {formatCurrency(r.totalPayout, currency)}
                      </Text>
                    ),
                  },
                ]}
              />
            </VStack>
          </VStack>

          {splitSummaryByMethod.length > 0 ? (
            <VStack className="ad-surface" data-padded="true" gap={3}>
              <Heading level={3} className="lk-serif ad-h3">
                Resumen de cobros divididos y propinas por método
              </Heading>
              <Grid columns={{ minWidth: 160, max: 5 }} gap={3}>
                {splitSummaryByMethod.map((item) => (
                  <VStack
                    key={item.method}
                    className="ad-surface"
                    data-tone="subtle"
                    data-padded="true"
                    gap={1}
                  >
                    <Token
                      size="sm"
                      color={splitMethodTokenColor(item.method)}
                      label={item.label}
                    />
                    <Text className="lk-serif ad-h3 fx-tabular" hasTabularNumbers>
                      {formatCurrency(item.amountCents, currency)}
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      Propinas: {formatCurrency(item.tipCents, currency)}
                    </Text>
                  </VStack>
                ))}
              </Grid>
            </VStack>
          ) : null}
        </VStack>
      ) : (
        <VStack className="ad-split fx-step-in" key="coupons" gap={0}>
          <VStack className="ad-surface" gap={0}>
            <HStack className="ad-section-head" justify="between" align="center" gap={2}>
              <Heading level={2} className="lk-serif ad-h2">
                Cupones y Gift Cards activos
              </Heading>
              <Text color="inherit" className="ad-chip" data-tone="neutral" hasTabularNumbers>
                {data.coupons.length}
              </Text>
            </HStack>
            <VStack className="ad-table-scroll" gap={0}>
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
                      <Text
                        color="inherit"
                        className="ad-chip"
                        data-tone={c.kind === 'gift_card' ? 'accent' : 'neutral'}
                      >
                        {c.kind === 'gift_card' ? 'Gift Card' : 'Cupón'}
                      </Text>
                    ),
                  },
                  {
                    key: 'discountValue',
                    header: 'Valor / Saldo',
                    renderCell: (c) => (
                      <Text hasTabularNumbers>
                        {c.kind === 'gift_card'
                          ? `Saldo: ${formatCurrency(c.remainingBalanceCents ?? 0, currency)}`
                          : c.discountType === 'percent'
                            ? `${c.discountValue}%`
                            : formatCurrency(c.discountValue, currency)}
                      </Text>
                    ),
                  },
                  {
                    key: 'usedCount',
                    header: 'Usos',
                    renderCell: (c) => (
                      <Text hasTabularNumbers>
                        {c.usedCount}
                        {c.maxUses ? ` / ${c.maxUses}` : ''}
                      </Text>
                    ),
                  },
                ]}
              />
            </VStack>
          </VStack>

          <VStack className="ad-surface" data-padded="true" gap={3}>
            <form onSubmit={submitCoupon}>
              <VStack gap={3}>
                <Heading level={3} className="lk-serif ad-h3">
                  Crear Cupón o Gift Card digital
                </Heading>
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
          </VStack>
        </VStack>
      )}
    </VStack>
  );
}
