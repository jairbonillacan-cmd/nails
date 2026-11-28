'use client';

import { useState } from 'react';
import NextLink from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { Popover } from '@astryxdesign/core/Popover';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import {
  AlertTriangle,
  Bell,
  Check,
  Clock,
  MessageCircle,
  Package,
  PanelLeft,
  Plus,
  ReceiptText,
  Search,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { agendaHref, cajaHref, inventarioHref, whatsappHref } from '@/lib/admin-links';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminOverviewPayload } from '../AdminProvider';

interface AdminTopBarProps {
  data: AdminOverviewPayload;
  brandLogo: string;
  mobileMenuOpen: boolean;
  soundActive: boolean;
  onOpenMobileMenu: () => void;
  onOpenQuickSearch: () => void;
  onToggleMute: () => void;
}

export function AdminTopBar({
  data,
  brandLogo,
  mobileMenuOpen,
  soundActive,
  onOpenMobileMenu,
  onOpenQuickSearch,
  onToggleMute,
}: AdminTopBarProps) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const role = data.session.user.role;
  const pendingDepositsCount = data.pendingDeposits.length;
  const uncollectedCount = data.uncollectedBookings.length;
  const waitingCount = data.waitlist.filter((entry) => entry.status === 'waiting').length;
  const lowStockCount = roleCanAccess(role, 'inventory')
    ? data.inventory.filter((item) => item.isActive && item.stockQuantity <= item.minStockAlert).length
    : 0;
  const canSeeClients = roleCanAccess(role, 'clients');
  const canSeeWhatsApp = roleCanAccess(role, 'whatsapp');
  const canSeeIntegrations = roleCanAccess(role, 'integrations');
  const whatsappUsage = data.whatsappUsage;
  const unreadWhatsAppCount = canSeeWhatsApp
    ? (data.whatsappInboxSummary?.unreadCount ?? 0)
    : 0;
  const failedRemindersCount = canSeeWhatsApp
    ? (data.whatsappInboxSummary?.failedRemindersCount ?? 0)
    : 0;
  const hasWhatsAppAlert =
    (canSeeWhatsApp || canSeeIntegrations) &&
    (whatsappUsage?.alertLevel === 'warning_80' ||
      whatsappUsage?.alertLevel === 'limit_100');

  const totalAlerts =
    pendingDepositsCount +
    uncollectedCount +
    waitingCount +
    lowStockCount +
    unreadWhatsAppCount +
    failedRemindersCount +
    (hasWhatsAppAlert ? 1 : 0);

  const alertRows = [
    unreadWhatsAppCount > 0
      ? {
          id: 'whatsapp-unread',
          label: `${unreadWhatsAppCount} mensaje${unreadWhatsAppCount === 1 ? '' : 's'} sin leer en WhatsApp`,
          href: whatsappHref({ filter: 'unread' }),
          icon: <MessageCircle size={15} aria-hidden="true" />,
        }
      : null,
    failedRemindersCount > 0
      ? {
          id: 'whatsapp-failed-reminders',
          label: `${failedRemindersCount} recordatorio${failedRemindersCount === 1 ? '' : 's'} fallido${failedRemindersCount === 1 ? '' : 's'}`,
          href: whatsappHref({ tab: 'recordatorios', filter: 'failed' }),
          icon: <AlertTriangle size={15} aria-hidden="true" />,
        }
      : null,
    pendingDepositsCount > 0
      ? {
          id: 'deposits',
          label: `${pendingDepositsCount} anticipo${pendingDepositsCount === 1 ? '' : 's'} por confirmar`,
          href: cajaHref({ tab: 'anticipos' }),
          icon: <Wallet size={15} aria-hidden="true" />,
        }
      : null,
    uncollectedCount > 0
      ? {
          id: 'uncollected',
          label: `${uncollectedCount} cita${uncollectedCount === 1 ? '' : 's'} sin cobrar`,
          href: cajaHref({ tab: 'sin-cobrar' }),
          icon: <ReceiptText size={15} aria-hidden="true" />,
        }
      : null,
    waitingCount > 0
      ? {
          id: 'waitlist',
          label: `${waitingCount} en lista de espera`,
          href: agendaHref({ panel: 'waitlist' }),
          icon: <Clock size={15} aria-hidden="true" />,
        }
      : null,
    lowStockCount > 0
      ? {
          id: 'stock',
          label: `${lowStockCount} producto${lowStockCount === 1 ? '' : 's'} con bajo inventario`,
          href: inventarioHref({ filter: 'low_stock' }),
          icon: <Package size={15} aria-hidden="true" />,
        }
      : null,
    hasWhatsAppAlert && whatsappUsage
      ? {
          id: 'whatsapp-quota',
          label:
            whatsappUsage.alertLevel === 'limit_100'
              ? `Límite de WhatsApp alcanzado (${whatsappUsage.sentCount}/${whatsappUsage.quotaLimit})`
              : `WhatsApp al ${whatsappUsage.percentUsed}% del límite mensual`,
          href: whatsappHref({ tab: 'conexion' }),
          icon: <MessageCircle size={15} aria-hidden="true" />,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <HStack
      as="header"
      className="ad-topbar"
      justify="between"
      align="center"
      gap={2}
    >
      <HStack gap={2} align="center" className="ad-topbar-left">
        <button
          type="button"
          className="ad-topbar-icon ad-topbar-toggle-m ad-hide-s fx-press"
          aria-label="Abrir menú del salón"
          aria-expanded={mobileMenuOpen}
          onClick={onOpenMobileMenu}
        >
          <PanelLeft size={18} strokeWidth={1.85} aria-hidden="true" />
        </button>

        <HStack className="rb-m" align="center" gap={0}>
          <NextLink
            href="/admin"
            aria-label={`${data.settings.name}, inicio del panel`}
            className="ad-topbar-logo fx-press"
          >
            <img
              src={brandLogo}
              alt=""
              width={88}
              height={24}
              aria-hidden="true"
              className="ad-logo"
            />
          </NextLink>
        </HStack>

        <button
          type="button"
          className="ad-topbar-search fx-press"
          aria-label={canSeeClients ? 'Buscar clientas, citas o servicios' : 'Buscar citas o servicios'}
          onClick={onOpenQuickSearch}
        >
          <Search size={15} strokeWidth={1.85} className="ad-topbar-search-icon" aria-hidden="true" />
          <Text color="inherit" size="sm" className="ad-topbar-search-text">
            {canSeeClients ? 'Buscar clientas, citas, servicios…' : 'Buscar citas o servicios…'}
          </Text>
          <Text color="inherit" size="sm" className="ad-topbar-search-short">
            Buscar…
          </Text>
          <kbd className="ad-kbd ad-hide-s">Ctrl K</kbd>
        </button>
      </HStack>

      <HStack gap={2} align="center" className="ad-topbar-right">
        <Popover
          isOpen={alertsOpen}
          onOpenChange={setAlertsOpen}
          placement="below"
          alignment="end"
          presentation="adaptive"
          width="18.5rem"
          padding={2}
          label="Notificaciones y pendientes"
          content={
            <VStack gap={1.5} className="ad-alerts-popover">
              <HStack justify="between" align="center" paddingInline={2} paddingBlock={1}>
                <Text weight="semibold" size="sm">
                  Pendientes del salón
                </Text>
                <Text type="supporting" color="secondary" size="sm" hasTabularNumbers>
                  {totalAlerts}
                </Text>
              </HStack>
              <Divider />
              {alertRows.length === 0 ? (
                <HStack gap={2} align="center" padding={2}>
                  <Check size={15} aria-hidden="true" />
                  <Text type="supporting" color="secondary" size="sm">
                    Todo al día. Sin pendientes por atender.
                  </Text>
                </HStack>
              ) : (
                <VStack gap={0.5}>
                  {alertRows.map((row) => (
                    <NextLink
                      key={row.id}
                      href={row.href}
                      className="ad-menu-row fx-press"
                      onClick={() => setAlertsOpen(false)}
                    >
                      {row.icon}
                      <Text color="inherit" size="sm" weight="medium">
                        {row.label}
                      </Text>
                    </NextLink>
                  ))}
                </VStack>
              )}
              <Divider />
              <button
                type="button"
                className="ad-menu-row fx-press"
                aria-pressed={soundActive}
                onClick={onToggleMute}
              >
                {soundActive ? (
                  <Volume2 size={15} aria-hidden="true" />
                ) : (
                  <VolumeX size={15} aria-hidden="true" />
                )}
                <Text color="inherit" size="sm" weight="medium">
                  {soundActive ? 'Silenciar aviso sonoro' : 'Activar aviso sonoro'}
                </Text>
              </button>
            </VStack>
          }
        >
          <button
            type="button"
            className="ad-topbar-icon ad-topbar-bell fx-press"
            aria-label={
              totalAlerts > 0
                ? `Notificaciones (${totalAlerts} pendientes)`
                : 'Notificaciones'
            }
            aria-expanded={alertsOpen}
          >
            <Bell size={17} strokeWidth={1.85} aria-hidden="true" />
            {totalAlerts > 0 ? (
              <Text className="ad-bell-dot" aria-hidden="true">
                {'\u200B'}
              </Text>
            ) : null}
          </button>
        </Popover>

        <Button
          label="Nueva cita"
          variant="primary"
          size="md"
          className="ad-topbar-cta fx-press"
          icon={<Plus size={15} aria-hidden="true" />}
          href={agendaHref({ new: true })}
        />
      </HStack>
    </HStack>
  );
}
