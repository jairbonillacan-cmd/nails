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

  const pendingDeposits = useMemo<PendingDepositRow[]>(
    () => (data ? data.pendingDeposits : []),
    [data],
  );
  const uncollectedBookings = useMemo<UncollectedBookingRow[]>(
    () => (data ? data.uncollectedBookings : []),
    [data],
  );
  const splitSummaryByMethod = useMemo(() => buildSplitSummaryByMethod(data), [data]);
  const splitDetails = useMemo(() => buildSplitDetails(data), [data]);
  const commissionsByStaff = useMemo(() => buildCommissionsByStaff(data), [data]);

  const reloadPackages = useCallback(() => {
    setPackagesSeq((prev) => prev + 1);
  }, []);

  const pendingDepositsTotalCents = pendingDeposits.reduce(
    (sum, item) => sum + item.depositAmountCents,
    0,
  );
  const uncollectedTotalCents = uncollectedBookings.reduce(
    (sum, item) => sum + item.remainingCents,
    0,
  );
  const kpiItems: MetricTileItem[] = data
    ? [
        {
          id: 'collected',
          label: 'Cobrado',
          value: formatCurrency(data.kpis.totalRevenueCents, data.settings.currency),
          sub: `Neto ${formatCurrency(data.kpis.netCashCents, data.settings.currency)} · Gastos ${formatCurrency(data.kpis.totalExpensesCents, data.settings.currency)}`,
          interactive: true,
        },
        {
          id: 'pending',
          label: 'Por cobrar',
          value: formatCurrency(
            uncollectedTotalCents + pendingDepositsTotalCents,
            data.settings.currency,
          ),
          sub: `${uncollectedBookings.length} sin cobrar · ${pendingDeposits.length} anticipos`,
          tone:
            uncollectedTotalCents + pendingDepositsTotalCents > 0 ? 'warning' : 'success',
          interactive: true,
        },
        {
          id: 'tips',
          label: 'Propinas',
          value: formatCurrency(data.kpis.totalTipsCents, data.settings.currency),
          sub: 'Para tus profesionales',
          interactive: true,
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
  };
}
