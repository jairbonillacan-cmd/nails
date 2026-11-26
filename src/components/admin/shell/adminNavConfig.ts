import { getDateKeyInTimezone } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  prefetchAdminData,
} from '@/lib/hooks/useAdminCache';
import type { AdminOverviewPayload } from '../AdminProvider';

export const ROLE_LABELS = {
  owner: 'Dueña',
  admin: 'Recepción',
  specialist: 'Profesional',
} as const;

export type NavIconId =
  | 'overview'
  | 'bookings'
  | 'clients'
  | 'cash'
  | 'services'
  | 'availability'
  | 'team'
  | 'brand'
  | 'reports'
  | 'inventory'
  | 'integrations'
  | 'onboarding';

export interface NavItemConfig {
  id: NavIconId;
  label: string;
  href: string;
  matchPath: string;
  badge?: string | null;
}

export interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

export interface SidebarStaffRow {
  id: string;
  firstName: string;
  todayCount: number;
  href: string;
}

export function cleanDisplayName(fullName: string): string {
  const cleaned = fullName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return cleaned || fullName.trim();
}

export function getDisplayBookingHost(appUrl: string): string {
  const cleaned = appUrl.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!cleaned || cleaned.startsWith('localhost') || cleaned.startsWith('127.0.0.1')) {
    return '/reservar';
  }
  return `${cleaned}/reservar`;
}

export function getBookingCopyUrl(appUrl: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/reservar`;
  }
  return `${appUrl.replace(/\/+$/, '')}/reservar`;
}

export function buildPrimaryNavGroups(data: AdminOverviewPayload): NavGroupConfig[] {
  const role = data.session.user.role;
  const rawGroups: Array<{ title: string; items: Array<NavItemConfig & { visible: boolean }> }> = [
    {
      title: 'Operación',
      items: [
        {
          id: 'overview',
          label: 'Resumen',
          href: '/admin',
          matchPath: '/admin',
          visible: true,
        },
        {
          id: 'bookings',
          label: 'Agenda',
          href: '/admin/citas',
          matchPath: '/admin/citas',
          badge:
            data.kpis.pendingConfirmationsCount > 0
              ? String(data.kpis.pendingConfirmationsCount)
              : null,
          visible: true,
        },
        {
          id: 'clients',
          label: 'Clientas',
          href: '/admin/clientas',
          matchPath: '/admin/clientas',
          visible: roleCanAccess(role, 'clients'),
        },
        {
          id: 'cash',
          label: 'Caja',
          href: '/admin/caja',
          matchPath: '/admin/caja',
          visible: roleCanAccess(role, 'cash'),
        },
        {
          id: 'reports',
          label: 'Reportes',
          href: '/admin/reportes',
          matchPath: '/admin/reportes',
          visible: roleCanAccess(role, 'reports'),
        },
      ],
    },
    {
      title: 'Salón',
      items: [
        {
          id: 'services',
          label: 'Servicios',
          href: '/admin/servicios',
          matchPath: '/admin/servicios',
          visible: roleCanAccess(role, 'services'),
        },
        {
          id: 'availability',
          label: 'Horarios',
          href: '/admin/disponibilidad',
          matchPath: '/admin/disponibilidad',
          visible: roleCanAccess(role, 'availability'),
        },
        {
          id: 'team',
          label: 'Equipo',
          href: '/admin/equipo',
          matchPath: '/admin/equipo',
          visible: roleCanAccess(role, 'team'),
        },
        {
          id: 'inventory',
          label: 'Inventario',
          href: '/admin/inventario',
          matchPath: '/admin/inventario',
          badge: data.kpis.lowStockCount > 0 ? String(data.kpis.lowStockCount) : null,
          visible: roleCanAccess(role, 'inventory'),
        },
      ],
    },
  ];

  return rawGroups
    .map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => item.visible)
        .map(({ visible: _visible, ...item }) => item),
    }))
    .filter((group) => group.items.length > 0);
}

export function buildFooterNavItems(data: AdminOverviewPayload): NavItemConfig[] {
  const role = data.session.user.role;
  const rawItems: Array<NavItemConfig & { visible: boolean }> = [
    {
      id: 'brand',
      label: 'Mi página',
      href: '/admin/marca',
      matchPath: '/admin/marca',
      visible: roleCanAccess(role, 'brand'),
    },
    {
      id: 'integrations',
      label: 'Conexiones',
      href: '/admin/integraciones',
      matchPath: '/admin/integraciones',
      visible: roleCanAccess(role, 'integrations'),
    },
    {
      id: 'onboarding',
      label: 'Guía inicial',
      href: '/admin/onboarding',
      matchPath: '/admin/onboarding',
      badge: !data.settings.onboardingCompleted
        ? `${data.onboardingChecklist.completedCount}/${data.onboardingChecklist.totalCount}`
        : null,
      visible: role === 'owner',
    },
  ];

  return rawItems
    .filter((item) => item.visible)
    .map(({ visible: _visible, ...item }) => item);
}

export function buildSidebarStaffRows(data: AdminOverviewPayload): SidebarStaffRow[] {
  if (data.session.user.role === 'specialist') return [];
  const tz = data.settings.timezone || 'America/Mexico_City';
  const todayKey = data.serverTodayKey || getDateKeyInTimezone(new Date(data.serverNowIso), tz);
  const todayCounts = new Map<string, number>();

  for (const booking of data.bookings) {
    if (booking.status === 'canceled') continue;
    if (getDateKeyInTimezone(new Date(booking.startAt), tz) === todayKey) {
      todayCounts.set(booking.staffId, (todayCounts.get(booking.staffId) ?? 0) + 1);
    }
  }

  return data.staff
    .filter((member) => member.isActive)
    .toSorted((a, b) => a.displayOrder - b.displayOrder)
    .slice(0, 6)
    .map((member) => ({
      id: member.id,
      firstName: member.name.trim().split(/\s+/)[0] || member.name,
      todayCount: todayCounts.get(member.id) ?? 0,
      href: `/admin/citas?staff=${encodeURIComponent(member.id)}`,
    }));
}

export function prefetchAdminRoute(
  routeId: string,
  href: string,
  data: AdminOverviewPayload | null,
  routerPrefetch: (path: string) => void,
): void {
  if (!data) return;
  const currentRole = data.session.user.role;
  routerPrefetch(href);

  if (routeId === 'overview' || routeId === 'bookings') {
    void prefetchAdminData(ADMIN_CACHE_KEYS.overview, (signal) =>
      fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    );
    return;
  }

  if (routeId === 'clients' && roleCanAccess(currentRole, 'clients')) {
    void prefetchAdminData(ADMIN_CACHE_KEYS.clients, (signal) =>
      fetchAdminJson<unknown>(ADMIN_CACHE_KEYS.clients, signal),
    );
    void prefetchAdminData(ADMIN_CACHE_KEYS.packages, (signal) =>
      fetchAdminJson<unknown>(ADMIN_CACHE_KEYS.packages, signal),
    );
    void prefetchAdminData(ADMIN_CACHE_KEYS.campaigns, (signal) =>
      fetchAdminJson<unknown>(ADMIN_CACHE_KEYS.campaigns, signal),
    );
    return;
  }

  if (routeId === 'cash' && roleCanAccess(currentRole, 'cash')) {
    void prefetchAdminData(ADMIN_CACHE_KEYS.overview, (signal) =>
      fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    );
    void prefetchAdminData(ADMIN_CACHE_KEYS.packages, (signal) =>
      fetchAdminJson<unknown>(ADMIN_CACHE_KEYS.packages, signal),
    );
    return;
  }

  if (routeId === 'reports' && roleCanAccess(currentRole, 'reports')) {
    void prefetchAdminData(ADMIN_CACHE_KEYS.reports('30d'), (signal) =>
      fetchAdminJson<unknown>(ADMIN_CACHE_KEYS.reports('30d'), signal),
    );
  }
}
