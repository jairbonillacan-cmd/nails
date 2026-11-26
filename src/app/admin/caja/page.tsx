'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Banner } from '@astryxdesign/core/Banner';
import { Download, ExternalLink } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { CajaSummaryTab } from '@/components/admin/caja/CajaSummaryTab';
import {
  approveCajaDeposit,
  createCajaCoupon,
  createCajaPackage,
  exportCajaCsv,
  recordCajaCashEntry,
  toggleCajaPackage,
} from '@/components/admin/caja/cajaActions';
import { useCajaData } from '@/components/admin/caja/useCajaData';
import type { CajaTab, ServicePackageCatalogRow } from '@/components/admin/caja/cajaTypes';
import { MetricGrid, PageHeader, PageSkeleton, SkeletonBlock } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';

function CajaTabFallback() {
  return (
    <VStack gap={3} role="status" aria-live="polite" aria-label="Cargando sección de caja">
      <SkeletonBlock width="100%" height="5rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="10rem" radius={3} index={1} />
    </VStack>
  );
}

const CajaDepositsTab = dynamic(
  () =>
    import('@/components/admin/caja/CajaDepositsTab').then((mod) => mod.CajaDepositsTab),
  { ssr: false, loading: CajaTabFallback },
);

const CajaCommissionsTab = dynamic(
  () =>
    import('@/components/admin/caja/CajaCommissionsTab').then(
      (mod) => mod.CajaCommissionsTab,
    ),
  { ssr: false, loading: CajaTabFallback },
);

const CajaPromosTab = dynamic(
  () =>
    import('@/components/admin/caja/CajaPromosTab').then((mod) => mod.CajaPromosTab),
  { ssr: false, loading: CajaTabFallback },
);

const OwnerPinDialog = dynamic(
  () => import('@/components/admin/config/OwnerPinDialog').then((mod) => mod.OwnerPinDialog),
  { ssr: false },
);

export default function AdminCashPage() {
  const { data: providerData, bookingEventSeq, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const {
    data,
    activeTab,
    setActiveTab,
    highlightUncollected,
    setHighlightUncollected,
    promosView,
    setPromosView,
    packagesCatalog,
    packagesLoading,
    reloadPackages,
    pendingDeposits,
    uncollectedBookings,
    pendingDepositsTotalCents,
    uncollectedTotalCents,
    kpiItems,
    splitSummaryByMethod,
    splitDetails,
    commissionsByStaff,
  } = useCajaData(providerData, bookingEventSeq, searchParams.get('tab'));

  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [togglingPkgId, setTogglingPkgId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvPinOpen, setCsvPinOpen] = useState(false);
  const [csvPinError, setCsvPinError] = useState<string | null>(null);

  if (!data) {
    return <PageSkeleton kpiCount={3} withSplit ariaLabel="Cargando caja" />;
  }

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const defaultDepositLabel = formatCurrency(
    data.settings.depositAmountCents ?? 20000,
    currency,
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
    try {
      const result = await approveCajaDeposit(data, bookingId, bookingCode);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo confirmar el anticipo.');
        return false;
      }
      setMsg(result.message ?? null);
      void refresh();
      return true;
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
    const result = await recordCajaCashEntry(input);
    if (!result.ok) {
      setErrorMsg(result.error ?? 'No se pudo guardar el movimiento.');
      return false;
    }
    setMsg(result.message ?? null);
    await refresh();
    return true;
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
    const result = await createCajaCoupon(input);
    if (!result.ok) {
      setErrorMsg(result.error ?? 'No se pudo crear el código.');
      return false;
    }
    setMsg(result.message ?? null);
    await refresh();
    return true;
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
    const result = await createCajaPackage(input);
    if (!result.ok) {
      setErrorMsg(result.error ?? 'No se pudo crear el paquete de sesiones.');
      return false;
    }
    reloadPackages();
    setMsg(result.message ?? null);
    return true;
  };

  const handleTogglePackage = async (
    pkg: ServicePackageCatalogRow,
    nextActive: boolean,
  ) => {
    setTogglingPkgId(pkg.id);
    setErrorMsg(null);
    try {
      const result = await toggleCajaPackage(pkg, nextActive);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo actualizar el paquete.');
        return;
      }
      reloadPackages();
      setMsg(result.message ?? null);
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
      const result = await exportCajaCsv(ownerPin);
      if (result.status === 'pin_required') {
        setCsvPinOpen(true);
        setCsvPinError(result.error);
        return;
      }
      if (result.status === 'error') {
        setErrorMsg(result.error);
        return;
      }
      setCsvPinOpen(false);
      setMsg('Archivo descargado correctamente.');
      await refresh();
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <VStack gap={5} className="ad-page fx-fade-up">
      <PageHeader
        title="Caja"
        subtitle="Cobra citas pendientes, valida anticipos, haz tu corte de caja y consulta comisiones."
        actions={
          <>
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
          </>
        }
      />

      {msg ? (
        <Banner
          status="success"
          role="status"
          title={msg}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      {errorMsg ? (
        <Banner
          status="error"
          role="alert"
          title={errorMsg}
          isDismissable
          onDismiss={() => setErrorMsg(null)}
        />
      ) : null}

      <MetricGrid ariaLabel="Resumen de caja" cols={3} items={kpiItems} />

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

      {csvPinOpen ? (
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
      ) : null}
    </VStack>
  );
}
