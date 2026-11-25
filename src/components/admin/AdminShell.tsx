'use client';

import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { MobileNav } from '@astryxdesign/core/MobileNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
  BellRing,
  CalendarDays,
  CheckCircle2,
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
  Sun,
  Tag,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { roleCanAccess } from '@/lib/rbac';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { useBookingAlertSound } from '@/lib/hooks/useBookingAlertSound';
import { useKeyboardShortcut } from '@/lib/hooks/useKeyboardShortcut';
import { useSidebarCollapsed } from '@/lib/hooks/useSidebarCollapsed';
import { LANDING_ASSETS } from '../landing/landingContent';
import { useSalonAppearance } from '../SalonThemeProvider';
import { useAdminData } from './AdminProvider';
import { AdminQuickSearchDialog } from './AdminQuickSearchDialog';

const ROLE_LABELS = {
  owner: 'Dueña',
  admin: 'Admin / Recepción',
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
  const pathname = usePathname();
  const { data, loading, bookingEventSeq, switchDemoUser, logout } = useAdminData();
  const { mode, setMode } = useSalonAppearance();
  const copyFeedback = useEphemeralMessage(2200);
  const soundFeedback = useEphemeralMessage(2200);
  const lastCopyRef = useRef('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [sidebarCollapsed, toggleSidebarCollapsed] = useSidebarCollapsed();

  const isLoginRoute = pathname === '/admin/login';
  const soundConfigured = data?.settings.soundAlertsEnabled ?? true;
  const { playBookingChime, isMuted, toggleMute } = useBookingAlertSound({
    enabled: Boolean(data) && !isLoginRoute && soundConfigured,
    eventSeq: bookingEventSeq,
    salonName: data?.settings.name,
  });

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
      <VStack className="ad-shell" padding={8} gap={3}>
        <VStack gap={3} maxWidth={480} width="100%" style={{ marginInline: 'auto' }}>
          <Text weight="semibold">Cargando panel de administración...</Text>
          <ProgressBar label="Cargando" isIndeterminate />
        </VStack>
      </VStack>
    );
  }

  const role = data.session.user.role;
  const soundActive = soundConfigured && !isMuted;
  const isDark = mode === 'dark';
  const brandLogo = isDark ? LANDING_ASSETS.logoWhite : LANDING_ASSETS.logoBlack;
  const bookingDisplayLink = getDisplayBookingHost(data.integration.appUrl);
  const initials = getInitials(data.session.user.fullName);

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

  const navGroups: NavGroupConfig[] = [
    {
      title: 'Hoy',
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
          label: 'Citas y agenda',
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
      title: 'Catálogo',
      items: [
        {
          id: 'services',
          label: 'Servicios y extras',
          href: '/admin/servicios',
          matchPath: '/admin/servicios',
          icon: <Scissors size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'services'),
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
      ],
    },
    {
      title: 'Equipo',
      items: [
        {
          id: 'team',
          label: 'Equipo y turnos',
          href: '/admin/equipo',
          matchPath: '/admin/equipo',
          icon: <UserCheck size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'team'),
        },
        {
          id: 'availability',
          label: 'Disponibilidad',
          href: '/admin/disponibilidad',
          matchPath: '/admin/disponibilidad',
          icon: <Clock size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'availability'),
        },
        {
          id: 'commissions',
          label: 'Comisiones y cupones',
          href: '/admin/caja?tab=comisiones',
          matchPath: '/admin/caja?tab=comisiones',
          icon: <Tag size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'cash'),
        },
      ],
    },
    {
      title: 'Estudio',
      items: [
        {
          id: 'brand',
          label: 'Página y marca',
          href: '/admin/marca',
          matchPath: '/admin/marca',
          icon: <Palette size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'brand'),
        },
        {
          id: 'integrations',
          label: 'Integraciones',
          href: '/admin/integraciones',
          matchPath: '/admin/integraciones',
          icon: <Plug size={17} strokeWidth={1.85} aria-hidden="true" />,
          visible: roleCanAccess(role, 'integrations'),
        },
        {
          id: 'onboarding',
          label: 'Configuración inicial',
          href: '/admin/onboarding',
          matchPath: '/admin/onboarding',
          icon: <CheckCircle2 size={17} strokeWidth={1.85} aria-hidden="true" />,
          badge: !data.settings.onboardingCompleted
            ? `${data.onboardingChecklist.completedCount}/${data.onboardingChecklist.totalCount}`
            : null,
          visible: role === 'owner',
        },
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.visible),
    }))
    .filter((group) => group.items.length > 0);

  const renderLinkCopyCard = (isCompactRail: boolean) =>
    isCompactRail ? (
      <Tooltip
        content={copyFeedback.message ? '¡Link de citas copiado!' : 'Copiar tu link de citas'}
        placement="end"
        hasHoverIndication={false}
      >
        <button
          type="button"
          className="ad-rail-btn"
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
          className="ad-link-box"
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
          <Text color="accent" weight="bold" size="sm">
            {copyFeedback.message ? '¡Copiado!' : 'Copiar'}
          </Text>
        </button>
      </VStack>
    );

  const renderNavGroups = (isCompactRail: boolean, onItemClick?: () => void) => (
    <VStack as="nav" aria-label="Panel" gap={isCompactRail ? 1.5 : 2} className="ad-nav-wrap">
      {navGroups.map((group, groupIdx) => (
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
            {group.items.map((item) => {
              const isSelected = pathname === item.matchPath;
              const tooltipText = item.badge ? `${item.label} (${item.badge})` : item.label;
              const linkNode = (
                <NextLink
                  href={item.href}
                  className={isCompactRail ? 'ad-nav ad-nav-compact' : 'ad-nav'}
                  data-on={isSelected ? 'true' : 'false'}
                  aria-current={isSelected ? 'page' : undefined}
                  aria-label={isCompactRail ? tooltipText : undefined}
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
                      <Text
                        color="inherit"
                        weight="bold"
                        className="ad-nav-badge"
                        hasTabularNumbers
                      >
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
            })}
          </VStack>
        </VStack>
      ))}
    </VStack>
  );

  const renderSidebarFooter = (isCompactRail: boolean, closeDrawer?: () => void) =>
    isCompactRail ? (
      <VStack gap={1.5} align="center" className="ad-side-foot ad-side-foot-compact">
        <Tooltip
          content={`${data.session.user.fullName} · ${ROLE_LABELS[role]}`}
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-avatar-btn"
            aria-label={`${data.session.user.fullName} (${ROLE_LABELS[role]}). Expandir barra para cambiar rol`}
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
          content={soundActive ? 'Silenciar alertas' : 'Activar sonido'}
          placement="end"
          hasHoverIndication={false}
        >
          <button
            type="button"
            className="ad-rail-btn"
            aria-label={soundActive ? 'Silenciar alertas' : 'Activar sonido'}
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

        <Tooltip content="Ver página pública" placement="end" hasHoverIndication={false}>
          <NextLink href="/" className="ad-rail-btn" aria-label="Ver página pública">
            <ExternalLink size={16} strokeWidth={1.85} aria-hidden="true" />
          </NextLink>
        </Tooltip>

        <Tooltip content="Cerrar sesión" placement="end" hasHoverIndication={false}>
          <button
            type="button"
            className="ad-rail-btn"
            aria-label="Cerrar sesión"
            onClick={() => void logout()}
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
              {data.session.user.fullName}
            </Text>
            <Text type="supporting" color="secondary" size="sm">
              {ROLE_LABELS[role]}
            </Text>
          </VStack>
        </HStack>

        {data.integration.mode === 'demo' ? (
          <Selector
            label="Cambiar rol demo"
            isLabelHidden
            size="sm"
            width="100%"
            value={data.session.user.email}
            onChange={(val) => {
              if (val) {
                void switchDemoUser(val);
                if (closeDrawer) closeDrawer();
              }
            }}
            options={data.adminUsers
              .filter((u) => u.isActive)
              .map((u) => ({
                value: u.email,
                label: `${u.fullName.split(' ')[0]} · ${ROLE_LABELS[u.role]}`,
              }))}
          />
        ) : null}

        <HStack gap={1.5} align="center">
          <button
            type="button"
            className="ad-pill ad-foot-pill"
            aria-pressed={soundActive}
            onClick={toggleMute}
          >
            {soundActive ? (
              <Volume2 size={14} aria-hidden="true" />
            ) : (
              <VolumeX size={14} aria-hidden="true" />
            )}
            <Text color="inherit" size="sm" weight="semibold">
              {soundFeedback.message ? soundFeedback.message : soundActive ? 'Sonido' : 'Silencio'}
            </Text>
          </button>
          <button
            type="button"
            className="ad-pill ad-icon-pill"
            aria-label="Probar sonido de alerta"
            title="Probar sonido de alerta"
            onClick={() => void handleTestSound()}
          >
            <BellRing size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ad-pill ad-foot-pill"
            aria-pressed={isDark}
            onClick={() => setMode(isDark ? 'light' : 'dark')}
          >
            {isDark ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
            <Text color="inherit" size="sm" weight="semibold">
              {isDark ? 'Claro' : 'Oscuro'}
            </Text>
          </button>
        </HStack>

        <HStack justify="between" align="center" gap={2}>
          <button
            type="button"
            className="ad-foot-link"
            onClick={() => {
              if (closeDrawer) closeDrawer();
              void logout();
            }}
          >
            <LogOut size={14} aria-hidden="true" />
            <Text color="inherit" size="sm">
              Cerrar sesión
            </Text>
          </button>
          <NextLink
            href="/"
            className="ad-foot-link"
            onClick={closeDrawer}
            aria-label="Ver sitio público"
          >
            <ExternalLink size={14} aria-hidden="true" />
            <Text color="inherit" size="sm">
              Sitio
            </Text>
          </NextLink>
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

            {renderNavGroups(sidebarCollapsed)}

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
            className="ad-bottom-plus"
            aria-label="Nueva cita"
          >
            <Plus size={24} aria-hidden="true" />
          </NextLink>

          {canClients ? (
            <NextLink
              href="/admin/clientas"
              className="ad-bottom-item"
              data-on={pathname === '/admin/clientas' ? 'true' : 'false'}
              aria-current={pathname === '/admin/clientas' ? 'page' : undefined}
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
          label="Menú de administración"
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
            {renderNavGroups(false, () => setMobileMenuOpen(false))}
            {renderSidebarFooter(false, () => setMobileMenuOpen(false))}
          </VStack>
        </MobileNav>

        <AdminQuickSearchDialog
          isOpen={quickSearchOpen}
          onOpenChange={setQuickSearchOpen}
          data={data}
        />
      </VStack>
    </AdminShellContext.Provider>
  );
}
