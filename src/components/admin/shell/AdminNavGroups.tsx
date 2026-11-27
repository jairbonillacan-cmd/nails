'use client';

import type React from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  LayoutGrid,
  MessageCircle,
  Package,
  Palette,
  Plug,
  Scissors,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import {
  computeCollapsedSectionBadge,
  computeCollapsedStaffBadge,
  useSidebarSections,
  type SidebarSectionId,
} from '@/lib/hooks/useSidebarSections';
import type {
  NavGroupConfig,
  NavIconId,
  NavItemConfig,
  SidebarStaffRow,
} from './adminNavConfig';

function renderNavIcon(iconId: NavIconId): React.ReactNode {
  switch (iconId) {
    case 'overview':
      return <LayoutGrid size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'bookings':
      return <CalendarDays size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'whatsapp':
      return <MessageCircle size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'clients':
      return <Users size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'cash':
      return <Wallet size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'services':
      return <Scissors size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'availability':
      return <Clock size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'team':
      return <UserCheck size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'brand':
      return <Palette size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'reports':
      return <BarChart3 size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'inventory':
      return <Package size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'integrations':
      return <Plug size={16} strokeWidth={1.85} aria-hidden="true" />;
    case 'onboarding':
      return <CheckCircle2 size={16} strokeWidth={1.85} aria-hidden="true" />;
  }
}

interface AdminNavGroupsProps {
  pathname: string;
  primaryNavGroups: NavGroupConfig[];
  footerNavItems: NavItemConfig[];
  staffRows: SidebarStaffRow[];
  isCompactRail: boolean;
  idPrefix?: 'side' | 'drawer';
  onPrefetchRoute: (routeId: string, href: string) => void;
  onItemClick?: () => void;
}

export function AdminNavGroups({
  pathname,
  primaryNavGroups,
  footerNavItems,
  staffRows,
  isCompactRail,
  idPrefix = 'side',
  onPrefetchRoute,
  onItemClick,
}: AdminNavGroupsProps) {
  const { isSectionCollapsed, toggleSection } = useSidebarSections({
    pathname,
    primaryNavGroups,
    footerNavItems,
  });

  const renderSectionHeader = (params: {
    sectionId: SidebarSectionId;
    title: string;
    panelId: string;
    collapsed: boolean;
    collapsedBadge: string | null;
  }) => (
    <button
      type="button"
      className="ad-nav-sec-btn fx-press"
      aria-expanded={!params.collapsed}
      aria-controls={params.panelId}
      data-collapsed={params.collapsed ? 'true' : 'false'}
      onClick={() => toggleSection(params.sectionId)}
    >
      <Text color="inherit" className="ad-nav-sec-title">
        {params.title}
      </Text>
      <HStack gap={1.5} align="center" style={{ flexShrink: 0 }}>
        {params.collapsed && params.collapsedBadge ? (
          <Text color="inherit" weight="semibold" className="ad-nav-count" hasTabularNumbers>
            {params.collapsedBadge}
          </Text>
        ) : null}
        <ChevronDown
          size={13}
          strokeWidth={2}
          aria-hidden="true"
          className="ad-nav-chev"
          data-collapsed={params.collapsed ? 'true' : 'false'}
        />
      </HStack>
    </button>
  );

  const renderNavItem = (item: NavItemConfig) => {
    const isSelected = pathname === item.matchPath;
    const tooltipText = item.badge ? `${item.label} (${item.badge})` : item.label;
    const linkNode = (
      <NextLink
        href={item.href}
        className={isCompactRail ? 'ad-nav ad-nav-compact fx-press' : 'ad-nav fx-press'}
        data-on={isSelected ? 'true' : 'false'}
        aria-current={isSelected ? 'page' : undefined}
        aria-label={isCompactRail ? tooltipText : undefined}
        onMouseEnter={() => onPrefetchRoute(item.id, item.href)}
        onFocus={() => onPrefetchRoute(item.id, item.href)}
        onClick={onItemClick}
      >
        <Text color="inherit" className="ad-nav-icon" aria-hidden="true">
          {renderNavIcon(item.id)}
        </Text>
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
            <Text color="inherit" weight="semibold" className="ad-nav-count" hasTabularNumbers>
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

  const staffCollapsed = !isCompactRail && isSectionCollapsed('profesionales');
  const staffPanelId = `ad-nav-sec-${idPrefix}-profesionales`;
  const staffBadge = computeCollapsedStaffBadge(staffRows);

  const footerCollapsed = !isCompactRail && isSectionCollapsed('mas');
  const footerPanelId = `ad-nav-sec-${idPrefix}-mas`;
  const footerBadge = computeCollapsedSectionBadge(footerNavItems);

  return (
    <VStack as="nav" aria-label="Panel" gap={isCompactRail ? 2 : 3} className="ad-nav-wrap">
      {primaryNavGroups.map((group, groupIdx) => {
        const collapsed = !isCompactRail && isSectionCollapsed(group.id);
        const panelId = `ad-nav-sec-${idPrefix}-${group.id}`;
        const collapsedBadge = computeCollapsedSectionBadge(group.items);
        return (
          <VStack
            key={group.id}
            gap={1}
            className={isCompactRail && groupIdx > 0 ? 'ad-nav-group-rail' : undefined}
          >
            {!isCompactRail
              ? renderSectionHeader({
                  sectionId: group.id,
                  title: group.title,
                  panelId,
                  collapsed,
                  collapsedBadge,
                })
              : null}
            <VStack
              as="ul"
              id={panelId}
              gap={0.5}
              className="ad-nav-list ad-nav-sec-panel"
              data-collapsed={collapsed ? 'true' : 'false'}
              hidden={collapsed}
            >
              {group.items.map(renderNavItem)}
            </VStack>
          </VStack>
        );
      })}

      {!isCompactRail && staffRows.length > 0 ? (
        <VStack gap={1}>
          {renderSectionHeader({
            sectionId: 'profesionales',
            title: 'Profesionales',
            panelId: staffPanelId,
            collapsed: staffCollapsed,
            collapsedBadge: staffBadge,
          })}
          <VStack
            as="ul"
            id={staffPanelId}
            gap={0.5}
            className="ad-nav-list ad-nav-sec-panel"
            data-collapsed={staffCollapsed ? 'true' : 'false'}
            hidden={staffCollapsed}
          >
            {staffRows.map((member) => (
              <li key={member.id}>
                <NextLink
                  href={member.href}
                  className="ad-nav ad-nav-staff fx-press"
                  onMouseEnter={() => onPrefetchRoute('bookings', member.href)}
                  onFocus={() => onPrefetchRoute('bookings', member.href)}
                  onClick={onItemClick}
                >
                  <Text
                    className="ad-staff-dot"
                    data-active={member.todayCount > 0 ? 'true' : 'false'}
                    aria-hidden="true"
                  >
                    {'\u200B'}
                  </Text>
                  <Text color="inherit" className="ad-nav-label">
                    {member.firstName}
                  </Text>
                  <Text type="supporting" className="ad-staff-meta" hasTabularNumbers>
                    {member.todayCount > 0 ? `${member.todayCount} hoy` : 'Libre'}
                  </Text>
                </NextLink>
              </li>
            ))}
          </VStack>
        </VStack>
      ) : null}

      {footerNavItems.length > 0 ? (
        <VStack
          gap={1}
          className={isCompactRail ? 'ad-nav-group-rail ad-nav-utility' : 'ad-nav-utility'}
        >
          {!isCompactRail
            ? renderSectionHeader({
                sectionId: 'mas',
                title: 'Más',
                panelId: footerPanelId,
                collapsed: footerCollapsed,
                collapsedBadge: footerBadge,
              })
            : null}
          <VStack
            as="ul"
            id={footerPanelId}
            gap={0.5}
            className="ad-nav-list ad-nav-sec-panel"
            data-collapsed={footerCollapsed ? 'true' : 'false'}
            hidden={footerCollapsed}
          >
            {footerNavItems.map(renderNavItem)}
          </VStack>
        </VStack>
      ) : null}
    </VStack>
  );
}
