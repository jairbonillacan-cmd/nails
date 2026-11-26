'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MobileNav } from '@astryxdesign/core/MobileNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
  BarChart3,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Home,
  LogOut,
  Menu,
  Moon,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Scissors,
  Search,
  SlidersHorizontal,
  Sun,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { roleCanAccess } from '@/lib/rbac';
import {
  ADMIN_CACHE_KEYS,
  fetchAdminJson,
  invalidateAdminCache,
  prefetchAdminData,
  setAdminCacheScope,
  useAdminCachedQuery,
  useAdminCacheSessionSync,
} from '@/lib/hooks/useAdminCache';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useBookingAlertSound } from '@/lib/hooks/useBookingAlertSound';
import { useKeyboardShortcut } from '@/lib/hooks/useKeyboardShortcut';
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed';
import type { BookingWithRelations } from '@/lib/types';
import { LANDING_ASSETS } from '../landing/landingContent';
import { useSalonAppearance } from '../SalonThemeProvider';
import { useAdminData, type AdminOverviewPayload } from './AdminProvider';

const AdminQuickSearchDialog = dynamic(
  () => import('./AdminQuickSearchDialog').then((mod) => mod.AdminQuickSearchDialog),
  { ssr: false },
);

const ROLE_LABELS = {
  owner: 'Dueña',
  admin: 'Recepción',
  specialist: 'Manicurista',
} as const;

interface AdminShellControls {
  openMobileMenu: () => void;
  openQuickSearch: () => void;
  isMobileMenuOpen: boolean;
}

const AdminShellContext = createContext<AdminShellControls>({
  openMobileMenu: () => undefined,
  openQuickSearch: () => undefined,
  isMobileMenuOpen: false,
});

export function useAdminShellControls(): AdminShellControls {
  return useContext(AdminShellContext);
}

interface NavItemConfig {
  id: string;
  label: string;
  href: string;
  matchPath: string;
  icon: React.ReactNode;
  badge?: string | null;
  visible: boolean;
}

interface NavGroupConfig {
  title: string;
  items: NavItemConfig[];
}

function cleanDisplayName(fullName: string): string {
  const cleaned = fullName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return cleaned || fullName.trim();
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LN';
  if (parts.length === 1) return (parts[0] ?? 'LN').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function getDisplayBookingHost(appUrl: string): string {
  const cleaned = appUrl.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!cleaned || cleaned.startsWith('localhost') || cleaned.startsWith('127.0.0.1')) {
    return '/reservar';
  }
  return `${cleaned}/reservar`;
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: providerData, loading, bookingEventSeq, switchDemoUser, logout } = useAdminData();
  const { mode, setMode } = useSalonAppearance();
  const copyFeedback = useEphemeralMessage(2200);
  const soundFeedback = useEphemeralMessage(2200);
  const lastCopyRef = useRef('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [moreToolsOverride, setMoreToolsOverride] = useState<{
    path: string;
    open: boolean;
  } | null>(null);
  const [sidebarCollapsed, toggleSidebarCollapsed] = useSidebarCollapsed();

  const isLoginRoute = pathname === '/admin/login';
  const sessionScopeKey =
    !isLoginRoute && providerData
      ? `${providerData.session.user.id}:${providerData.session.user.role}`
      : null;

  useAdminCacheSessionSync(sessionScopeKey, isLoginRoute ? null : providerData);

  const overviewCacheQuery = useAdminCachedQuery<AdminOverviewPayload>(
    sessionScopeKey ? ADMIN_CACHE_KEYS.overview : null,
    (signal) => fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
    { enabled: false, initialData: providerData ?? undefined },
  );

  const data = overviewCacheQuery.data ?? providerData;
  const soundConfigured = data?.settings.soundAlertsEnabled ?? true;
  const { playBookingChime, isMuted, toggleMute } = useBookingAlertSound({
    enabled: Boolean(data) && !isLoginRoute && soundConfigured,
    eventSeq: bookingEventSeq,
    salonName: data?.settings.name,
  });

  const handleSwitchDemoUser = useCallback(
    async (email: string) => {
      invalidateAdminCache();
      setAdminCacheScope(null);
      await switchDemoUser(email);
    },
    [switchDemoUser],
  );

  const handleLogout = useCallback(async () => {
    invalidateAdminCache();
    setAdminCacheScope(null);
    await logout();
  }, [logout]);

  const prefetchRoute = useCallback(
    (routeId: string, href: string) => {
      if (!data) return;
      const currentRole = data.session.user.role;
      router.prefetch(href);

      if (routeId === 'overview') {
        void prefetchAdminData(ADMIN_CACHE_KEYS.overview, (signal) =>
          fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
        );
        return;
      }

      if (routeId === 'bookings') {
        void prefetchAdminData(ADMIN_CACHE_KEYS.overview, (signal) =>
          fetchAdminJson<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, signal),
        );
        void prefetchAdminData(ADMIN_CACHE_KEYS.bookings, (signal) =>
          fetchAdminJson<{ bookings: BookingWithRelations[] }>(
            ADMIN_CACHE_KEYS.bookings,
            signal,
          ),
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
        if (currentRole === 'owner' || currentRole === 'admin') {
          void prefetchAdminData(ADMIN_CACHE_KEYS.operations, (signal) =>
            fetchAdminJson<unknown>(ADMIN_CACHE_KEYS.operations, signal),
          );
        }
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
    },
    [data, router],
  );

  useKeyboardShortcut(
    'k',
    () => setQuickSearchOpen((prev) => !prev),
    { enabled: Boolean(data) && !isLoginRoute, requireModifier: true },
  );

  useKeyboardShortcut(
    'b',
    toggleSidebarCollapsed,
    { enabled: Boolean(data) && !isLoginRoute, requireModifier: true },
  );

  const controls = useMemo<AdminShellControls>(
    () => ({
      openMobileMenu: () => setMobileMenuOpen(true),
      openQuickSearch: () => setQuickSearchOpen(true),
      isMobileMenuOpen: mobileMenuOpen,
    }),
    [mobileMenuOpen],
  );

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (loading || !data) {
    return (
      <VStack className="ad-shell" gap={0} role="status" aria-busy="true">
        <Text className="rb-sr-only">Cargando tu panel...</Text>
        <HStack className="ad-frame" gap={0} align="stretch">
          <VStack className="ad-side" gap={4} aria-hidden="true">
            <VStack className="ad-skeleton" data-size="button" />
            <VStack className="ad-skeleton" data-size="row" />
            <VStack gap={2}>
              <VStack className="ad-skeleton" data-size="line" data-width="short" />
              <VStack className="ad-skeleton" data-size="line" data-width="long" />
              <VStack className="ad-skeleton" data-size="line" data-width="mid" />
              <VStack className="ad-skeleton" data-size="line" data-width="long" />
            </VStack>
            <VStack gap={2}>
              <VStack className="ad-skeleton" data-size="line" data-width="short" />
              <VStack className="ad-skeleton" data-size="line" data-width="mid" />
              <VStack className="ad-skeleton" data-size="line" data-width="long" />
            </VStack>
          </VStack>
          <VStack className="ad-main-wrap" gap={0}>
            <VStack className="ad-sheet" gap={5} aria-hidden="true">
              <VStack gap={5} width="100%" className="ad-content-inner">
                <VStack gap={2}>
                  <VStack className="ad-skeleton" data-size="line" data-width="short" />
                  <VStack className="ad-skeleton" data-size="title" />
                  <VStack className="ad-skeleton" data-size="line" data-width="mid" />
                </VStack>
                <VStack className="ad-kpis-3" gap={0}>
                  <VStack className="ad-skeleton" data-size="kpi" />
                  <VStack className="ad-skeleton" data-size="kpi" />
                  <VStack className="ad-skeleton" data-size="kpi" />
                </VStack>
                <VStack className="ad-split" gap={0}>
                  <VStack className="ad-skeleton" data-size="card" />
                  <VStack className="ad-skeleton" data-size="card" />
                </VStack>
              </VStack>
            </VStack>
          </VStack>
        </HStack>
      </VStack>
    );
  }

  const role = data.session.user.role;
  const soundActive = soundConfigured && !isMuted;
  const isDark = mode === 'dark';
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;
  const bookingDisplayLink = getDisplayBookingHost(data.integration.appUrl);
  const displayName = cleanDisplayName(data.session.user.fullName);
  const initials = getInitials(displayName);

  const copyBookingLink = async () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/reservar`
        : `${data.integration.appUrl.replace(/\/+$/, '')}/reservar`;
    try {
      await navigator.clipboard.writeText(url);
      let msg = '¡Copiado!';
      if (msg === lastCopyRef.current) msg += '\u00A0';
      lastCopyRef.current = msg;
      copyFeedback.show(msg);
    } catch {
      let msg = 'Copia /reservar';
      if (msg === lastCopyRef.current) msg += '\u00A0';
      lastCopyRef.current = msg;
      copyFeedback.show(msg);
    }
  };

  const handleTestSound = async () => {
    const played = await playBookingChime();
    soundFeedback.show(played ? 'Timbre OK' : 'Sin audio');
  };

  const primaryNavGroups: NavGroupConfig[] = [
    {
      title: 'Tu día',
      items: [
        {
          id: 'overview',
          label: 'Inicio',
          href: '/admin',
          matchPath: '/admin',
          icon: <Home size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: true,
        },
        {
          id: 'bookings',
          label: 'Agenda',
          href: '/admin/citas',
          matchPath: '/admin/citas',
          icon: <CalendarDays size={17} strokeWidth={1.85} aria-hidden="true" />,
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
          icon: <Users size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'clients'),
        },
        {
          id: 'cash',
          label: 'Caja',
          href: '/admin/caja',
          matchPath: '/admin/caja',
          icon: <Wallet size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'cash'),
        },
      ],
    },
    {
      title: 'Tu salón',
      items: [
        {
          id: 'services',
          label: 'Servicios',
          href: '/admin/servicios',
          matchPath: '/admin/servicios',
          icon: <Scissors size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'services'),
        },
        {
          id: 'availability',
          label: 'Horarios',
          href: '/admin/disponibilidad',
          matchPath: '/admin/disponibilidad',
          icon: <Clock size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'availability'),
        },
        {
          id: 'team',
          label: 'Equipo',
          href: '/admin/equipo',
          matchPath: '/admin/equipo',
          icon: <UserCheck size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'team'),
        },
        {
          id: 'brand',
          label: 'Mi página',
          href: '/admin/marca',
          matchPath: '/admin/marca',
          icon: <Palette size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'brand'),
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);

  const secondaryNavItems: NavItemConfig[] = [
    {
      id: 'reports',
      label: 'Reportes',
      href: '/admin/reportes',
      matchPath: '/admin/reportes',
      icon: <BarChart3 size={17} strokeWidth={1.85} aria-hidden="true" />,
      visible: roleCanAccess(role, 'reports'),
    },
    {
      id: 'inventory',
      label: 'Inventario',
      href: '/admin/inventario',
      matchPath: '/admin/inventario',
      icon: <Package size={17} strokeWidth={1.85} aria-hidden="true" />,
      badge: data.kpis.lowStockCount > 0 ? String(data.kpis.lowStockCount) : null,
      visible: roleCanAccess(role, 'inventory'),
    },
    {
      id: 'integrations',
      label: 'Conexiones',
      href: '/admin/integraciones',
      matchPath: '/admin/integraciones',
      icon: <Plug size={17} strokeWidth={1.85} aria-hidden="true" />,
      visible: roleCanAccess(role, 'integrations'),
    },
    {
      id: 'onboarding',
      label: 'Guía inicial',
      href: '/admin/onboarding',
      matchPath: '/admin/onboarding',
      icon: <CheckCircle2 size={17} strokeWidth={1.85} aria-hidden="true" />,
      badge: !data.settings.onboardingCompleted
        ? `${data.onboardingChecklist.completedCount}/${data.onboardingChecklist.totalCount}`
        : null,
      visible: role === 'owner',
    },
  ].filter((item) => item.visible);

  const isSecondaryRouteActive = secondaryNavItems.some((item) => pathname === item.matchPath);
  const isMoreToolsOpen =
    moreToolsOverride && moreToolsOverride.path === pathname
      ? moreToolsOverride.open
      : isSecondaryRouteActive;
  const secondaryHasBadge = secondaryNavItems.some((item) => Boolean(item.badge));

  const toggleMoreTools = () => {
    setMoreToolsOverride({ path: pathname, open: !isMoreToolsOpen });
  };

  const renderLinkCopyCard = (isCompactRail: boolean) =>
    isCompactRail ? (
      <Tooltip
        content={copyFeedback.message ? '¡Link de citas copiado!' : 'Copiar tu link de citas'}
        placement="end"
        hasHoverIndication={false}
      >
        <button
          type="button"
          className="ad-rail-btn fx-press"
          aria-label="Copiar enlace de página de citas"
          onClick={() => void copyBookingLink()}
        >
          <Copy size={16} strokeWidth={1.85} aria-hidden="true" />
        </button>
      </Tooltip>
    ) : (
      <VStack gap={1}>
        <button
          type="button"
          className="ad-link-box fx-press"
          aria-label="Copiar enlace de página de citas"
          onClick={() => void copyBookingLink()}
        >
          <VStack gap={0} align="start" className="rb-grow">
            <Text type="supporting" color="secondary" size="sm">
              Tu link de citas
            </Text>
            <Text weight="semibold" size="sm" className="ad-link-url">
              {bookingDisplayLink}
            </Text>
          </VStack>
          <Text
            color="accent"
            weight="bold"
            size="sm"
            className={copyFeedback.message ? 'fx-pop' : undefined}
          >
            {copyFeedback.message ? '¡Copiado!' : 'Copiar'}
          </Text>
        </button>
      </VStack>
    );

  const renderNavItem = (
    item: NavItemConfig,
    isCompactRail: boolean,
    onItemClick?: () => void,
  ) => {
    const isSelected = pathname === item.matchPath;
    const tooltipText = item.badge ? `${item.label} (${item.badge})` : item.label;
    const linkNode = (
      <NextLink
        href={item.href}
        className={isCompactRail ? 'ad-nav ad-nav-compact fx-press' : 'ad-nav fx-press'}
        data-on={isSelected ? 'true' : 'false'}
        aria-current={isSelected ? 'page' : undefined}
        aria-label={isCompactRail ? tooltipText : undefined}
        onMouseEnter={() => prefetchRoute(item.id, item.href)}
        onFocus={() => prefetchRoute(item.id, item.href)}
        onClick={onItemClick}
      >
        {item.icon}
        {!isCompactRail ? (
          <Text color="inherit" className="ad-nav-label">
            {item.label}
          </Text>
        ) : null}
        {item.badge ? (
          isCompactRail ? (
            <Text className="ad-rail-dot" aria-hidden="true">
              {'\u200B'}
            </Text>
          ) : (
            <Text color="inherit" weight="bold" className="ad-nav-badge" hasTabularNumbers>
              {item.badge}
            </Text>
          )
        ) : null}
      </NextLink>
    );

    return (
      <li key={item.id}>
        {isCompactRail ? (
          <Tooltip content={tooltipText} placement="end" hasHoverIndication={false}>
            {linkNode}
          </Tooltip>
        ) : (
          linkNode
        )}
      </li>
    );
  };

  const renderNavGroups = (
    isCompactRail: boolean,
    idPrefix: 'side' | 'drawer',
    onItemClick?: () => void,
  ) => {
    const moreListId = `ad-more-tools-${idPrefix}`;
    return (
      <VStack as="nav" aria-label="Panel" gap={isCompactRail ? 1.5 : 2} className="ad-nav-wrap">
        {primaryNavGroups.map((group, groupIdx) => (
          <VStack
            key={group.title}
            gap={0.5}
            className={isCompactRail && groupIdx > 0 ? 'ad-nav-group-rail' : undefined}
          >
            {!isCompactRail ? (
              <Text type="supporting" weight="semibold" className="ad-nav-group-title">
                {group.title}
              </Text>
            ) : null}
            <VStack as="ul" gap={0.5} className="ad-nav-list">
              {group.items.map((item) => renderNavItem(item, isCompactRail, onItemClick))}
            </VStack>
          </VStack>
        ))}

        {secondaryNavItems.length > 0 ? (
          <VStack gap={0.5} className={isCompactRail ? 'ad-nav-group-rail' : undefined}>
            {isCompactRail ? (
              <Tooltip
                content={isMoreToolsOpen ? 'Ocultar más herramientas' : 'Más herramientas'}
                placement="end"
                hasHoverIndication={false}
              >
                <button
                  type="button"
                  className="ad-nav ad-nav-compact fx-press"
                  data-on={isSecondaryRouteActive && !isMoreToolsOpen ? 'true' : 'false'}
                  aria-label="Más herramientas"
                  aria-expanded={isMoreToolsOpen}
                  aria-controls={moreListId}
                  onClick={toggleMoreTools}
                >
                  <SlidersHorizontal size={16} strokeWidth={1.85} aria-hidden="true" />
                  {!isMoreToolsOpen && secondaryHasBadge ? (
                    <Text className="ad-rail-dot" aria-hidden="true">
                      {'\u200B'}
                    </Text>
                  ) : null}
                </button>
              </Tooltip>
            ) : (
              <button
                type="button"
                className="ad-nav-more-btn fx-press"
                data-open={isMoreToolsOpen ? 'true' : 'false'}
                aria-expanded={isMoreToolsOpen}
                aria-controls={moreListId}
                onClick={toggleMoreTools}
              >
                <Text color="inherit" size="sm" weight="semibold">
                  Más herramientas
                </Text>
                {isMoreToolsOpen ? (
                  <ChevronDown size={15} strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <ChevronRight size={15} strokeWidth={1.9} aria-hidden="true" />
                )}
              </button>
            )}

            {isMoreToolsOpen ? (
              <VStack as="ul" id={moreListId} gap={0.5} className="ad-nav-list">
                {secondaryNavItems.map((item) => renderNavItem(item, isCompactRail, onItemClick))}
              </VStack>
            ) : null}
          </VStack>
        ) : null}
      </VStack>
    );
  };

  const renderSidebarFooter = (isCompactRail: boolean, closeDrawer?: () => void) =>
    isCompactRail ? (
      <VStack gap={1.5} align="center" className="ad-side-foot ad-side-foot-compact">
        <Tooltip
          content={`${displayName} · ${ROLE_LABELS[role]}`}
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-avatar-btn"
            aria-label={`${displayName} (${ROLE_LABELS[role]}). Expandir barra lateral`}
            onClick={toggleSidebarCollapsed}
          >
            <Text color="inherit" weight="bold" className="ad-avatar" aria-hidden="true">
              {initials}
            </Text>
            <Text className="ad-online-dot" aria-hidden="true">
              {'\u200B'}
            </Text>
          </button>
        </Tooltip>

        <Tooltip
          content={
            soundActive ? 'Silenciar timbre de nuevas citas' : 'Activar timbre de nuevas citas'
          }
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-rail-btn"
            aria-label={
              soundActive ? 'Silenciar timbre de nuevas citas' : 'Activar timbre de nuevas citas'
            }
            aria-pressed={soundActive}
            onClick={toggleMute}
          >
            {soundActive ? (
              <Volume2 size={16} strokeWidth={1.85} aria-hidden="true" />
            ) : (
              <VolumeX size={16} strokeWidth={1.85} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        <Tooltip
          content={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-rail-btn"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-pressed={isDark}
            onClick={() => setMode(isDark ? 'light' : 'dark')}
          >
            {isDark ? (
              <Sun size={16} strokeWidth={1.85} aria-hidden="true" />
            ) : (
              <Moon size={16} strokeWidth={1.85} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Ver mi página" placement="end" hasHoverIndication={false}>
          <NextLink href="/" className="ad-rail-btn" aria-label="Ver mi página">
            <ExternalLink size={16} strokeWidth={1.85} aria-hidden="true" />
          </NextLink>
        </Tooltip>

        <Tooltip content="Salir" placement="end" hasHoverIndication={false}>
          <button
            type="button"
            className="ad-rail-btn"
            aria-label="Salir"
            onClick={() => void handleLogout()}
          >
            <LogOut size={16} strokeWidth={1.85} aria-hidden="true" />
          </button>
        </Tooltip>
      </VStack>
    ) : (
      <VStack gap={2} className="ad-side-foot">
        <HStack gap={2} align="center">
          <HStack className="ad-avatar-wrap" aria-hidden="true">
            <Text color="inherit" weight="bold" className="ad-avatar">
              {initials}
            </Text>
            <Text className="ad-online-dot">{'\u200B'}</Text>
          </HStack>
          <VStack gap={0} className="rb-grow">
            <Text weight="semibold" size="sm" maxLines={1}>
              {displayName}
            </Text>
            <Text type="supporting" color="secondary" size="sm">
              {ROLE_LABELS[role]}
            </Text>
          </VStack>
        </HStack>

        {data.integration.mode === 'demo' ? (
          <Selector
            label="Ver panel como"
            isLabelHidden
            size="sm"
            width="100%"
            value={data.session.user.email}
            onChange={(val) => {
              if (val) {
                void handleSwitchDemoUser(val);
                if (closeDrawer) closeDrawer();
              }
            }}
            options={data.adminUsers
              .filter((u) => u.isActive)
              .map((u) => ({
                value: u.email,
                label: `${cleanDisplayName(u.fullName).split(' ')[0]} · ${ROLE_LABELS[u.role]}`,
              }))}
          />
        ) : null}

        <HStack gap={1.5} align="center">
          <button
            type="button"
            className="ad-pill ad-foot-pill fx-press"
            aria-pressed={soundActive}
            onClick={toggleMute}
          >
            {soundActive ? (
              <Volume2 size={14} aria-hidden="true" />
            ) : (
              <VolumeX size={14} aria-hidden="true" />
            )}
            <Text color="inherit" size="sm" weight="semibold" maxLines={1}>
              {soundFeedback.message
                ? soundFeedback.message
                : soundActive
                  ? 'Timbre de nuevas citas'
                  : 'Timbre apagado'}
            </Text>
          </button>
          <button
            type="button"
            className="ad-pill ad-icon-pill fx-press"
            aria-label="Probar timbre de nuevas citas"
            title="Probar timbre de nuevas citas"
            onClick={() => void handleTestSound()}
          >
            <BellRing size={14} aria-hidden="true" />
          </button>
        </HStack>

        <button
          type="button"
          className="ad-pill ad-foot-pill fx-press"
          aria-pressed={isDark}
          onClick={() => setMode(isDark ? 'light' : 'dark')}
        >
          {isDark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
          <Text color="inherit" size="sm" weight="semibold">
            {isDark ? 'Modo claro' : 'Modo oscuro'}
          </Text>
        </button>

        <HStack justify="between" align="center" gap={2}>
          <NextLink href="/" className="ad-foot-link" onClick={closeDrawer}>
            <ExternalLink size={14} aria-hidden="true" />
            <Text color="inherit" size="sm">
              Ver mi página
            </Text>
          </NextLink>
          <button
            type="button"
            className="ad-foot-link"
            onClick={() => {
              if (closeDrawer) closeDrawer();
              void handleLogout();
            }}
          >
            <LogOut size={14} aria-hidden="true" />
            <Text color="inherit" size="sm">
              Salir
            </Text>
          </button>
        </HStack>
      </VStack>
    );

  const canClients = roleCanAccess(role, 'clients');

  return (
    <AdminShellContext.Provider value={controls}>
      <VStack className="ad-shell" gap={0}>
        <Text
          type="supporting"
          color="secondary"
          role="status"
          aria-live="polite"
          className="rb-sr-only"
        >
          {copyFeedback.message ?? ''}
        </Text>

        <HStack as="header" className="ad-mobile-top" justify="between" align="center" gap={2}>
          <button
            type="button"
            className="ad-pill ad-menu-trigger"
            aria-label="Abrir menú"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={16} aria-hidden="true" />
            <Text color="inherit" size="sm" weight="semibold">
              Menú
            </Text>
          </button>
          <NextLink
            href="/admin"
            aria-label={`${data.settings.name}, inicio del panel`}
            className="ad-logo-link"
          >
            <img
              src={brandLogo}
              alt={data.settings.name}
              width={110}
              height={32}
              className="ad-logo-sm"
            />
          </NextLink>
          <button
            type="button"
            className="ad-pill ad-icon-pill"
            aria-label="Buscar clienta o cita"
            onClick={() => setQuickSearchOpen(true)}
          >
            <Search size={16} aria-hidden="true" />
          </button>
        </HStack>

        <HStack
          className="ad-frame"
          data-collapsed={sidebarCollapsed ? 'true' : 'false'}
          gap={0}
          align="stretch"
        >
          <VStack
            as="aside"
            className="ad-side"
            data-collapsed={sidebarCollapsed ? 'true' : 'false'}
            gap={3}
            aria-label="Menú lateral"
          >
            {sidebarCollapsed ? (
              <VStack gap={1.5} align="center" className="ad-side-top-compact">
                <Tooltip
                  content="Expandir barra (Ctrl B)"
                  placement="end"
                  hasHoverIndication={false}
                >
                  <button
                    type="button"
                    className="ad-rail-btn"
                    aria-label="Expandir barra lateral"
                    aria-expanded={false}
                    onClick={toggleSidebarCollapsed}
                  >
                    <PanelLeftOpen size={17} strokeWidth={1.85} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip content="Buscar (Ctrl K)" placement="end" hasHoverIndication={false}>
                  <button
                    type="button"
                    className="ad-rail-btn"
                    aria-label="Buscar clienta o cita"
                    onClick={() => setQuickSearchOpen(true)}
                  >
                    <Search size={16} strokeWidth={1.85} aria-hidden="true" />
                  </button>
                </Tooltip>
                {renderLinkCopyCard(true)}
              </VStack>
            ) : (
              <VStack gap={3} className="ad-side-top">
                <HStack justify="between" align="center" gap={1.5}>
                  <NextLink
                    href="/admin"
                    aria-label={`${data.settings.name}, inicio del panel`}
                    className="ad-logo-link"
                  >
                    <img
                      src={brandLogo}
                      alt={data.settings.name}
                      width={118}
                      height={34}
                      className="ad-logo"
                    />
                  </NextLink>
                  <HStack gap={1} align="center">
                    <Tooltip content="Buscar (Ctrl K)" placement="below" hasHoverIndication={false}>
                      <button
                        type="button"
                        className="ad-rail-btn ad-rail-btn-sm"
                        aria-label="Buscar clienta o cita"
                        onClick={() => setQuickSearchOpen(true)}
                      >
                        <Search size={15} strokeWidth={1.85} aria-hidden="true" />
                      </button>
                    </Tooltip>
                    <Tooltip
                      content="Retraer barra (Ctrl B)"
                      placement="below"
                      hasHoverIndication={false}
                    >
                      <button
                        type="button"
                        className="ad-rail-btn ad-rail-btn-sm"
                        aria-label="Retraer barra lateral"
                        aria-expanded={true}
                        onClick={toggleSidebarCollapsed}
                      >
                        <PanelLeftClose size={16} strokeWidth={1.85} aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </HStack>
                </HStack>
                {renderLinkCopyCard(false)}
              </VStack>
            )}

            {renderNavGroups(sidebarCollapsed, 'side')}

            {renderSidebarFooter(sidebarCollapsed)}
          </VStack>

          <VStack className="ad-main-wrap" gap={0}>
            <VStack as="main" className="ad-sheet" gap={5}>
              <VStack gap={5} width="100%" className="ad-content-inner">
                {children}
              </VStack>
            </VStack>
          </VStack>
        </HStack>

        <nav className="ad-bottom" aria-label="Accesos rápidos">
          <NextLink
            href="/admin"
            className="ad-bottom-item"
            data-on={pathname === '/admin' ? 'true' : 'false'}
            aria-current={pathname === '/admin' ? 'page' : undefined}
            onMouseEnter={() => prefetchRoute('overview', '/admin')}
            onFocus={() => prefetchRoute('overview', '/admin')}
            onTouchStart={() => prefetchRoute('overview', '/admin')}
          >
            <Home size={20} aria-hidden="true" />
            <Text color="inherit" size="sm" weight="semibold" className="ad-bottom-label">
              Inicio
            </Text>
          </NextLink>

          <NextLink
            href="/admin/citas"
            className="ad-bottom-item"
            data-on={pathname === '/admin/citas' ? 'true' : 'false'}
            aria-current={pathname === '/admin/citas' ? 'page' : undefined}
            aria-label={
              data.kpis.pendingConfirmationsCount > 0
                ? `Agenda (${data.kpis.pendingConfirmationsCount} pendientes)`
                : undefined
            }
            onMouseEnter={() => prefetchRoute('bookings', '/admin/citas')}
            onFocus={() => prefetchRoute('bookings', '/admin/citas')}
            onTouchStart={() => prefetchRoute('bookings', '/admin/citas')}
          >
            <CalendarDays size={20} aria-hidden="true" />
            <Text color="inherit" size="sm" weight="semibold" className="ad-bottom-label">
              Agenda
            </Text>
            {data.kpis.pendingConfirmationsCount > 0 ? (
              <Text className="ad-bottom-dot" aria-hidden="true">
                {'\u200B'}
              </Text>
            ) : null}
          </NextLink>

          <NextLink
            href="/admin/citas?new=1"
            className="ad-bottom-plus fx-press"
            aria-label="Nueva cita"
            onMouseEnter={() => prefetchRoute('bookings', '/admin/citas?new=1')}
            onFocus={() => prefetchRoute('bookings', '/admin/citas?new=1')}
            onTouchStart={() => prefetchRoute('bookings', '/admin/citas?new=1')}
          >
            <Plus size={24} aria-hidden="true" />
          </NextLink>

          {canClients ? (
            <NextLink
              href="/admin/clientas"
              className="ad-bottom-item"
              data-on={pathname === '/admin/clientas' ? 'true' : 'false'}
              aria-current={pathname === '/admin/clientas' ? 'page' : undefined}
              onMouseEnter={() => prefetchRoute('clients', '/admin/clientas')}
              onFocus={() => prefetchRoute('clients', '/admin/clientas')}
              onTouchStart={() => prefetchRoute('clients', '/admin/clientas')}
            >
              <Users size={20} aria-hidden="true" />
              <Text color="inherit" size="sm" weight="semibold" className="ad-bottom-label">
                Clientas
              </Text>
            </NextLink>
          ) : (
            <NextLink
              href="/admin/disponibilidad"
              className="ad-bottom-item"
              data-on={pathname === '/admin/disponibilidad' ? 'true' : 'false'}
              aria-current={pathname === '/admin/disponibilidad' ? 'page' : undefined}
              onMouseEnter={() => prefetchRoute('availability', '/admin/disponibilidad')}
              onFocus={() => prefetchRoute('availability', '/admin/disponibilidad')}
              onTouchStart={() => prefetchRoute('availability', '/admin/disponibilidad')}
            >
              <Clock size={20} aria-hidden="true" />
              <Text color="inherit" size="sm" weight="semibold" className="ad-bottom-label">
                Horarios
              </Text>
            </NextLink>
          )}

          <NextLink
            href="/admin/caja"
            className="ad-bottom-item"
            data-on={pathname === '/admin/caja' ? 'true' : 'false'}
            aria-current={pathname === '/admin/caja' ? 'page' : undefined}
            onMouseEnter={() => prefetchRoute('cash', '/admin/caja')}
            onFocus={() => prefetchRoute('cash', '/admin/caja')}
            onTouchStart={() => prefetchRoute('cash', '/admin/caja')}
          >
            <Wallet size={20} aria-hidden="true" />
            <Text color="inherit" size="sm" weight="semibold" className="ad-bottom-label">
              Caja
            </Text>
          </NextLink>
        </nav>

        <MobileNav
          isOpen={mobileMenuOpen}
          onOpenChange={setMobileMenuOpen}
          label="Menú del salón"
          width={300}
          header={
            <NextLink
              href="/admin"
              aria-label={`${data.settings.name}, inicio del panel`}
              className="ad-logo-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <img
                src={brandLogo}
                alt={data.settings.name}
                width={116}
                height={34}
                className="ad-logo-sm"
              />
            </NextLink>
          }
        >
          <VStack gap={4} paddingInline={2} paddingBlock={2} className="ad-drawer-body">
            {renderLinkCopyCard(false)}
            {renderNavGroups(false, 'drawer', () => setMobileMenuOpen(false))}
            {renderSidebarFooter(false, () => setMobileMenuOpen(false))}
          </VStack>
        </MobileNav>

        {quickSearchOpen ? (
          <AdminQuickSearchDialog
            isOpen={quickSearchOpen}
            onOpenChange={setQuickSearchOpen}
            data={data}
          />
        ) : null}
      </VStack>
    </AdminShellContext.Provider>
  );
}
