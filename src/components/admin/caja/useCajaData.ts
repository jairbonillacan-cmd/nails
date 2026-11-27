'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { CajaLinkParams } from '@/lib/admin-links';
import { resolveCajaConfig } from '@/lib/caja/caja-config';
import { formatCurrency } from '@/lib/format';
import { selectReceivablesSummary } from '@/lib/metrics';
import type { MetricTileItem } from '@/components/ui';
import {
  buildCommissionsByStaff,
  buildSplitDetails,
  buildSplitSummaryByMethod,
} from './cajaActions';
import {
  cajaPeriodLabel,
  computeCajaPeriodSummary,
  filterCashEntries,
  filterSplitDetails,
  type CajaBookingSearchMeta,
  type CajaCustomRange,
  type CajaMethodFilter,
  type CajaPeriod,
} from './cajaMetrics';
import {
  resolveInitialCajaRoute,
  type CajaTab,
  type PendingDepositRow,
  type PromosSubTab,
  type ServicePackageCatalogRow,
  type UncollectedBookingRow,
} from './cajaTypes';

const EMPTY_CUSTOM_RANGE: CajaCustomRange = { fromKey: '', toKey: '' };

export function useCajaData(
  providerData: AdminOverviewPayload | null,
  urlParams: CajaLinkParams,
) {
  const initialRoute = resolveInitialCajaRoute(urlParams.tab ?? null, urlParams.sub ?? null);
  const [activeTab, setActiveTab] = useState<CajaTab>(initialRoute.tab);
  const [highlightUncollected, setHighlightUncollected] = useState<boolean>(
    initialRoute.highlightUncollected,
  );
  const [promosView, setPromosView] = useState<PromosSubTab>(initialRoute.promosView);
  const [periodChoice, setPeriodChoice] = useState<CajaPeriod | null>(
    () => urlParams.period ?? null,
  );
  const [customRange, setCustomRange] = useState<CajaCustomRange>(() =>
    urlParams.from || urlParams.to
      ? { fromKey: urlParams.from ?? '', toKey: urlParams.to ?? '' }
      : EMPTY_CUSTOM_RANGE,
  );
  const [methodFilter, setMethodFilter] = useState<CajaMethodFilter>(
    () => urlParams.method ?? 'all',
  );
  const [searchQuery, setSearchQuery] = useState(() => urlParams.q ?? '');
  const [packagesSeq, setPackagesSeq] = useState(0);
  const routeKey = [
    urlParams.tab ?? '',
    urlParams.sub ?? '',
    urlParams.period ?? '',
    urlParams.from ?? '',
    urlParams.to ?? '',
    urlParams.method ?? '',
    urlParams.q ?? '',
  ].join('|');
  const lastRouteKeyRef = useRef<string>(routeKey);

  useExternalSync(`caja-tab|${routeKey}`, async (signal) => {
    if (signal.aborted || lastRouteKeyRef.current === routeKey) return;
    lastRouteKeyRef.current = routeKey;
    const next = resolveInitialCajaRoute(urlParams.tab ?? null, urlParams.sub ?? null);
    setActiveTab(next.tab);
    setHighlightUncollected(next.highlightUncollected);
    setPromosView(next.promosView);
    if (urlParams.period) setPeriodChoice(urlParams.period);
    if (urlParams.from || urlParams.to) {
      setCustomRange({ fromKey: urlParams.from ?? '', toKey: urlParams.to ?? '' });
    }
    if (urlParams.method) setMethodFilter(urlParams.method);
    if (urlParams.q !== undefined) setSearchQuery(urlParams.q);
  });

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

  const overviewQuery = useAdminCachedQuery<AdminOverviewPayload>(
    providerData ? ADMIN_CACHE_KEYS.overview : null,
    fetchOverview,
    {
      enabled: Boolean(providerData),
      initialData: providerData ?? undefined,
      staleTimeMs: 10_000,
    },
  );

  const shouldLoadPackages = Boolean(providerData) && activeTab === 'promos';
  const packagesQuery = useAdminCachedQuery<{
    servicePackages?: ServicePackageCatalogRow[];
  }>(providerData ? ADMIN_CACHE_KEYS.packages : null, fetchPackages, {
    enabled: shouldLoadPackages,
    staleTimeMs: 10_000,
    revalidateKey: packagesSeq,
  });

  const data = overviewQuery.data ?? providerData;
  const packagesCatalog = packagesQuery.data?.servicePackages ?? [];
  const packagesLoading = packagesQuery.isLoading;

  const cajaConfig = useMemo(
    () => resolveCajaConfig(data?.settings.landingContent),
    [data?.settings.landingContent],
  );
  const cajaPeriod: CajaPeriod = periodChoice ?? cajaConfig.defaultPeriod;
  const activeCustom = cajaPeriod === 'custom' ? customRange : null;

  const tz = data?.settings.timezone || 'America/Mexico_City';
  const todayKey = data?.serverTodayKey ?? '';

  const pendingDeposits = useMemo<PendingDepositRow[]>(
    () => (data ? data.pendingDeposits : []),
    [data],
  );
  const uncollectedBookings = useMemo<UncollectedBookingRow[]>(
    () => (data ? data.uncollectedBookings : []),
    [data],
  );

  const bookingLookup = useMemo(() => {
    const map = new Map<string, CajaBookingSearchMeta>();
    if (!data) return map;
    for (const bk of data.bookings) {
      map.set(bk.id, {
        bookingCode: bk.bookingCode,
        clientName: bk.client.fullName,
        staffName: bk.staff.name,
      });
    }
    return map;
  }, [data]);

  const splitSummaryByMethod = useMemo(
    () => buildSplitSummaryByMethod(data, cajaPeriod, activeCustom),
    [data, cajaPeriod, activeCustom],
  );
  const splitDetails = useMemo(() => buildSplitDetails(data), [data]);
  const commissionsByStaff = useMemo(
    () =>
      buildCommissionsByStaff(
        data,
        cajaPeriod,
        activeCustom,
        cajaConfig.retailCommissionPercent,
      ),
    [data, cajaPeriod, activeCustom, cajaConfig.retailCommissionPercent],
  );
  const todayCommissionsByStaff = useMemo(
    () => buildCommissionsByStaff(data, 'today', null, cajaConfig.retailCommissionPercent),
    [data, cajaConfig.retailCommissionPercent],
  );

  const scope = useMemo(
    () => ({ period: cajaPeriod, custom: activeCustom, todayKey, tz }),
    [cajaPeriod, activeCustom, todayKey, tz],
  );

  const periodCashEntries = useMemo(
    () =>
      data
        ? filterCashEntries(data.cashEntries, {
            ...scope,
            method: 'all',
            query: searchQuery,
            bookingLookup,
          })
        : [],
    [data, scope, searchQuery, bookingLookup],
  );

  const filteredCashEntries = useMemo(
    () =>
      data
        ? filterCashEntries(data.cashEntries, {
            ...scope,
            method: methodFilter,
            query: searchQuery,
            bookingLookup,
          })
        : [],
    [data, scope, methodFilter, searchQuery, bookingLookup],
  );

  const filteredSplitDetails = useMemo(
    () =>
      data
        ? filterSplitDetails(splitDetails, { ...scope, method: methodFilter, query: searchQuery })
        : [],
    [data, splitDetails, scope, methodFilter, searchQuery],
  );

  const periodSummary = useMemo(
    () => computeCajaPeriodSummary(periodCashEntries),
    [periodCashEntries],
  );

  const filteredSummary = useMemo(
    () => computeCajaPeriodSummary(filteredCashEntries),
    [filteredCashEntries],
  );

  const todaySummary = useMemo(
    () =>
      data
        ? computeCajaPeriodSummary(
            filterCashEntries(data.cashEntries, {
              period: 'today',
              method: 'all',
              query: '',
              todayKey,
              tz,
            }),
          )
        : computeCajaPeriodSummary([]),
    [data, todayKey, tz],
  );

  const reloadPackages = useCallback(() => {
    setPackagesSeq((prev) => prev + 1);
  }, []);

  const setCajaPeriod = useCallback((next: CajaPeriod) => {
    setPeriodChoice(next);
  }, []);

  const toggleMethodFilter = useCallback((next: CajaMethodFilter) => {
    setMethodFilter((current) => (current === next ? 'all' : next));
  }, []);

  const resetSalesFilters = useCallback(() => {
    setPeriodChoice(null);
    setCustomRange(EMPTY_CUSTOM_RANGE);
    setMethodFilter('all');
    setSearchQuery('');
  }, []);

  const receivables = useMemo(
    () =>
      selectReceivablesSummary({
        uncollectedBookings,
        pendingDeposits,
      }),
    [uncollectedBookings, pendingDeposits],
  );
  const pendingDepositsTotalCents = receivables.pendingDepositsTotalCents;
  const depositsAwaitingReviewCount = receivables.awaitingReviewCount;
  const depositsMissingProofCount = receivables.missingProofCount;
  const uncollectedTotalCents = receivables.uncollectedTotalCents;

  const activePeriodText = cajaPeriodLabel(cajaPeriod, activeCustom, todayKey);
  const isFilteredByMethodOrSearch = methodFilter !== 'all' || searchQuery.trim().length > 0;
  const activeSummary = isFilteredByMethodOrSearch ? filteredSummary : periodSummary;
  const currency = data?.settings.currency ?? 'MXN';

  const kpiItems: MetricTileItem[] = data
    ? [
        {
          id: 'collected',
          label: `Cobrado · ${activePeriodText}`,
          value: formatCurrency(activeSummary.collectedCents, currency),
          sub:
            activeSummary.ticketCount > 0
              ? `Neto ${formatCurrency(activeSummary.netCents, currency)} · Ticket prom. ${formatCurrency(activeSummary.averageTicketCents, currency)}`
              : `Neto ${formatCurrency(activeSummary.netCents, currency)} · Gastos ${formatCurrency(activeSummary.expensesCents, currency)}`,
        },
        {
          id: 'pending',
          label: 'Por cobrar',
          value: formatCurrency(uncollectedTotalCents, currency),
          sub:
            uncollectedBookings.length > 0
              ? `${uncollectedBookings.length} cita${uncollectedBookings.length === 1 ? '' : 's'} terminada${uncollectedBookings.length === 1 ? '' : 's'} o pasada${uncollectedBookings.length === 1 ? '' : 's'}`
              : 'Todo cobrado',
          tone: uncollectedTotalCents > 0 ? 'warning' : 'success',
        },
        {
          id: 'deposits',
          label: 'Anticipos pendientes',
          value: formatCurrency(pendingDepositsTotalCents, currency),
          sub: receivables.depositsBreakdownLabel,
          tone: pendingDeposits.length > 0 ? 'warning' : 'success',
        },
        {
          id: 'tips',
          label: `Propinas · ${activePeriodText}`,
          value: formatCurrency(activeSummary.tipsCents, currency),
          sub:
            activeSummary.expensesCents > 0
              ? `Para profesionales · Gastos ${formatCurrency(activeSummary.expensesCents, currency)}`
              : 'Para tus profesionales',
        },
      ]
    : [];

  return {
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
    setMethodFilter,
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
    depositsAwaitingReviewCount,
    depositsMissingProofCount,
    uncollectedTotalCents,
    kpiItems,
    periodSummary,
    todaySummary,
    filteredCashEntries,
    filteredSplitDetails,
    splitSummaryByMethod,
    commissionsByStaff,
    todayCommissionsByStaff,
  };
}
