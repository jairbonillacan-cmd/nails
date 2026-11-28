'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
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
  exportCajaCsv,
  recordCajaCashEntry,
  rejectCajaDeposit,
  saveCajaConfig,
  updateCajaCashEntry,
  updateCajaStaffCommission,
  type RecordCajaEntryInput,
  type UpdateCajaCashEntryInput,
} from '@/components/admin/caja/cajaActions';
import {
  buildCommissionPayoutDraft,
  type CajaPeriod,
  type CommissionPayoutDraft,
} from '@/components/admin/caja/cajaMetrics';
import { useCajaData } from '@/components/admin/caja/useCajaData';
import {
  resolveLegacyCajaFidelizacionHref,
  type CommissionStaffRow,
} from '@/components/admin/caja/cajaTypes';
import {
  ConfirmActionDialog,
  MetricGrid,
  PageHeader,
  PageSkeleton,
  SkeletonBlock,
} from '@/components/ui';
import { cajaHref, parseCajaParams, type CajaLinkParams } from '@/lib/admin-links';
import { formatCurrency } from '@/lib/format';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { roleCanAccess } from '@/lib/rbac';
import type { CajaConfig, CashRegisterEntry, StaffMember } from '@/lib/types';
import { FORM_SUBMIT_OK, formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';

type ActiveCajaTab = 'summary' | 'deposits' | 'commissions';

function cajaTabToParam(tab: ActiveCajaTab): CajaLinkParams['tab'] {
  if (tab === 'deposits') return 'anticipos';
  if (tab === 'commissions') return 'comisiones';
  return undefined;
}

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

const CashMovementDialog = dynamic(
  () => import('@/components/admin/caja/CashMovementForm').then((mod) => mod.CashMovementDialog),
  { ssr: false },
);

const CommissionPayoutDialog = dynamic(
  () =>
    import('@/components/admin/caja/CommissionPayoutDialog').then(
      (mod) => mod.CommissionPayoutDialog,
    ),
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const parsedParams = parseCajaParams(searchParams);
  const legacyFidelizacionHref = resolveLegacyCajaFidelizacionHref(parsedParams);

  useExternalSync(
    legacyFidelizacionHref ? `caja-legacy-redirect|${legacyFidelizacionHref}` : 'caja-redirect-idle',
    async (signal) => {
      if (signal.aborted || !legacyFidelizacionHref) return;
      router.replace(legacyFidelizacionHref, { scroll: false });
    },
  );

  const {
    data,
    cajaConfig,
    activeTab,
    setActiveTab,
    highlightUncollected,
    setHighlightUncollected,
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
    pendingDeposits,
    uncollectedBookings,
    pendingDepositsTotalCents,
    depositsAwaitingReviewCount,
    depositsMissingProofCount,
    uncollectedTotalCents,
    kpiItems,
    periodSummary,
    todaySummary,
    filteredCashEntries,
    filteredSplitDetails,
    bookingLookup,
    splitSummaryByMethod,
    commissionsByStaff,
    todayCommissionsByStaff,
  } = useCajaData(providerData, parsedParams);

  const urlQuickSaleId = parsedParams.quickSaleProductId ?? null;
  const urlStaffId = parsedParams.staff ?? null;
  const [lastUrlQuickSaleId, setLastUrlQuickSaleId] = useState<string | null>(urlQuickSaleId);
  const [quickSaleProductId, setQuickSaleProductId] = useState<string | null>(urlQuickSaleId);
  const [lastUrlStaffId, setLastUrlStaffId] = useState<string | null>(urlStaffId);
  const [focusedCommissionStaffId, setFocusedCommissionStaffId] = useState<string | null>(
    urlStaffId,
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectConfirmTarget, setRejectConfirmTarget] = useState<{
    bookingId: string;
    bookingCode: string;
  } | null>(null);
  const rejectResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [editingCashEntry, setEditingCashEntry] = useState<CashRegisterEntry | null>(null);
  const [deleteCashTarget, setDeleteCashTarget] = useState<CashRegisterEntry | null>(null);
  const [deletingCashEntryId, setDeletingCashEntryId] = useState<string | null>(null);
  const [editingCommissionStaffId, setEditingCommissionStaffId] = useState<string | null>(null);
  const [payoutDraft, setPayoutDraft] = useState<CommissionPayoutDraft | null>(null);
  const [movementOpen, setMovementOpen] = useState(() => Boolean(urlQuickSaleId));
  const [closeOpen, setCloseOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [csvPinOpen, setCsvPinOpen] = useState(false);
  const [csvPinError, setCsvPinError] = useState<string | null>(null);

  if (urlQuickSaleId !== lastUrlQuickSaleId) {
    setLastUrlQuickSaleId(urlQuickSaleId);
    if (urlQuickSaleId) {
      setQuickSaleProductId(urlQuickSaleId);
      setMovementOpen(true);
    }
  }

  if (urlStaffId !== lastUrlStaffId) {
    setLastUrlStaffId(urlStaffId);
    setFocusedCommissionStaffId(urlStaffId);
  }

  if (legacyFidelizacionHref) {
    return <PageSkeleton kpiCount={4} withSplit ariaLabel="Redirigiendo a Fidelización" />;
  }

  if (!data) {
    return <PageSkeleton kpiCount={4} withSplit ariaLabel="Cargando caja" />;
  }

  const tz = data.settings.timezone || 'America/Mexico_City';
  const currency = data.settings.currency;
  const defaultDepositLabel = formatCurrency(data.settings.depositAmountCents ?? 20000, currency);
  const isSpecialistView = data.session.user.role === 'specialist';
  const canManageCaja = data.session.user.role === 'owner' || data.session.user.role === 'admin';
  const canViewClients = roleCanAccess(data.session.user.role, 'clients');

  const syncCajaUrl = (patch: Partial<CajaLinkParams>) => {
    const next: CajaLinkParams = {
      ...parsedParams,
      ...patch,
    };
    router.replace(cajaHref(next), { scroll: false });
  };

  const handleSelectTab = (nextTab: ActiveCajaTab) => {
    setActiveTab(nextTab);
    if (nextTab !== 'summary') setHighlightUncollected(false);
    syncCajaUrl({
      tab: cajaTabToParam(nextTab),
      sub: undefined,
    });
  };

  const handleChangePeriod = (nextPeriod: CajaPeriod) => {
    setCajaPeriod(nextPeriod);
    syncCajaUrl({
      period: nextPeriod === cajaConfig.defaultPeriod ? undefined : nextPeriod,
      ...(nextPeriod !== 'custom' ? { from: undefined, to: undefined } : {}),
    });
  };

  const handleResetFilters = () => {
    resetSalesFilters();
    syncCajaUrl({
      period: undefined,
      from: undefined,
      to: undefined,
      method: undefined,
      q: undefined,
    });
  };

  const clearQuickSaleUrlParam = () => {
    setQuickSaleProductId(null);
    if (parsedParams.quickSaleProductId) {
      const { quickSaleProductId: _removed, ...rest } = parsedParams;
      router.replace(cajaHref(rest), { scroll: false });
    }
  };

  const handleMovementOpenChange = (open: boolean) => {
    setMovementOpen(open);
    if (!open) {
      clearQuickSaleUrlParam();
    }
  };

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
    if (approvingId === bookingId) return false;
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

  const handleRejectDepositDirect = async (
    bookingId: string,
    bookingCode: string,
    reason?: string,
  ): Promise<boolean> => {
    if (rejectingId === bookingId) return false;
    setRejectingId(bookingId);
    setErrorMsg(null);
    setMsg(null);
    try {
      const result = await rejectCajaDeposit(data, bookingId, bookingCode, reason);
      if (!result.ok) {
        setErrorMsg(result.error ?? 'No se pudo rechazar el comprobante.');
        return false;
      }
      setMsg(result.message ?? null);
      void refresh();
      return true;
    } finally {
      setRejectingId(null);
    }
  };

  const handleConfirmRejectDeposit = async () => {
    if (!rejectConfirmTarget || rejectingId) return;
    const { bookingId, bookingCode } = rejectConfirmTarget;
    const ok = await handleRejectDepositDirect(bookingId, bookingCode);
    setRejectConfirmTarget(null);
    settlePendingReject(ok);
  };

  const handleRecordCashEntry = async (input: RecordCajaEntryInput): Promise<FormSubmitResult> => {
    setMsg(null);
    const result = await recordCajaCashEntry(input);
    if (!result.ok) {
      return formSubmitError(result.error ?? 'No se pudo guardar el movimiento.');
    }
    setErrorMsg(null);
    setMsg(result.message ?? null);
    clearQuickSaleUrlParam();
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
    if (!deleteCashTarget || deletingCashEntryId) return;
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

  const handleExportCsv = async (ownerPin?: string) => {
    if (exportingCsv) return;
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
        subtitle="Cobros, gastos, corte del día y comisiones."
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

      <MetricGrid ariaLabel="Resumen de caja" cols={4} items={kpiItems} />

      <TabList
        value={activeTab}
        onChange={(v) => {
          if (v === 'summary' || v === 'deposits' || v === 'commissions') {
            handleSelectTab(v);
          }
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
      </TabList>

      {activeTab === 'summary' ? (
        <CajaSummaryTab
          filteredCashEntries={filteredCashEntries}
          periodSummary={periodSummary}
          periodLabel={activePeriodText}
          commissionsByStaff={commissionsByStaff}
          uncollectedBookings={uncollectedBookings}
          uncollectedTotalCents={uncollectedTotalCents}
          pendingDepositsCount={pendingDeposits.length}
          pendingDepositsTotalCents={pendingDepositsTotalCents}
          depositsAwaitingReviewCount={depositsAwaitingReviewCount}
          depositsMissingProofCount={depositsMissingProofCount}
          splitDetails={filteredSplitDetails}
          bookingLookup={bookingLookup}
          cajaPeriod={cajaPeriod}
          customRange={customRange}
          methodFilter={methodFilter}
          searchQuery={searchQuery}
          hasActiveFilters={hasActiveFilters}
          tz={tz}
          currency={currency}
          canRecordCash={canManageCaja}
          canViewClients={canViewClients}
          isSpecialistView={isSpecialistView}
          deletingEntryId={deletingCashEntryId}
          highlightUncollected={highlightUncollected}
          onChangePeriod={handleChangePeriod}
          onChangeCustomRange={setCustomRange}
          onToggleMethodFilter={toggleMethodFilter}
          onChangeSearchQuery={setSearchQuery}
          onResetFilters={handleResetFilters}
          onOpenDeposits={() => handleSelectTab('deposits')}
          onOpenCommissions={() => handleSelectTab('commissions')}
          onEditCashEntry={setEditingCashEntry}
          onRequestDeleteCashEntry={setDeleteCashTarget}
          onRegisterPayout={handleOpenPayoutDraft}
        />
      ) : activeTab === 'deposits' ? (
        <CajaDepositsTab
          pendingDeposits={pendingDeposits}
          defaultDepositLabel={defaultDepositLabel}
          tz={tz}
          currency={currency}
          approvingId={approvingId}
          rejectingId={rejectingId}
          onApproveDeposit={handleApproveDeposit}
          onRejectDeposit={handleRejectDeposit}
          onRejectDepositDirect={handleRejectDepositDirect}
        />
      ) : (
        <CajaCommissionsTab
          commissionsByStaff={commissionsByStaff}
          splitSummaryByMethod={splitSummaryByMethod}
          currency={currency}
          commissionPeriod={cajaPeriod}
          periodLabel={activePeriodText}
          canManageCommissions={canManageCaja}
          isSpecialistView={isSpecialistView}
          focusedStaffId={focusedCommissionStaffId}
          onClearStaffFocus={() => {
            setFocusedCommissionStaffId(null);
            if (parsedParams.staff) {
              const { staff: _removed, ...rest } = parsedParams;
              router.replace(cajaHref(rest), { scroll: false });
            }
          }}
          onChangeCommissionPeriod={handleChangePeriod}
          onEditCommissionRate={handleOpenCommissionEditor}
          onRegisterPayout={handleOpenPayoutDraft}
        />
      )}

      {canManageCaja && movementOpen ? (
        <CashMovementDialog
          key={quickSaleProductId ?? 'manual'}
          isOpen
          onOpenChange={handleMovementOpenChange}
          inventory={data.inventory}
          staff={data.staff}
          currency={currency}
          expenseCategories={cajaConfig.expenseCategories}
          retailCommissionPercent={cajaConfig.retailCommissionPercent}
          recentEntries={data.cashEntries}
          initialProductId={quickSaleProductId}
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
