'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  useAdminCachedQuery,
} from '@/lib/hooks/useAdminCache';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { ClientProfile, ServicePackage } from '@/lib/types';
import type { MetricTileItem } from '@/components/ui';
import {
  buildLoyaltyByClientId,
  buildNoShowStatsByClient,
  buildReturningClients,
  buildVisitCountByClient,
  filterClientRows,
  groupClientsByLetter,
  groupPackagesByClientId,
} from './clientasActions';
import {
  resolveClientasTabParam,
  type CampaignsPayload,
  type ClientPackageRow,
  type ClientsTab,
  type InactiveClientRow,
} from './clientasTypes';

interface ClientsQueryPayload {
  clients: ClientProfile[];
  nearRewardClients: AdminOverviewPayload['nearRewardClients'];
}

interface PackagesQueryPayload {
  servicePackages?: ServicePackage[];
  clientPackages?: ClientPackageRow[];
}

interface InactiveClientsQueryPayload {
  inactiveDays?: number;
  clients?: InactiveClientRow[];
}

export function useClientasData(
  providerData: AdminOverviewPayload | null,
  bookingEventSeq: number,
  paramTab: string | null,
  paramQuery: string,
) {
  const [activeTab, setActiveTab] = useState<ClientsTab>(
    () => resolveClientasTabParam(paramTab) ?? 'directory',
  );
  const [query, setQuery] = useState<string>(() => paramQuery);
  const [onlyBirthdays, setOnlyBirthdays] = useState(false);
  const [inactiveDays, setInactiveDays] = useState<number>(21);
  const [campaignsSeq, setCampaignsSeq] = useState(0);
  const [packagesSeq, setPackagesSeq] = useState(0);
  const lastUrlKeyRef = useRef(`${paramTab ?? ''}|${paramQuery}`);

  const canManageClients = Boolean(
    providerData &&
      (providerData.session.user.role === 'owner' ||
        providerData.session.user.role === 'admin'),
  );

  useExternalSync(`clients-url|${paramTab ?? ''}|${paramQuery}`, async (signal) => {
    if (signal.aborted) return;
    const key = `${paramTab ?? ''}|${paramQuery}`;
    if (lastUrlKeyRef.current === key) return;
    lastUrlKeyRef.current = key;
    const nextTab = resolveClientasTabParam(paramTab);
    if (nextTab) setActiveTab(nextTab);
    if (paramQuery) setQuery(paramQuery);
  });

  const fetchClients = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<ClientsQueryPayload>(ADMIN_CACHE_KEYS.clients, signal),
    [],
  );
  const fetchPackages = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<PackagesQueryPayload>(ADMIN_CACHE_KEYS.packages, signal),
    [],
  );
  const fetchCampaigns = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<CampaignsPayload>(ADMIN_CACHE_KEYS.campaigns, signal),
    [],
  );
  const inactiveKey = ADMIN_CACHE_KEYS.clientsInactive(inactiveDays);
  const fetchInactive = useCallback(
    (signal: AbortSignal) =>
      fetchAdminJson<InactiveClientsQueryPayload>(inactiveKey, signal),
    [inactiveKey],
  );

  const clientsQuery = useAdminCachedQuery<ClientsQueryPayload>(
    canManageClients ? ADMIN_CACHE_KEYS.clients : null,
    fetchClients,
    {
      enabled: canManageClients,
      initialData: providerData
        ? {
            clients: providerData.clients,
            nearRewardClients: providerData.nearRewardClients,
          }
        : undefined,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const packagesQuery = useAdminCachedQuery<PackagesQueryPayload>(
    providerData ? ADMIN_CACHE_KEYS.packages : null,
    fetchPackages,
    { enabled: Boolean(providerData), staleTimeMs: 10_000, revalidateKey: packagesSeq },
  );

  const campaignsQuery = useAdminCachedQuery<CampaignsPayload>(
    canManageClients ? ADMIN_CACHE_KEYS.campaigns : null,
    fetchCampaigns,
    { enabled: canManageClients, staleTimeMs: 10_000, revalidateKey: campaignsSeq },
  );

  const inactiveQuery = useAdminCachedQuery<InactiveClientsQueryPayload>(
    activeTab === 'retention' && canManageClients ? inactiveKey : null,
    fetchInactive,
    {
      enabled: activeTab === 'retention' && canManageClients,
      staleTimeMs: 10_000,
      revalidateKey: bookingEventSeq,
    },
  );

  const data = useMemo<AdminOverviewPayload | null>(() => {
    if (!providerData) return null;
    const cachedClients = clientsQuery.data;
    if (!cachedClients) return providerData;
    return {
      ...providerData,
      clients: cachedClients.clients,
      nearRewardClients: cachedClients.nearRewardClients,
    };
  }, [providerData, clientsQuery.data]);

  const servicePackages = useMemo(
    () => packagesQuery.data?.servicePackages ?? [],
    [packagesQuery.data],
  );
  const clientPackages = useMemo(
    () => packagesQuery.data?.clientPackages ?? [],
    [packagesQuery.data],
  );
  const campaigns = campaignsQuery.data ?? null;
  const inactiveResult = useMemo(
    () =>
      inactiveQuery.data
        ? {
            days: inactiveQuery.data.inactiveDays ?? inactiveDays,
            clients: inactiveQuery.data.clients ?? [],
          }
        : null,
    [inactiveQuery.data, inactiveDays],
  );

  const currentMonth = data ? data.serverTodayKey.slice(5, 7) : '';
  const visitCountByClient = useMemo(() => buildVisitCountByClient(data), [data]);
  const noShowStatsByClient = useMemo(() => buildNoShowStatsByClient(data), [data]);
  const loyaltyByClientId = useMemo(() => buildLoyaltyByClientId(data), [data]);
  const rows = useMemo(
    () => filterClientRows(data, query, onlyBirthdays, currentMonth),
    [data, query, onlyBirthdays, currentMonth],
  );
  const groupedByLetter = useMemo(() => groupClientsByLetter(rows), [rows]);
  const returningClients = useMemo(
    () => buildReturningClients(data, visitCountByClient),
    [data, visitCountByClient],
  );
  const packagesByClientId = useMemo(
    () => groupPackagesByClientId(clientPackages),
    [clientPackages],
  );
  const activeClientPackages = useMemo(
    () =>
      clientPackages.filter(
        (pkg) => pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0,
      ),
    [clientPackages],
  );

  const activeCatalogPackages = useMemo(
    () => servicePackages.filter((p) => p.isActive),
    [servicePackages],
  );
  const displayedInactiveClients: InactiveClientRow[] = data?.retention
    ? canManageClients
      ? (inactiveResult?.clients ?? data.retention.inactiveClients)
      : data.retention.inactiveClients.filter((item) => item.daysSinceLastVisit >= inactiveDays)
    : [];
  const dispatchedTodayKeys = useMemo(
    () => new Set((campaigns?.recentDispatches ?? []).map((d) => `${d.kind}:${d.clientId}`)),
    [campaigns],
  );
  const comebackCount =
    displayedInactiveClients.length + (campaigns?.birthdays.length ?? 0);
  const loyaltyHighlightsCount =
    (data?.nearRewardClients.length ?? 0) + activeClientPackages.length;

  const kpiItems: MetricTileItem[] =
    data && data.retention
      ? [
          {
            id: 'clients',
            label: 'Clientas',
            value: String(data.clients.length),
            sub: `${data.retention.returningClientsCount} frecuentes (2+ visitas)`,
            interactive: true,
          },
          {
            id: 'comeback',
            label: 'Para invitar de vuelta',
            value: String(comebackCount),
            sub: `${campaigns?.birthdays.length ?? 0} cumpleaños · ${displayedInactiveClients.length} sin cita (${inactiveDays}+ días)`,
            tone: comebackCount > 0 ? 'warning' : 'success',
            interactive: true,
          },
          {
            id: 'loyalty',
            label: 'Sellos y paquetes',
            value: String(loyaltyHighlightsCount),
            sub: `${data.nearRewardClients.length} cerca de premio · ${activeClientPackages.length} paquetes activos`,
            interactive: true,
          },
        ]
      : [];

  return {
    data,
    canManageClients,
    activeTab,
    setActiveTab,
    query,
    setQuery,
    onlyBirthdays,
    setOnlyBirthdays,
    inactiveDays,
    setInactiveDays,
    activeCatalogPackages,
    clientPackages,
    activeClientPackages,
    campaigns,
    displayedInactiveClients,
    dispatchedTodayKeys,
    comebackCount,
    loyaltyHighlightsCount,
    kpiItems,
    visitCountByClient,
    noShowStatsByClient,
    loyaltyByClientId,
    rows,
    groupedByLetter,
    returningClients,
    packagesByClientId,
    packagesLoading: packagesQuery.isLoading,
    campaignsLoading: campaignsQuery.isLoading,
    inactiveLoading: inactiveQuery.isLoading,
    inactiveError: inactiveQuery.error ? inactiveQuery.error.message : null,
    revalidateClients: () => void clientsQuery.revalidate(),
    reloadCampaigns: () => setCampaignsSeq((prev) => prev + 1),
    reloadPackages: () => setPackagesSeq((prev) => prev + 1),
  };
}
