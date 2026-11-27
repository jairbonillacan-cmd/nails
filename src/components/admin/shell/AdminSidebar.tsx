'use client';

import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { AdminOverviewPayload } from '../AdminProvider';
import type { NavGroupConfig, NavItemConfig, SidebarStaffRow } from './adminNavConfig';
import { AdminNavGroups } from './AdminNavGroups';
import { AdminFooterControls } from './AdminFooterControls';

interface AdminSidebarProps {
  data: AdminOverviewPayload;
  pathname: string;
  brandLogo: string;
  sidebarCollapsed: boolean;
  primaryNavGroups: NavGroupConfig[];
  footerNavItems: NavItemConfig[];
  staffRows: SidebarStaffRow[];
  soundActive: boolean;
  soundFeedbackMessage: string | null;
  isDark: boolean;
  onToggleSidebar: () => void;
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
  footerNavItems,
  staffRows,
  soundActive,
  soundFeedbackMessage,
  isDark,
  onToggleSidebar,
  onPrefetchRoute,
  onToggleMute,
  onTestSound,
  onToggleTheme,
  onSwitchDemoUser,
  onLogout,
}: AdminSidebarProps) {
  return (
    <VStack
      as="aside"
      className="ad-side"
      data-collapsed={sidebarCollapsed ? 'true' : 'false'}
      gap={4}
      aria-label="Menú lateral"
    >
      {sidebarCollapsed ? (
        <VStack align="center" gap={2} className="ad-side-top-compact">
          <Tooltip content={data.settings.name} placement="end" hasHoverIndication={false}>
            <NextLink
              href="/admin"
              aria-label={`${data.settings.name}, inicio del panel`}
              className="ad-logo-link ad-logo-compact fx-press"
            >
              <img
                src={brandLogo}
                alt=""
                width={40}
                height={11}
                aria-hidden="true"
                className="ad-logo"
              />
            </NextLink>
          </Tooltip>
          <Tooltip content="Expandir barra (Ctrl B)" placement="end" hasHoverIndication={false}>
            <button
              type="button"
              className="ad-side-toggle ad-side-toggle-compact fx-press"
              aria-label="Expandir barra lateral"
              aria-expanded={false}
              onClick={onToggleSidebar}
            >
              <PanelLeftOpen size={16} strokeWidth={1.85} aria-hidden="true" />
            </button>
          </Tooltip>
        </VStack>
      ) : (
        <HStack justify="between" align="center" gap={2} className="ad-side-top">
          <NextLink
            href="/admin"
            aria-label={`${data.settings.name}, inicio del panel`}
            className="ad-logo-link"
          >
            <img
              src={brandLogo}
              alt={data.settings.name}
              width={118}
              height={32}
              className="ad-logo"
            />
          </NextLink>
          <Tooltip content="Retraer barra (Ctrl B)" placement="end" hasHoverIndication={false}>
            <button
              type="button"
              className="ad-side-toggle fx-press"
              aria-label="Retraer barra lateral"
              aria-expanded={true}
              onClick={onToggleSidebar}
            >
              <PanelLeftClose size={16} strokeWidth={1.85} aria-hidden="true" />
            </button>
          </Tooltip>
        </HStack>
      )}

      <AdminNavGroups
        pathname={pathname}
        primaryNavGroups={primaryNavGroups}
        footerNavItems={footerNavItems}
        staffRows={staffRows}
        isCompactRail={sidebarCollapsed}
        onPrefetchRoute={onPrefetchRoute}
      />

      <AdminFooterControls
        data={data}
        isCompactRail={sidebarCollapsed}
        soundActive={soundActive}
        soundFeedbackMessage={soundFeedbackMessage}
        isDark={isDark}
        onToggleMute={onToggleMute}
        onTestSound={onTestSound}
        onToggleTheme={onToggleTheme}
        onSwitchDemoUser={onSwitchDemoUser}
        onLogout={onLogout}
      />
    </VStack>
  );
}
