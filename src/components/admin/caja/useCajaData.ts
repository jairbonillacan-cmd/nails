'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { formatCurrency } from '@/lib/format';
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

export function useCajaData(
  providerData: AdminOverviewPayload | null,
  tabParam: string | null,
) {
  const initialRoute = resolveInitialCajaRoute(tabParam);
  const [activeTab, setActiveTab] = useState<CajaTab>(initialRoute.tab);
  const [highlightUncollected, setHighlightUncollected] = useState<boolean>(
    initialRoute.highlightUncollected,
  );
  const [promosView, setPromosView] = useState<PromosSubTab>(initialRoute.promosView);
  const [cajaPeriod, setCajaPeriod] = useState<CajaPeriod>('all');
  const [methodFilter, setMethodFilter] = useState<CajaMethodFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [packagesSeq, setPackagesSeq] = useState(0);
  const lastTabParamRef = useRef<string | null>(tabParam);

  useExternalSync(`caja-tab|${tabParam ?? ''}`, async (signal) => {
    if (signal.aborted || lastTabParamRef.current === tabParam) return;
    lastTabParamRef.current = tabParam;
    const next = resolveInitialCajaRoute(tabParam);
    setActiveTab(next.tab);
    setHighlightUncollected(next.highlightUncollected);
    setPromosView(next.promosView);
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
    () => buildSplitSummaryByMethod(data, cajaPeriod),
    [data, cajaPeriod],
  );
  const splitDetails = useMemo(() => buildSplitDetails(data), [data]);
  const commissionsByStaff = useMemo(
    () => buildCommissionsByStaff(data, cajaPeriod),
    [data, cajaPeriod],
  );

  const periodCashEntries = useMemo(
    () =>
      data
        ? filterCashEntries(data.cashEntries, {
            period: cajaPeriod,
            method: 'all',
            query: searchQuery,
            todayKey,
            tz,
            bookingLookup,
          })
        : [],
    [data, cajaPeriod, searchQuery, todayKey, tz, bookingLookup],
  );

  const filteredCashEntries = useMemo(
    () =>
      data
        ? filterCashEntries(data.cashEntries, {
            period: cajaPeriod,
            method: methodFilter,
            query: searchQuery,
            todayKey,
            tz,
            bookingLookup,
          })
        : [],
    [data, cajaPeriod, methodFilter, searchQuery, todayKey, tz, bookingLookup],
  );

  const filteredSplitDetails = useMemo(
    () =>
      data
        ? filterSplitDetails(splitDetails, {
            period: cajaPeriod,
            method: methodFilter,
            query: searchQuery,
            todayKey,
            tz,
          })
        : [],
    [data, splitDetails, cajaPeriod, methodFilter, searchQuery, todayKey, tz],
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

  const resetSalesFilters = useCallback(() => {
    setCajaPeriod('all');
    setMethodFilter('all');
    setSearchQuery('');
  }, []);

  const pendingDepositsTotalCents = pendingDeposits.reduce(
    (sum, item) => sum + item.depositAmountCents,
    0,
  );
  const uncollectedTotalCents = uncollectedBookings.reduce(
    (sum, item) => sum + item.remainingCents,
    0,
  );

  const activePeriodText = cajaPeriodLabel(cajaPeriod);
  const isFilteredByMethodOrSearch = methodFilter !== 'all' || searchQuery.trim().length > 0;
  const activeSummary = isFilteredByMethodOrSearch ? filteredSummary : periodSummary;

  const kpiItems: MetricTileItem[] = data
    ? [
        {
          id: 'collected',
          label: `Cobrado · ${activePeriodText}`,
          value: formatCurrency(activeSummary.collectedCents, data.settings.currency),
          sub:
            activeSummary.ticketCount > 0
              ? `Neto ${formatCurrency(activeSummary.netCents, data.settings.currency)} · Ticket prom. ${formatCurrency(activeSummary.averageTicketCents, data.settings.currency)}`
              : `Neto ${formatCurrency(activeSummary.netCents, data.settings.currency)} · Gastos ${formatCurrency(activeSummary.expensesCents, data.settings.currency)}`,
        },
        {
          id: 'pending',
          label: 'Por cobrar',
          value: formatCurrency(
            uncollectedTotalCents + pendingDepositsTotalCents,
            data.settings.currency,
          ),
          sub: `${uncollectedBookings.length} sin cobrar · ${pendingDeposits.length} ${pendingDeposits.length === 1 ? 'anticipo' : 'anticipos'}`,
          tone:
            uncollectedTotalCents + pendingDepositsTotalCents > 0 ? 'warning' : 'success',
        },
        {
          id: 'tips',
          label: `Propinas · ${activePeriodText}`,
          value: formatCurrency(activeSummary.tipsCents, data.settings.currency),
          sub:
            activeSummary.expensesCents > 0
              ? `Para profesionales · Gastos ${formatCurrency(activeSummary.expensesCents, data.settings.currency)}`
              : 'Para tus profesionales',
        },
      ]
    : [];

  return {
    data,
    activeTab,
    setActiveTab,
    highlightUncollected,
    setHighlightUncollected,
    promosView,
    setPromosView,
    cajaPeriod,
    setCajaPeriod,
    methodFilter,
    setMethodFilter,
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
  };
}
