'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Banner } from '@astryxdesign/core/Banner';
import { Download, ExternalLink } from 'lucide-react';
import {
  useAdminData,
  type AdminOverviewPayload,
} from '@/components/admin/AdminProvider';
import { OwnerPinDialog } from '@/components/admin/config/OwnerPinDialog';
import { CajaSummaryTab } from '@/components/admin/caja/CajaSummaryTab';
import { CajaDepositsTab } from '@/components/admin/caja/CajaDepositsTab';
import { CajaCommissionsTab } from '@/components/admin/caja/CajaCommissionsTab';
import { CajaPromosTab } from '@/components/admin/caja/CajaPromosTab';
import {
  SPLIT_METHOD_ORDER,
  resolveInitialCajaRoute,
  splitMethodLabel,
  type CajaTab,
  type CommissionStaffRow,
  type MethodSummaryRow,
  type PendingDepositRow,
  type PromosSubTab,
  type ServicePackageCatalogRow,
  type SplitDetailRow,
  type UncollectedBookingRow,
} from '@/components/admin/caja/cajaTypes';
import {
  ADMIN_CACHE_KEYS,
  applyOptimisticBookingStatus,
  applyOptimisticBookingStatusToList,
  fetchAdminJson,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  mutateAdminCache,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { formatCurrency } from '@/lib/format';
import type {
  BookingWithRelations,
  PaymentMethod,
  PaymentSplitMethod,
} from '@/lib/types';

export default function AdminCashPage() {
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialRoute = resolveInitialCajaRoute(tabParam);

  const [activeTab, setActiveTab] = useState<CajaTab>(initialRoute.tab);
  const [highlightUncollected, setHighlightUncollected] = useState<boolean>(
    initialRoute.highlightUncollected,
  );
  const [promosView, setPromosView] = useState<PromosSubTab>(initialRoute.promosView);

  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const [packagesSeq, setPackagesSeq] = useState(0);
  const [togglingPkgId, setTogglingPkgId] = useState<string | null>(null);

  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvPinOpen, setCsvPinOpen] = useState(false);
  const [csvPinError, setCsvPinError] = useState<string | null>(null);

  const lastTabParamRef = useRef<string | null>(tabParam);

  useExternalSync(`caja-tab|${tabParam ?? ''}`, async (signal) => {
    if (signal.aborted || lastTabParamRef.current === tabParam) return;
    lastTabParamRef.current = tabParam;
    const next = resolveInitialCajaRoute(tabParam);
    setActiveTab(next.tab);
    setHighlightUncollected(next.highlightUncollected);
    setPromosView(next.promosView);
  });

  const canQueryOperations = Boolean(
    providerData &&
      (providerData.session.user.role === 'owner' ||
        providerData.session.user.role === 'admin'),
  );

  const fetchOverview = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    [],
  );
  const fetchPackages = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<{ servicePackages?: ServicePackageCatalogRow[] }>(
        ADMIN_CACHE_KEYS.packages,
        signal,
      ),
    [],
  );
  const fetchOperations = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<{ ok: boolean }>(ADMIN_CACHE_KEYS.operations, signal),
    [],
  );

  const overviewQuery = useAdminCachedQuery<AdminOverviewPayload>(
    providerData ? ADMIN_CACHE_KEYS.overview : null,
    fetchOverview,
    {
      enabled: Boolean(providerData),
      initialData: providerData ?? undefined,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const packagesQuery = useAdminCachedQuery<{
    servicePackages?: ServicePackageCatalogRow[];
  }>(providerData ? ADMIN_CACHE_KEYS.packages : null, fetchPackages, {
    enabled: Boolean(providerData),
    staleTimeMs: 10_000,
    revalidateKey: packagesSeq,
  });

  useAdminCachedQuery<{ ok: boolean }>(
    canQueryOperations ? ADMIN_CACHE_KEYS.operations : null,
    fetchOperations,
    {
      enabled: canQueryOperations,
      staleTimeMs: 15_000,
    },
  );

  const data = overviewQuery.data ?? providerData;
  const packagesCatalog = packagesQuery.data?.servicePackages ?? [];
  const packagesLoading = packagesQuery.isLoading;

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

  const commissionsByStaff = useMemo<CommissionStaffRow[]>(() => {
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
  const canManagePackages =
    data.session.user.role === 'owner' || data.session.user.role === 'admin';
  const hasActiveOwnerPin = Boolean(
    data.settings.ownerPinEnabled && data.settings.hasOwnerPin,
  );

  const handleApproveDeposit = async (
    bookingId: string,
    bookingCode: string,
  ): Promise<boolean> => {
    setApprovingId(bookingId);
    setErrorMsg(null);
    setMsg(null);

    const prevOverview =
      getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) ?? data;
    const prevBookings = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
    );

    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      applyOptimisticBookingStatus(current ?? prevOverview, bookingId, 'confirmed'),
    );
    if (prevBookings) {
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        (current) =>
          current
            ? applyOptimisticBookingStatusToList(current, bookingId, 'confirmed')
            : current,
      );
    }

    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          status: 'confirmed',
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
        if (prevBookings) {
          mutateAdminCache<{ bookings: BookingWithRelations[] }>(
            ADMIN_CACHE_KEYS.bookings,
            prevBookings,
          );
        }
        setErrorMsg(json?.error || 'No se pudo confirmar el anticipo.');
        return false;
      }
      invalidateAdminCache('/api/admin/reports');
      setMsg(`Anticipo confirmado y cita ${bookingCode} lista en agenda.`);
      void refresh();
      return true;
    } catch {
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
      if (prevBookings) {
        mutateAdminCache<{ bookings: BookingWithRelations[] }>(
          ADMIN_CACHE_KEYS.bookings,
          prevBookings,
        );
      }
      setErrorMsg('No se pudo conectar para confirmar el anticipo.');
      return false;
    } finally {
      setApprovingId(null);
    }
  };

  const handleRecordCashEntry = async (input: {
    entryType: 'expense' | 'product_sale' | 'service_income';
    description: string;
    amountMxn: number;
    method: PaymentMethod;
  }): Promise<boolean> => {
    setErrorMsg(null);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'cash',
          data: {
            bookingId: null,
            staffId: null,
            entryType: input.entryType,
            description: input.description,
            amountCents: Math.round(input.amountMxn * 100),
            tipCents: 0,
            commissionCents: 0,
            paymentMethod: input.method,
          },
        }),
      });
      if (!res.ok) {
        setErrorMsg('No se pudo guardar el movimiento.');
        return false;
      }
      setMsg(
        input.entryType === 'expense'
          ? 'Gasto registrado en caja.'
          : input.entryType === 'product_sale'
            ? 'Venta registrada en caja.'
            : 'Ingreso registrado en caja.',
      );
      await refresh();
      return true;
    } catch {
      setErrorMsg('No se pudo conectar para guardar el movimiento.');
      return false;
    }
  };

  const handleCreateCoupon = async (input: {
    code: string;
    kind: 'coupon' | 'gift_card';
    discountType: 'percent' | 'fixed_cents';
    value: number;
    recipient: string;
  }): Promise<boolean> => {
    setErrorMsg(null);
    setMsg(null);
    const isFixed = input.kind === 'gift_card' || input.discountType === 'fixed_cents';
    try {
      const res = await fetch('/api/admin/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'coupon',
          data: {
            code: input.code,
            kind: input.kind,
            discountType: isFixed ? 'fixed_cents' : 'percent',
            discountValue: isFixed ? Math.round(input.value * 100) : input.value,
            remainingBalanceCents:
              input.kind === 'gift_card' ? Math.round(input.value * 100) : null,
            maxUses: input.kind === 'gift_card' ? 1 : 100,
            minSubtotalCents: 0,
            expiresAt: null,
            recipientName: input.recipient || null,
            isActive: true,
          },
        }),
      });
      if (!res.ok) {
        setErrorMsg('No se pudo crear el código.');
        return false;
      }
      setMsg(
        input.kind === 'gift_card'
          ? 'Tarjeta de regalo activada para tus clientas.'
          : 'Cupón activado en tu página de citas.',
      );
      await refresh();
      return true;
    } catch {
      setErrorMsg('No se pudo conectar para crear el código.');
      return false;
    }
  };

  const handleCreatePackage = async (input: {
    name: string;
    description: string;
    serviceId: string;
    totalSessions: number;
    priceMxn: number;
    validDays: number;
  }): Promise<boolean> => {
    setErrorMsg(null);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'catalog',
          name: input.name,
          description: input.description,
          serviceId: input.serviceId,
          totalSessions: Math.max(2, Math.min(24, Math.round(input.totalSessions || 2))),
          priceCents: Math.max(0, Math.round((input.priceMxn || 0) * 100)),
          validDays:
            input.validDays > 0
              ? Math.max(7, Math.min(730, Math.round(input.validDays)))
              : null,
          isActive: true,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrorMsg(json?.error || 'No se pudo crear el paquete de sesiones.');
        return false;
      }
      setPackagesSeq((prev) => prev + 1);
      setMsg('Paquete de sesiones guardado.');
      return true;
    } catch {
      setErrorMsg('No se pudo conectar para guardar el paquete.');
      return false;
    }
  };

  const handleTogglePackage = async (
    pkg: ServicePackageCatalogRow,
    nextActive: boolean,
  ) => {
    setTogglingPkgId(pkg.id);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/packages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_catalog',
          packageId: pkg.id,
          isActive: nextActive,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setErrorMsg(json?.error || 'No se pudo actualizar el paquete.');
        return;
      }
      setPackagesSeq((prev) => prev + 1);
      setMsg(
        nextActive
          ? `Paquete "${pkg.name}" activado.`
          : `Paquete "${pkg.name}" pausado.`,
      );
    } catch {
      setErrorMsg('No se pudo conectar para actualizar el paquete.');
    } finally {
      setTogglingPkgId(null);
    }
  };

  const handleExportCsv = async (ownerPin?: string) => {
    if (!ownerPin && hasActiveOwnerPin) {
      setCsvPinError(null);
      setCsvPinOpen(true);
      return;
    }
    setExportingCsv(true);
    setErrorMsg(null);
    setCsvPinError(null);
    try {
      const headers: Record<string, string> = {};
      if (ownerPin) {
        headers['x-owner-pin'] = ownerPin;
      }
      const res = await fetch('/api/admin/operations?export=csv', {
        method: 'GET',
        headers,
      });
      if (res.status === 403) {
        const errJson = (await res.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        if (
          errJson?.code === 'OWNER_PIN_REQUIRED' ||
          errJson?.code === 'OWNER_PIN_INVALID'
        ) {
          setCsvPinOpen(true);
          setCsvPinError(
            errJson.code === 'OWNER_PIN_INVALID'
              ? errJson.error || 'PIN de dueña incorrecto.'
              : null,
          );
          return;
        }
        setErrorMsg(errJson?.error || 'No tienes permiso para descargar el archivo.');
        return;
      }
      if (!res.ok) {
        setErrorMsg('No se pudo descargar el archivo.');
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'nails-reporte-caja.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      setCsvPinOpen(false);
      setMsg('Archivo descargado correctamente.');
      await refresh();
    } catch {
      setErrorMsg('No se pudo conectar para descargar el archivo.');
    } finally {
      setExportingCsv(false);
    }
  };

  const pendingTotalCents = uncollectedTotalCents + pendingDepositsTotalCents;

  return (
    <VStack gap={5} className="ad-page fx-fade-up">
      <HStack
        as="header"
        className="ad-page-head"
        justify="between"
        align="end"
        wrap="wrap"
        gap={3}
      >
        <VStack gap={1} className="ad-head-copy">
          <Heading level={1} className="ad-page-title">
            Caja
          </Heading>
          <Text className="ad-page-sub">
            Cobra citas pendientes, valida anticipos, haz tu corte de caja y consulta comisiones.
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Ver agenda"
            variant="ghost"
            size="sm"
            icon={<ExternalLink size={14} aria-hidden="true" />}
            href="/admin/citas"
          />
          <Button
            type="button"
            label="Descargar en Excel (CSV)"
            variant="secondary"
            size="sm"
            icon={<Download size={15} aria-hidden="true" />}
            isLoading={exportingCsv}
            isDisabled={exportingCsv}
            onClick={() => void handleExportCsv()}
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

      <section aria-label="Resumen de caja" className="ad-kpis-3 fx-stagger">
        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Cobrado
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {formatCurrency(data.kpis.totalRevenueCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            Neto {formatCurrency(data.kpis.netCashCents, currency)} · Gastos{' '}
            {formatCurrency(data.kpis.totalExpensesCents, currency)}
          </Text>
        </VStack>

        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Por cobrar
          </Text>
          <Text
            className="lk-serif ad-kpi-val fx-tabular"
            data-tone={pendingTotalCents > 0 ? 'warning' : 'success'}
            hasTabularNumbers
          >
            {formatCurrency(pendingTotalCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub" hasTabularNumbers>
            {uncollectedBookings.length} sin cobrar · {pendingDeposits.length} anticipos
          </Text>
        </VStack>

        <VStack as="article" className="ad-card ad-kpi-card fx-card-lift" gap={1}>
          <Text type="supporting" color="secondary" weight="medium" className="ad-kpi-label">
            Propinas
          </Text>
          <Text className="lk-serif ad-kpi-val fx-tabular" hasTabularNumbers>
            {formatCurrency(data.kpis.totalTipsCents, currency)}
          </Text>
          <Text type="supporting" color="secondary" className="ad-kpi-sub">
            Para tus manicuristas
          </Text>
        </VStack>
      </section>

      <TabList
        value={activeTab}
        onChange={(v) => {
          setActiveTab(v as CajaTab);
          if (v !== 'summary') setHighlightUncollected(false);
        }}
        hasDivider
      >
        <Tab
          value="summary"
          label={
            uncollectedBookings.length > 0
              ? `Resumen de hoy (${uncollectedBookings.length})`
              : 'Resumen de hoy'
          }
        />
        <Tab
          value="deposits"
          label={
            pendingDeposits.length > 0
              ? `Anticipos (${pendingDeposits.length})`
              : 'Anticipos'
          }
        />
        <Tab value="commissions" label="Comisiones" />
        <Tab value="promos" label="Promos y paquetes" />
      </TabList>

      {activeTab === 'summary' ? (
        <CajaSummaryTab
          cashEntries={data.cashEntries}
          uncollectedBookings={uncollectedBookings}
          uncollectedTotalCents={uncollectedTotalCents}
          pendingDepositsCount={pendingDeposits.length}
          pendingDepositsTotalCents={pendingDepositsTotalCents}
          splitDetails={splitDetails}
          todayKey={data.serverTodayKey}
          tz={tz}
          currency={currency}
          canRecordCash={data.session.user.role !== 'specialist'}
          highlightUncollected={highlightUncollected}
          onOpenDeposits={() => setActiveTab('deposits')}
          onRecordCashEntry={handleRecordCashEntry}
        />
      ) : activeTab === 'deposits' ? (
        <CajaDepositsTab
          pendingDeposits={pendingDeposits}
          defaultDepositLabel={defaultDepositLabel}
          depositBankName={data.settings.depositBankName}
          depositClabe={data.settings.depositClabe}
          instagramHandle={data.settings.instagramHandle}
          tz={tz}
          currency={currency}
          approvingId={approvingId}
          onApproveDeposit={handleApproveDeposit}
        />
      ) : activeTab === 'commissions' ? (
        <CajaCommissionsTab
          commissionsByStaff={commissionsByStaff}
          splitSummaryByMethod={splitSummaryByMethod}
          currency={currency}
        />
      ) : (
        <CajaPromosTab
          subTab={promosView}
          onSubTabChange={setPromosView}
          coupons={data.coupons}
          packagesCatalog={packagesCatalog}
          packagesLoading={packagesLoading}
          services={data.services}
          currency={currency}
          canManagePackages={canManagePackages}
          togglingPkgId={togglingPkgId}
          onCreateCoupon={handleCreateCoupon}
          onCreatePackage={handleCreatePackage}
          onTogglePackage={handleTogglePackage}
        />
      )}

      <OwnerPinDialog
        isOpen={csvPinOpen}
        onOpenChange={(open) => {
          setCsvPinOpen(open);
          if (!open) setCsvPinError(null);
        }}
        title="Autorizar descarga en Excel (CSV)"
        description="Para descargar el archivo de caja necesitas ingresar el PIN de dueña."
        actionLabel="Autorizar y descargar"
        isSubmitting={exportingCsv}
        error={csvPinError}
        onConfirm={(pin) => handleExportCsv(pin)}
      />
    </VStack>
  );
}
