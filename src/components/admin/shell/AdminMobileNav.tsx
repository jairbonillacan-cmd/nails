'use client';

import NextLink from 'next/link';
import { MobileNav } from '@astryxdesign/core/MobileNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import {
  CalendarDays,
  Clock,
  Home,
  Menu,
  Plus,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import { roleCanAccess } from '@/lib/rbac';
import { CopyableField } from '@/components/ui';
import type { AdminOverviewPayload } from '../AdminProvider';
import {
  getBookingCopyUrl,
  getDisplayBookingHost,
  type NavGroupConfig,
  type NavItemConfig,
} from './adminNavConfig';
import { AdminNavGroups } from './AdminNavGroups';
import { AdminFooterControls } from './AdminFooterControls';

interface AdminMobileHeaderProps {
  salonName: string;
  brandLogo: string;
  mobileMenuOpen: boolean;
  onOpenMenu: () => void;
  onOpenQuickSearch: () => void;
}

export function AdminMobileHeader({
  salonName,
  brandLogo,
  mobileMenuOpen,
  onOpenMenu,
  onOpenQuickSearch,
}: AdminMobileHeaderProps) {
  return (
    <HStack as="header" className="ad-mobile-top" justify="between" align="center" gap={2}>
      <button
        type="button"
        className="ad-pill ad-menu-trigger"
        aria-label="Abrir menú"
        aria-expanded={mobileMenuOpen}
        onClick={onOpenMenu}
      >
        <Menu size={16} aria-hidden="true" />
        <Text color="inherit" size="sm" weight="semibold">
          Menú
        </Text>
      </button>
      <NextLink
        href="/admin"
        aria-label={`${salonName}, inicio del panel`}
        className="ad-logo-link"
      >
        <img
          src={brandLogo}
          alt={salonName}
          width={110}
          height={32}
          className="ad-logo-sm"
        />
      </NextLink>
      <button
        type="button"
        className="ad-pill ad-icon-pill"
        aria-label="Buscar clienta o cita"
        onClick={onOpenQuickSearch}
      >
        <Search size={16} aria-hidden="true" />
      </button>
    </HStack>
  );
}

interface AdminMobileNavProps {
  data: AdminOverviewPayload;
  pathname: string;
  brandLogo: string;
  mobileMenuOpen: boolean;
  primaryNavGroups: NavGroupConfig[];
  secondaryNavItems: NavItemConfig[];
  isSecondaryRouteActive: boolean;
  isMoreToolsOpen: boolean;
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
  onMobileMenuOpenChange: (open: boolean) => void;
  onToggleMoreTools: () => void;
  onPrefetchRoute: (routeId: string, href: string) => void;
  onExpandSidebar: () => void;
  onToggleMute: () => void;
  onTestSound: () => void;
  onToggleTheme: () => void;
  onSwitchDemoUser: (email: string) => void;
  onLogout: () => void;
}

export function AdminMobileNav({
  data,
  pathname,
  brandLogo,
  mobileMenuOpen,
  primaryNavGroups,
  secondaryNavItems,
  isSecondaryRouteActive,
  isMoreToolsOpen,
  soundActive,
  soundFeedbackMessage,
  isDark,
  onMobileMenuOpenChange,
  onToggleMoreTools,
  onPrefetchRoute,
  onExpandSidebar,
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
}: AdminMobileNavProps) {
  const role = data.session.user.role;
  const canClients = roleCanAccess(role, 'clients');
  const bookingDisplayLink = getDisplayBookingHost(data.integration.appUrl);
  const bookingCopyUrl = getBookingCopyUrl(data.integration.appUrl);
  const closeDrawer = () => onMobileMenuOpenChange(false);

  return (
    <>
      <nav className="ad-bottom" aria-label="Accesos rápidos">
        <NextLink
          href="/admin"
          className="ad-bottom-item"
          data-on={pathname === '/admin' ? 'true' : 'false'}
          aria-current={pathname === '/admin' ? 'page' : undefined}
          onMouseEnter={() => onPrefetchRoute('overview', '/admin')}
          onFocus={() => onPrefetchRoute('overview', '/admin')}
          onTouchStart={() => onPrefetchRoute('overview', '/admin')}
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
          onMouseEnter={() => onPrefetchRoute('bookings', '/admin/citas')}
          onFocus={() => onPrefetchRoute('bookings', '/admin/citas')}
          onTouchStart={() => onPrefetchRoute('bookings', '/admin/citas')}
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
          onMouseEnter={() => onPrefetchRoute('bookings', '/admin/citas?new=1')}
          onFocus={() => onPrefetchRoute('bookings', '/admin/citas?new=1')}
          onTouchStart={() => onPrefetchRoute('bookings', '/admin/citas?new=1')}
        >
          <Plus size={24} aria-hidden="true" />
        </NextLink>

        {canClients ? (
          <NextLink
            href="/admin/clientas"
            className="ad-bottom-item"
            data-on={pathname === '/admin/clientas' ? 'true' : 'false'}
            aria-current={pathname === '/admin/clientas' ? 'page' : undefined}
            onMouseEnter={() => onPrefetchRoute('clients', '/admin/clientas')}
            onFocus={() => onPrefetchRoute('clients', '/admin/clientas')}
            onTouchStart={() => onPrefetchRoute('clients', '/admin/clientas')}
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
            onMouseEnter={() => onPrefetchRoute('availability', '/admin/disponibilidad')}
            onFocus={() => onPrefetchRoute('availability', '/admin/disponibilidad')}
            onTouchStart={() => onPrefetchRoute('availability', '/admin/disponibilidad')}
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
          onMouseEnter={() => onPrefetchRoute('cash', '/admin/caja')}
          onFocus={() => onPrefetchRoute('cash', '/admin/caja')}
          onTouchStart={() => onPrefetchRoute('cash', '/admin/caja')}
        >
          <Wallet size={20} aria-hidden="true" />
          <Text color="inherit" size="sm" weight="semibold" className="ad-bottom-label">
            Caja
          </Text>
        </NextLink>
      </nav>

      <MobileNav
        isOpen={mobileMenuOpen}
        onOpenChange={onMobileMenuOpenChange}
        label="Menú del salón"
        width={300}
        header={
          <NextLink
            href="/admin"
            aria-label={`${data.settings.name}, inicio del panel`}
            className="ad-logo-link"
            onClick={closeDrawer}
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
          <CopyableField
            label="Tu link de citas"
            value={bookingCopyUrl}
            displayValue={bookingDisplayLink}
            copyLabel="Copiar"
            copiedLabel="¡Copiado!"
            feedbackMessage="¡Link de citas copiado!"
          />
          <AdminNavGroups
            pathname={pathname}
            primaryNavGroups={primaryNavGroups}
            secondaryNavItems={secondaryNavItems}
            isSecondaryRouteActive={isSecondaryRouteActive}
            isMoreToolsOpen={isMoreToolsOpen}
            isCompactRail={false}
            idPrefix="drawer"
            onToggleMoreTools={onToggleMoreTools}
            onPrefetchRoute={onPrefetchRoute}
            onItemClick={closeDrawer}
          />
          <AdminFooterControls
            data={data}
            isCompactRail={false}
            soundActive={soundActive}
            soundFeedbackMessage={soundFeedbackMessage}
            isDark={isDark}
            onExpandSidebar={onExpandSidebar}
            onToggleMute={onToggleMute}
            onTestSound={onTestSound}
            onToggleTheme={onToggleTheme}
            onSwitchDemoUser={onSwitchDemoUser}
            onLogout={onLogout}
            closeDrawer={closeDrawer}
          />
        </VStack>
      </MobileNav>
    </>
  );
}
