'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@astryxdesign/core/AppShell';
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from '@astryxdesign/core/SideNav';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import {
  CalendarDays,
  Clock,
  Copy,
  ExternalLink,
  Home,
  LogOut,
  Moon,
  Package,
  Palette,
  Plug,
  Scissors,
  Sparkles,
  Sun,
  Users,
  Wallet,
} from 'lucide-react';
import { useAdminData } from './AdminProvider';
import { useSalonAppearance } from '../SalonThemeProvider';
import { roleCanAccess } from '@/lib/rbac';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';

const ROLE_LABELS = {
  owner: 'Dueña (Owner)',
  admin: 'Admin / Recepción',
  specialist: 'Manicurista',
} as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, loading, switchDemoUser, logout } = useAdminData();
  const { mode, setMode } = useSalonAppearance();
  const copyFeedback = useEphemeralMessage(2000);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (loading || !data) {
    return (
      <VStack padding={8} gap={3} maxWidth={480} style={{ marginInline: 'auto' }}>
        <Text weight="semibold">Cargando panel de administración...</Text>
        <ProgressBar label="Cargando" isIndeterminate />
      </VStack>
    );
  }

  const role = data.session.user.role;

  const copyBookingLink = async () => {
    const url = `${window.location.origin}/reservar`;
    try {
      await navigator.clipboard.writeText(url);
      copyFeedback.show('¡Link copiado!');
    } catch {
      return;
    }
  };

  return (
    <AppShell
      height="fill"
      variant="wash"
      contentPadding={6}
      banner={
        data.integration.mode === 'demo' ? (
          <Banner
            container="section"
            status="info"
            title={`Modo Demo activo (${ROLE_LABELS[role]})`}
            description="Todo funciona y persiste localmente. Cuando agregues tus llaves en .env se activarán Supabase, Google Calendar, Resend, Meta WhatsApp y Twilio."
            endContent={
              <HStack gap={2} align="center">
                <Selector
                  label="Cambiar rol demo"
                  isLabelHidden
                  size="sm"
                  value={data.session.user.email}
                  onChange={(val) => {
                    if (val) void switchDemoUser(val);
                  }}
                  options={data.adminUsers
                    .filter((u) => u.isActive)
                    .map((u) => ({
                      value: u.email,
                      label: `${u.fullName} · ${ROLE_LABELS[u.role]}`,
                    }))}
                />
              </HStack>
            }
          />
        ) : undefined
      }
      sideNav={
        <SideNav
          collapsible={{ hasButton: true, buttonLabel: 'Contraer menú' }}
          header={
            <SideNavHeading
              heading={data.settings.name}
              subheading={ROLE_LABELS[role]}
              headingHref="/admin"
              icon={<Sparkles size={18} aria-hidden="true" />}
            />
          }
          topContent={
            <VStack gap={1.5} paddingInline={2} paddingBlockEnd={2}>
              <Button
                label={copyFeedback.message ?? 'Copiar link de citas'}
                variant="secondary"
                size="sm"
                width="100%"
                icon={<Copy size={14} />}
                onClick={copyBookingLink}
              />
            </VStack>
          }
          footer={
            <VStack gap={1} paddingInline={2} paddingBlock={2}>
              <Divider />
              <SideNavItem
                label="Ver sitio público"
                href="/"
                icon={<ExternalLink size={16} />}
              />
              <SideNavItem
                label={mode === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                icon={mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              />
              <SideNavItem
                label="Cerrar sesión"
                icon={<LogOut size={16} />}
                onClick={() => void logout()}
              />
            </VStack>
          }
        >
          <SideNavSection title="Operación">
            <SideNavItem
              label="Inicio"
              href="/admin"
              icon={<Home size={16} />}
              isSelected={pathname === '/admin'}
            />
            <SideNavItem
              label="Citas y Agenda"
              href="/admin/citas"
              icon={<CalendarDays size={16} />}
              isSelected={pathname === '/admin/citas'}
              endContent={
                data.kpis.pendingConfirmationsCount > 0 ? (
                  <Badge
                    variant="warning"
                    label={String(data.kpis.pendingConfirmationsCount)}
                  />
                ) : undefined
              }
            />
            {roleCanAccess(role, 'services') ? (
              <SideNavItem
                label="Servicios y Extras"
                href="/admin/servicios"
                icon={<Scissors size={16} />}
                isSelected={pathname === '/admin/servicios'}
              />
            ) : null}
            <SideNavItem
              label="Disponibilidad"
              href="/admin/disponibilidad"
              icon={<Clock size={16} />}
              isSelected={pathname === '/admin/disponibilidad'}
            />
          </SideNavSection>

          <SideNavSection title="Negocio y Crecimiento">
            {roleCanAccess(role, 'clients') ? (
              <SideNavItem
                label="Clientas"
                href="/admin/clientas"
                icon={<Users size={16} />}
                isSelected={pathname === '/admin/clientas'}
              />
            ) : null}
            <SideNavItem
              label="Caja, Comisiones y Cupones"
              href="/admin/caja"
              icon={<Wallet size={16} />}
              isSelected={pathname === '/admin/caja'}
            />
            {roleCanAccess(role, 'inventory') ? (
              <SideNavItem
                label="Inventario"
                href="/admin/inventario"
                icon={<Package size={16} />}
                isSelected={pathname === '/admin/inventario'}
                endContent={
                  data.kpis.lowStockCount > 0 ? (
                    <Badge
                      variant="error"
                      label={String(data.kpis.lowStockCount)}
                    />
                  ) : undefined
                }
              />
            ) : null}
          </SideNavSection>

          {roleCanAccess(role, 'team') ||
          roleCanAccess(role, 'brand') ||
          roleCanAccess(role, 'integrations') ? (
            <SideNavSection title="Configuración">
              {roleCanAccess(role, 'team') ? (
                <SideNavItem
                  label="Equipo y Admins"
                  href="/admin/equipo"
                  icon={<Users size={16} />}
                  isSelected={pathname === '/admin/equipo'}
                />
              ) : null}
              {roleCanAccess(role, 'brand') ? (
                <SideNavItem
                  label="Marca, Tema y Landing"
                  href="/admin/marca"
                  icon={<Palette size={16} />}
                  isSelected={pathname === '/admin/marca'}
                />
              ) : null}
              {roleCanAccess(role, 'integrations') ? (
                <SideNavItem
                  label="Integraciones y WhatsApp"
                  href="/admin/integraciones"
                  icon={<Plug size={16} />}
                  isSelected={pathname === '/admin/integraciones'}
                />
              ) : null}
            </SideNavSection>
          ) : null}
        </SideNav>
      }
    >
      <VStack gap={5} maxWidth={1280} width="100%" style={{ marginInline: 'auto' }}>
        {children}
      </VStack>
    </AppShell>
  );
}
