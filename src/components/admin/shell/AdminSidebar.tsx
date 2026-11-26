'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { Copy, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { AdminOverviewPayload } from '../AdminProvider';
import {
  getBookingCopyUrl,
  getDisplayBookingHost,
  type NavGroupConfig,
  type NavItemConfig,
} from './adminNavConfig';
import { AdminNavGroups } from './AdminNavGroups';
import { AdminFooterControls } from './AdminFooterControls';

interface AdminSidebarProps {
  data: AdminOverviewPayload;
  pathname: string;
  brandLogo: string;
  sidebarCollapsed: boolean;
  primaryNavGroups: NavGroupConfig[];
  secondaryNavItems: NavItemConfig[];
  isSecondaryRouteActive: boolean;
  isMoreToolsOpen: boolean;
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
  onToggleSidebar: () => void;
  onOpenQuickSearch: () => void;
  onToggleMoreTools: () => void;
  onPrefetchRoute: (routeId: string, href: string) => void;
  onToggleMute: () => void;
  onTestSound: () => void;
  onToggleTheme: () => void;
  onSwitchDemoUser: (email: string) => void;
  onLogout: () => void;
}

export function AdminSidebar({
  data,
  pathname,
  brandLogo,
  sidebarCollapsed,
  primaryNavGroups,
  secondaryNavItems,
  isSecondaryRouteActive,
  isMoreToolsOpen,
  soundActive,
  soundFeedbackMessage,
  isDark,
  onToggleSidebar,
  onOpenQuickSearch,
  onToggleMoreTools,
  onPrefetchRoute,
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
}: AdminSidebarProps) {
  const { copied, feedback, copy } = useCopyToClipboard(2200);
  const bookingDisplayLink = getDisplayBookingHost(data.integration.appUrl);

  const handleCopyBookingLink = () => {
    void copy(
      getBookingCopyUrl(data.integration.appUrl),
      '¡Link de citas copiado!',
      'Copia /reservar',
    );
  };

  return (
    <VStack
      as="aside"
      className="ad-side"
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      gap={3}
      aria-label="Menú lateral"
    >
      <Text
        type="supporting"
        color="secondary"
        role="status"
        aria-live="polite"
        className="rb-sr-only"
      >
        {feedback ?? ''}
      </Text>

      {sidebarCollapsed ? (
        <VStack gap={1.5} align="center" className="ad-side-top-compact">
          <Tooltip content="Expandir barra (Ctrl B)" placement="end" hasHoverIndication={false}>
            <button
              type="button"
              className="ad-rail-btn"
              aria-label="Expandir barra lateral"
              aria-expanded={false}
              onClick={onToggleSidebar}
            >
              <PanelLeftOpen size={17} strokeWidth={1.85} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip content="Buscar (Ctrl K)" placement="end" hasHoverIndication={false}>
            <button
              type="button"
              className="ad-rail-btn"
              aria-label="Buscar clienta o cita"
              onClick={onOpenQuickSearch}
            >
              <Search size={16} strokeWidth={1.85} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip
            content={copied ? '¡Link de citas copiado!' : 'Copiar tu link de citas'}
            placement="end"
            hasHoverIndication={false}
          >
            <button
              type="button"
              className="ad-rail-btn fx-press"
              aria-label="Copiar enlace de página de citas"
              onClick={handleCopyBookingLink}
            >
              <Copy size={16} strokeWidth={1.85} aria-hidden="true" />
            </button>
          </Tooltip>
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
                  onClick={onOpenQuickSearch}
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
                  onClick={onToggleSidebar}
                >
                  <PanelLeftClose size={16} strokeWidth={1.85} aria-hidden="true" />
                </button>
              </Tooltip>
            </HStack>
          </HStack>
          <VStack gap={1}>
            <button
              type="button"
              className="ad-link-box fx-press"
              aria-label="Copiar enlace de página de citas"
              onClick={handleCopyBookingLink}
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
                className={copied ? 'fx-pop' : undefined}
              >
                {copied ? '¡Copiado!' : 'Copiar'}
              </Text>
            </button>
          </VStack>
        </VStack>
      )}

      <AdminNavGroups
        pathname={pathname}
        primaryNavGroups={primaryNavGroups}
        secondaryNavItems={secondaryNavItems}
        isSecondaryRouteActive={isSecondaryRouteActive}
        isMoreToolsOpen={isMoreToolsOpen}
        isCompactRail={sidebarCollapsed}
        idPrefix="side"
        onToggleMoreTools={onToggleMoreTools}
        onPrefetchRoute={onPrefetchRoute}
      />

      <AdminFooterControls
        data={data}
        isCompactRail={sidebarCollapsed}
        soundActive={soundActive}
        soundFeedbackMessage={soundFeedbackMessage}
        isDark={isDark}
        onExpandSidebar={onToggleSidebar}
        onToggleMute={onToggleMute}
        onTestSound={onTestSound}
        onToggleTheme={onToggleTheme}
        onSwitchDemoUser={onSwitchDemoUser}
        onLogout={onLogout}
      />
    </VStack>
  );
}
