'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/VStack';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Banner } from '@astryxdesign/core/Banner';
import { Calculator, Download, Plus, SlidersHorizontal } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { CajaSummaryTab } from '@/components/admin/caja/CajaSummaryTab';
import {
  approveCajaDeposit,
  deleteCajaCashEntry,
  deleteCajaCoupon,
  exportCajaCsv,
  recordCajaCashEntry,
  rejectCajaDeposit,
  saveCajaConfig,
  saveCajaCoupon,
  saveCajaPackage,
  toggleCajaCouponActive,
  toggleCajaPackage,
  updateCajaCashEntry,
  updateCajaStaffCommission,
  type RecordCajaEntryInput,
  type SaveCajaPackageInput,
  type UpdateCajaCashEntryInput,
} from '@/components/admin/caja/cajaActions';
import {
  buildCommissionPayoutDraft,
  type CommissionPayoutDraft,
  type CouponPayloadData,
} from '@/components/admin/caja/cajaMetrics';
import { useCajaData } from '@/components/admin/caja/useCajaData';
import type {
  CajaTab,
  CommissionStaffRow,
  ServicePackageCatalogRow,
} from '@/components/admin/caja/cajaTypes';
import {
  ConfirmActionDialog,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
} from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { CajaConfig, CashRegisterEntry, Coupon, StaffMember } from '@/lib/types';
import { FORM_SUBMIT_OK, formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';

function CajaTabFallback() {
  return (
    <VStack gap={3} role="status" aria-live="polite" aria-label="Cargando sección de caja">
      <SkeletonBlock width="100%" height="5rem" radius={3} index={0} />
      <SkeletonBlock width="100%" height="10rem" radius={3} index={1} />
    </VStack>
  );
}

const CajaDepositsTab = dynamic(
  () => import('@/components/admin/caja/CajaDepositsTab').then((mod) => mod.CajaDepositsTab),
  { ssr: false, loading: CajaTabFallback },
);

const CajaCommissionsTab = dynamic(
  () =>
    import('@/components/admin/caja/CajaCommissionsTab').then((mod) => mod.CajaCommissionsTab),
  { ssr: false, loading: CajaTabFallback },
);

const CajaPromosTab = dynamic(
  () => import('@/components/admin/caja/CajaPromosTab').then((mod) => mod.CajaPromosTab),
  { ssr: false, loading: CajaTabFallback },
);

const CashMovementDialog = dynamic(
  () => import('@/components/admin/caja/CashMovementForm').then((mod) => mod.CashMovementDialog),
  { ssr: false },
);

const CommissionPayoutDialog = dynamic(
  () =>
    import('@/components/admin/caja/CashMovementForm').then((mod) => mod.CommissionPayoutDialog),
  { ssr: false },
);

const CashCloseDialog = dynamic(
  () => import('@/components/admin/caja/CashCloseDialog').then((mod) => mod.CashCloseDialog),
  { ssr: false },
);

const CajaSettingsDialog = dynamic(
  () => import('@/components/admin/caja/CajaSettingsDialog').then((mod) => mod.CajaSettingsDialog),
  { ssr: false },
);

const CommissionRateDialog = dynamic(
  () =>
    import('@/components/admin/caja/CommissionRateDialog').then((mod) => mod.CommissionRateDialog),
  { ssr: false },
);

const ManualCashEditDialog = dynamic(
  () =>
    import('@/components/admin/caja/ManualCashEditDialog').then((mod) => mod.ManualCashEditDialog),
  { ssr: false },
);

const OwnerPinDialog = dynamic(
  () => import('@/components/admin/config/OwnerPinDialog').then((mod) => mod.OwnerPinDialog),
  { ssr: false },
);

export default function AdminCashPage() {
  const { data: providerData, refresh } = useAdminData();
  const searchParams = useSearchParams();
  const {
    data,
    cajaConfig,
    activeTab,
    setActiveTab,
    highlightUncollected,
    setHighlightUncollected,
    promosView,
    setPromosView,
    cajaPeriod,
    setCajaPeriod,
    customRange,
    setCustomRange,
    activeCustom,
    activePeriodText,
    methodFilter,
    toggleMethodFilter,
    searchQuery,
    setSearchQuery,
    resetSalesFilters,
    packagesCatalog,
    packagesLoading,
    reloadPackages,
    pendingDeposits,
    uncollectedBookings,
    pendingDepositsTotalCents,
    uncollectedTotalCents,
    kpiItems,
    periodSummary,
    todaySummary,
    filteredCashEntries,
    filteredSplitDetails,
    splitSummaryByMethod,
    commissionsByStaff,
    todayCommissionsByStaff,
  } = useCajaData(providerData, searchParams.get('tab'));

  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectConfirmTarget, setRejectConfirmTarget] = useState<{
    bookingId: string;
    bookingCode: string;
  } | null>(null);
  const rejectResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [deleteCouponTarget, setDeleteCouponTarget] = useState<Coupon | null>(null);
  const [togglingCouponId, setTogglingCouponId] = useState<string | null>(null);
  const [deletingCouponId, setDeletingCouponId] = useState<string | null>(null);
  const [editingCashEntry, setEditingCashEntry] = useState<CashRegisterEntry | null>(null);
  const [deleteCashTarget, setDeleteCashTarget] = useState<CashRegisterEntry | null>(null);
  const [deletingCashEntryId, setDeletingCashEntryId] = useState<string | null>(null);
  const [editingCommissionStaffId, setEditingCommissionStaffId] = useState<string | null>(null);
  const [payoutDraft, setPayoutDraft] = useState<CommissionPayoutDraft | null>(null);
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [togglingPkgId, setTogglingPkgId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvPinOpen, setCsvPinOpen] = useState(false);
  const [csvPinError, setCsvPinError] = useState<string | null>(null);

  if (!data) {
    return <PageSkeleton kpiCount={3} withSplit ariaLabel="Cargando caja" />;
  }

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const nowMs = Date.parse(data.serverNowIso) || 0;
  const defaultDepositLabel = formatCurrency(data.settings.depositAmountCents ?? 20000, currency);
  const isSpecialistView = data.session.user.role === 'specialist';
  const canManageCaja = data.session.user.role === 'owner' || data.session.user.role === 'admin';
  const effectiveActiveTab: CajaTab =
    activeTab === 'promos' && !canManageCaja ? 'summary' : activeTab;
  const hasActiveOwnerPin = Boolean(data.settings.ownerPinEnabled && data.settings.hasOwnerPin);
  const hasActiveFilters =
    cajaPeriod !== cajaConfig.defaultPeriod ||
    methodFilter !== 'all' ||
    searchQuery.trim().length > 0;

  const editingCommissionMember = editingCommissionStaffId
    ? (data.staff.find((member) => member.id === editingCommissionStaffId) ?? null)
    : null;
  const editingCommissionRow = editingCommissionStaffId
    ? (commissionsByStaff.find((row) => row.id === editingCommissionStaffId) ?? null)
    : null;

  const settlePendingReject = (ok: boolean) => {
    const resolve = rejectResolveRef.current;
    rejectResolveRef.current = null;
    resolve?.(ok);
  };

  const handleApproveDeposit = async (bookingId: string, bookingCode: string): Promise<boolean> => {
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

  const handleRejectDeposit = (bookingId: string, bookingCode: string): Promise<boolean> => {
    settlePendingReject(false);
    setRejectConfirmTarget({ bookingId, bookingCode });
    return new Promise<boolean>((resolve) => {
      rejectResolveRef.current = resolve;
    });
  };

  const handleConfirmRejectDeposit = async () => {
    if (!rejectConfirmTarget) return;
    const { bookingId, bookingCode } = rejectConfirmTarget;
    setRejectingId(bookingId);
    setErrorMsg(null);
    setMsg(null);
    try {
      const result = await rejectCajaDeposit(data, bookingId, bookingCode);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo rechazar el comprobante.');
        setRejectConfirmTarget(null);
        settlePendingReject(false);
        return;
      }
      setMsg(result.message ?? null);
      setRejectConfirmTarget(null);
      settlePendingReject(true);
      void refresh();
    } finally {
      setRejectingId(null);
    }
  };

  const handleRecordCashEntry = async (input: RecordCajaEntryInput): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await recordCajaCashEntry(input);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo guardar el movimiento.');
    }
    setErrorMsg(null);
    setMsg(result.message ?? null);
    await refresh();
    return FORM_SUBMIT_OK;
  };

  const handleUpdateCashEntry = async (
    entryId: string,
    input: UpdateCajaCashEntryInput,
  ): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await updateCajaCashEntry(entryId, input);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo actualizar el movimiento.');
    }
    setErrorMsg(null);
    setMsg(result.message ?? null);
    await refresh();
    return FORM_SUBMIT_OK;
  };

  const handleConfirmDeleteCashEntry = async () => {
    if (!deleteCashTarget) return;
    const target = deleteCashTarget;
    setDeletingCashEntryId(target.id);
    setErrorMsg(null);
    setMsg(null);
    try {
      const result = await deleteCajaCashEntry(target.id);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo eliminar el movimiento.');
        setDeleteCashTarget(null);
        return;
      }
      setDeleteCashTarget(null);
      setMsg(result.message ?? null);
      await refresh();
    } finally {
      setDeletingCashEntryId(null);
    }
  };

  const handleSaveCoupon = async (payload: CouponPayloadData): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await saveCajaCoupon(payload);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo guardar el código.');
    }
    setErrorMsg(null);
    setMsg(result.message ?? null);
    await refresh();
    return FORM_SUBMIT_OK;
  };

  const handleToggleCouponActive = async (coupon: Coupon, nextActive: boolean) => {
    setTogglingCouponId(coupon.id);
    setErrorMsg(null);
    setMsg(null);
    try {
      const result = await toggleCajaCouponActive(coupon, nextActive);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo actualizar el estado del código.');
        return;
      }
      setMsg(result.message ?? null);
      await refresh();
    } finally {
      setTogglingCouponId(null);
    }
  };

  const handleConfirmDeleteCoupon = async () => {
    if (!deleteCouponTarget) return;
    const target = deleteCouponTarget;
    setDeletingCouponId(target.id);
    setErrorMsg(null);
    setMsg(null);
    try {
      const result = await deleteCajaCoupon(target.id, target.code);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo eliminar el código.');
        setDeleteCouponTarget(null);
        return;
      }
      setDeleteCouponTarget(null);
      setMsg(result.message ?? null);
      await refresh();
    } finally {
      setDeletingCouponId(null);
    }
  };

  const handleSaveCommissionRate = async (
    staffMember: StaffMember,
    nextPercent: number,
  ): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await updateCajaStaffCommission(staffMember, nextPercent);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo actualizar la comisión.');
    }
    setErrorMsg(null);
    setMsg(result.message ?? null);
    await refresh();
    return FORM_SUBMIT_OK;
  };

  const handleSaveCajaConfig = async (next: CajaConfig): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await saveCajaConfig(next);
    if (!result.ok) return formSubmitError(result.error);
    setErrorMsg(null);
    setMsg(result.message);
    await refresh();
    return FORM_SUBMIT_OK;
  };

  const handleOpenCommissionEditor = (row: CommissionStaffRow) => {
    if (!canManageCaja) return;
    setEditingCommissionStaffId(row.id);
  };

  const handleOpenPayoutDraft = (row: CommissionStaffRow) => {
    if (!canManageCaja || row.totalPayout <= 0) return;
    setPayoutDraft(buildCommissionPayoutDraft(row, cajaPeriod, activeCustom, data.serverTodayKey));
  };

  const handleSavePackage = async (input: SaveCajaPackageInput): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await saveCajaPackage(input);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo guardar el paquete de sesiones.');
    }
    setErrorMsg(null);
    reloadPackages();
    setMsg(result.message ?? null);
    return FORM_SUBMIT_OK;
  };

  const handleTogglePackage = async (pkg: ServicePackageCatalogRow, nextActive: boolean) => {
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
    <VStack gap={5} className="ad-page">
      <PageHeader
        title="Caja"
        className="ad-caja-head"
        subtitle="Cobros, gastos, corte del día, comisiones y promociones."
        actions={
          canManageCaja ? (
            <>
              <Button
                type="button"
                label="Registrar movimiento"
                variant="primary"
                size="sm"
                className="ad-caja-touch-btn ad-caja-primary-action"
                icon={<Plus size={15} aria-hidden="true" />}
                onClick={() => setMovementOpen(true)}
              />
              <Button
                type="button"
                label="Corte de caja"
                variant="secondary"
                size="sm"
                className="ad-caja-touch-btn ad-caja-secondary-action"
                icon={<Calculator size={15} aria-hidden="true" />}
                onClick={() => setCloseOpen(true)}
              />
              <IconButton
                type="button"
                label="Personalizar caja"
                tooltip="Personalizar caja"
                variant="ghost"
                size="md"
                icon={<SlidersHorizontal size={16} aria-hidden="true" />}
                onClick={() => setSettingsOpen(true)}
              />
              <IconButton
                type="button"
                label="Exportar a Excel (CSV)"
                tooltip="Exportar a Excel"
                variant="ghost"
                size="md"
                icon={<Download size={16} aria-hidden="true" />}
                isLoading={exportingCsv}
                isDisabled={exportingCsv}
                onClick={() => void handleExportCsv()}
              />
            </>
          ) : undefined
        }
      />

      {msg ? (
        <Banner status="success" role="status" title={msg} isDismissable onDismiss={() => setMsg(null)} />
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
        value={effectiveActiveTab}
        onChange={(v) => {
          setActiveTab(v as CajaTab);
          if (v !== 'summary') setHighlightUncollected(false);
        }}
        hasDivider
      >
        <Tab
          value="summary"
          label={uncollectedBookings.length > 0 ? `Resumen (${uncollectedBookings.length})` : 'Resumen'}
        />
        <Tab
          value="deposits"
          label={pendingDeposits.length > 0 ? `Anticipos (${pendingDeposits.length})` : 'Anticipos'}
        />
        <Tab value="commissions" label="Comisiones" />
        {canManageCaja ? <Tab value="promos" label="Promos" /> : null}
      </TabList>

      {effectiveActiveTab === 'summary' ? (
        <CajaSummaryTab
          filteredCashEntries={filteredCashEntries}
          periodSummary={periodSummary}
          periodLabel={activePeriodText}
          commissionsByStaff={commissionsByStaff}
          uncollectedBookings={uncollectedBookings}
          uncollectedTotalCents={uncollectedTotalCents}
          pendingDepositsCount={pendingDeposits.length}
          pendingDepositsTotalCents={pendingDepositsTotalCents}
          splitDetails={filteredSplitDetails}
          cajaPeriod={cajaPeriod}
          customRange={customRange}
          methodFilter={methodFilter}
          searchQuery={searchQuery}
          hasActiveFilters={hasActiveFilters}
          tz={tz}
          currency={currency}
          canRecordCash={canManageCaja}
          isSpecialistView={isSpecialistView}
          deletingEntryId={deletingCashEntryId}
          highlightUncollected={highlightUncollected}
          onChangePeriod={setCajaPeriod}
          onChangeCustomRange={setCustomRange}
          onToggleMethodFilter={toggleMethodFilter}
          onChangeSearchQuery={setSearchQuery}
          onResetFilters={resetSalesFilters}
          onOpenDeposits={() => setActiveTab('deposits')}
          onOpenCommissions={() => setActiveTab('commissions')}
          onEditCashEntry={setEditingCashEntry}
          onRequestDeleteCashEntry={setDeleteCashTarget}
          onRegisterPayout={handleOpenPayoutDraft}
        />
      ) : effectiveActiveTab === 'deposits' ? (
        <CajaDepositsTab
          pendingDeposits={pendingDeposits}
          defaultDepositLabel={defaultDepositLabel}
          tz={tz}
          currency={currency}
          approvingId={approvingId}
          rejectingId={rejectingId}
          onApproveDeposit={handleApproveDeposit}
          onRejectDeposit={handleRejectDeposit}
        />
      ) : effectiveActiveTab === 'commissions' ? (
        <CajaCommissionsTab
          commissionsByStaff={commissionsByStaff}
          splitSummaryByMethod={splitSummaryByMethod}
          currency={currency}
          commissionPeriod={cajaPeriod}
          periodLabel={activePeriodText}
          canManageCommissions={canManageCaja}
          isSpecialistView={isSpecialistView}
          onChangeCommissionPeriod={setCajaPeriod}
          onEditCommissionRate={handleOpenCommissionEditor}
          onRegisterPayout={handleOpenPayoutDraft}
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
          tz={tz}
          todayKey={data.serverTodayKey}
          nowMs={nowMs}
          canManagePackages={canManageCaja}
          togglingCouponId={togglingCouponId}
          deletingCouponId={deletingCouponId}
          togglingPkgId={togglingPkgId}
          onSaveCoupon={handleSaveCoupon}
          onToggleCouponActive={handleToggleCouponActive}
          onRequestDeleteCoupon={setDeleteCouponTarget}
          onSavePackage={handleSavePackage}
          onTogglePackage={handleTogglePackage}
        />
      )}

      {canManageCaja && movementOpen ? (
        <CashMovementDialog
          isOpen
          onOpenChange={setMovementOpen}
          inventory={data.inventory}
          staff={data.staff}
          currency={currency}
          expenseCategories={cajaConfig.expenseCategories}
          retailCommissionPercent={cajaConfig.retailCommissionPercent}
          recentEntries={data.cashEntries}
          onRecordCashEntry={handleRecordCashEntry}
        />
      ) : null}

      {canManageCaja && closeOpen ? (
        <CashCloseDialog
          onOpenChange={setCloseOpen}
          salonName={data.settings.name}
          cashEntries={data.cashEntries}
          todayKey={data.serverTodayKey}
          tz={tz}
          currency={currency}
          config={cajaConfig}
          todaySummary={todaySummary}
          todayStaffRows={todayCommissionsByStaff}
          uncollectedCount={uncollectedBookings.length}
          uncollectedTotalCents={uncollectedTotalCents}
          pendingDepositsCount={pendingDeposits.length}
          pendingDepositsTotalCents={pendingDepositsTotalCents}
          canRecordAdjustment={canManageCaja}
          onRecordCashEntry={handleRecordCashEntry}
        />
      ) : null}

      {canManageCaja && settingsOpen ? (
        <CajaSettingsDialog
          config={cajaConfig}
          currency={currency}
          onOpenChange={setSettingsOpen}
          onSave={handleSaveCajaConfig}
        />
      ) : null}

      {canManageCaja && editingCommissionMember ? (
        <CommissionRateDialog
          staffMember={editingCommissionMember}
          staffRow={editingCommissionRow}
          retailCommissionPercent={cajaConfig.retailCommissionPercent}
          periodLabel={activePeriodText}
          currency={currency}
          onOpenChange={(open) => {
            if (!open) setEditingCommissionStaffId(null);
          }}
          onSaveCommission={handleSaveCommissionRate}
        />
      ) : null}

      {canManageCaja && payoutDraft ? (
        <CommissionPayoutDialog
          draft={payoutDraft}
          currency={currency}
          onOpenChange={(open) => {
            if (!open) setPayoutDraft(null);
          }}
          onRecordCashEntry={handleRecordCashEntry}
        />
      ) : null}

      {canManageCaja && editingCashEntry ? (
        <ManualCashEditDialog
          entry={editingCashEntry}
          staff={data.staff}
          currency={currency}
          tz={tz}
          expenseCategories={cajaConfig.expenseCategories}
          onOpenChange={(open) => {
            if (!open) setEditingCashEntry(null);
          }}
          onRequestDelete={(entry) => {
            setEditingCashEntry(null);
            setDeleteCashTarget(entry);
          }}
          onUpdateEntry={handleUpdateCashEntry}
        />
      ) : null}

      {rejectConfirmTarget ? (
        <ConfirmActionDialog
          isOpen={Boolean(rejectConfirmTarget)}
          onOpenChange={(open) => {
            if (!open && !rejectingId) {
              setRejectConfirmTarget(null);
              settlePendingReject(false);
            }
          }}
          title="¿Rechazar este comprobante?"
          description={`Le avisaremos a la clienta de la cita ${rejectConfirmTarget.bookingCode} que no pudimos validar el recibo para que suba uno nuevo. Su horario seguirá apartado mientras tanto.`}
          confirmLabel="Sí, rechazar"
          cancelLabel="Volver"
          variant="destructive"
          isLoading={rejectingId === rejectConfirmTarget.bookingId}
          onConfirm={() => void handleConfirmRejectDeposit()}
        />
      ) : null}

      {deleteCashTarget ? (
        <ConfirmActionDialog
          isOpen={Boolean(deleteCashTarget)}
          onOpenChange={(open) => {
            if (!open && !deletingCashEntryId) {
              setDeleteCashTarget(null);
            }
          }}
          title="¿Eliminar este movimiento?"
          description={`Se eliminará "${deleteCashTarget.description}" (${formatCurrency(Math.abs(deleteCashTarget.amountCents), currency)}) del historial y del corte de caja. No se puede deshacer.`}
          confirmLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          variant="destructive"
          isLoading={deletingCashEntryId === deleteCashTarget.id}
          onConfirm={() => void handleConfirmDeleteCashEntry()}
        />
      ) : null}

      {deleteCouponTarget ? (
        <ConfirmActionDialog
          isOpen={Boolean(deleteCouponTarget)}
          onOpenChange={(open) => {
            if (!open && !deletingCouponId) {
              setDeleteCouponTarget(null);
            }
          }}
          title={
            deleteCouponTarget.kind === 'gift_card'
              ? '¿Eliminar esta tarjeta de regalo?'
              : '¿Eliminar este cupón?'
          }
          description={`El código ${deleteCouponTarget.code} dejará de aceptarse en nuevas reservas. Las citas pasadas que ya lo aplicaron conservarán su historial y descuento registrado.`}
          confirmLabel="Sí, eliminar"
          cancelLabel="Cancelar"
          variant="destructive"
          isLoading={deletingCouponId === deleteCouponTarget.id}
          onConfirm={() => void handleConfirmDeleteCoupon()}
        />
      ) : null}

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
