'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { CalendarDays, Search, Sparkles, Users } from 'lucide-react';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminOverviewPayload } from './AdminProvider';

interface AdminQuickSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  data: AdminOverviewPayload;
}

interface QuickNavTarget {
  label: string;
  description: string;
  href: string;
  keywords: string;
  visible: boolean;
}

export function AdminQuickSearchDialog({
  isOpen,
  onOpenChange,
  data,
}: AdminQuickSearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const role = data.session.user.role;
  const tz = data.settings.timezone || 'America/Mexico_City';
  const normalized = query.trim().toLowerCase();

  const navTargets = useMemo<QuickNavTarget[]>(
    () => [
      {
        label: 'Inicio',
        description: 'Resumen del día, pendientes y métricas',
        href: '/admin',
        keywords: 'inicio resumen dashboard hoy',
        visible: true,
      },
      {
        label: 'Nueva cita',
        description: 'Registrar una cita nueva en la agenda',
        href: '/admin/citas?new=1',
        keywords: 'nueva cita agendar crear reserva',
        visible: true,
      },
      {
        label: 'Citas y agenda',
        description: 'Horarios por artista, reprogramar y cobrar',
        href: '/admin/citas',
        keywords: 'citas agenda calendario horarios',
        visible: true,
      },
      {
        label: 'Clientas',
        description: 'Directorio A–Z, sellos, retención y ARCO',
        href: '/admin/clientas',
        keywords: 'clientas directorio crm fidelidad sellos',
        visible: roleCanAccess(role, 'clients'),
      },
      {
        label: 'Caja, comisiones y cupones',
        description: 'Corte de caja, anticipos, citas sin cobrar y cupones',
        href: '/admin/caja',
        keywords: 'caja cobros anticipos comisiones cupones propinas',
        visible: roleCanAccess(role, 'cash'),
      },
      {
        label: 'Servicios y extras',
        description: 'Catálogo de servicios, precios y duraciones',
        href: '/admin/servicios',
        keywords: 'servicios catalogo precios extras addons',
        visible: roleCanAccess(role, 'services'),
      },
      {
        label: 'Inventario',
        description: 'Existencias, entradas y alertas de stock bajo',
        href: '/admin/inventario',
        keywords: 'inventario stock insumos productos',
        visible: roleCanAccess(role, 'inventory'),
      },
      {
        label: 'Equipo y turnos',
        description: 'Manicuristas, comisiones y usuarios del panel',
        href: '/admin/equipo',
        keywords: 'equipo manicuristas staff usuarios roles',
        visible: roleCanAccess(role, 'team'),
      },
      {
        label: 'Disponibilidad',
        description: 'Turnos fijos, bloqueos, vacaciones y festivos MX',
        href: '/admin/disponibilidad',
        keywords: 'disponibilidad turnos horarios bloqueos vacaciones',
        visible: roleCanAccess(role, 'availability'),
      },
      {
        label: 'Página y marca',
        description: 'Colores, QR descargable, tarjeta de sellos y políticas',
        href: '/admin/marca',
        keywords: 'marca tema qr logo politicas fidelidad',
        visible: roleCanAccess(role, 'brand'),
      },
      {
        label: 'Integraciones',
        description: 'Google Calendar, WhatsApp, pagos y analítica',
        href: '/admin/integraciones',
        keywords: 'integraciones whatsapp google calendar mercado pago',
        visible: roleCanAccess(role, 'integrations'),
      },
      {
        label: 'Configuración inicial',
        description: 'Asistente de configuración del estudio',
        href: '/admin/onboarding',
        keywords: 'configuracion inicial onboarding asistente',
        visible: role === 'owner',
      },
    ],
    [role],
  );

  const matchedBookings = useMemo(() => {
    if (!normalized) return data.bookings.slice(0, 4);
    return data.bookings
      .filter((b) => {
        const haystack = `${b.bookingCode} ${b.client.fullName} ${b.client.phoneE164} ${b.service.name} ${b.staff.name}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 5);
  }, [data.bookings, normalized]);

  const matchedClients = useMemo(() => {
    if (!roleCanAccess(role, 'clients')) return [];
    if (!normalized) return data.clients.slice(0, 4);
    return data.clients
      .filter((c) => {
        const haystack = `${c.fullName} ${c.phoneE164} ${c.instagramHandle ?? ''} ${c.email ?? ''}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 5);
  }, [data.clients, normalized, role]);

  const matchedNav = useMemo(() => {
    const allowed = navTargets.filter((item) => item.visible);
    if (!normalized) return allowed.slice(0, 5);
    return allowed
      .filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalized))
      .slice(0, 6);
  }, [navTargets, normalized]);

  const handleNavigate = (href: string) => {
    onOpenChange(false);
    setQuery('');
    router.push(href);
  };

  const hasResults =
    matchedBookings.length > 0 || matchedClients.length > 0 || matchedNav.length > 0;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setQuery('');
      }}
      width={560}
      padding={5}
    >
      <DialogHeader
        title="Búsqueda rápida"
        subtitle="Encuentra clientas, citas por código o salta directo a cualquier sección."
        onOpenChange={onOpenChange}
      />
      <VStack gap={4} paddingBlockStart={3}>
        <TextInput
          label="Buscar en el panel"
          isLabelHidden
          placeholder="Nombre de clienta, código NL-..., servicio o sección..."
          value={query}
          onChange={setQuery}
          startIcon={<Search size={16} aria-hidden="true" />}
          hasClear
          hasAutoFocus
        />

        {!hasResults ? (
          <Text color="secondary" role="status">
            No encontramos resultados para «{query}».
          </Text>
        ) : (
          <VStack gap={3}>
            {matchedBookings.length > 0 ? (
              <VStack gap={1}>
                <HStack gap={1.5} align="center">
                  <CalendarDays size={14} aria-hidden="true" />
                  <Text type="label" color="secondary" weight="semibold">
                    Citas
                  </Text>
                </HStack>
                <List hasDividers density="compact">
                  {matchedBookings.map((b) => (
                    <ListItem
                      key={b.id}
                      label={`${b.client.fullName} — ${b.service.name}`}
                      description={
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {b.bookingCode} · {formatDateShortInTimezone(b.startAt, tz)} ·{' '}
                          {formatTimeInTimezone(b.startAt, tz)} · {b.staff.name}
                        </Text>
                      }
                      endContent={<Badge variant="neutral" label={b.bookingCode} />}
                      onClick={() => handleNavigate('/admin/citas')}
                    />
                  ))}
                </List>
              </VStack>
            ) : null}

            {matchedClients.length > 0 ? (
              <VStack gap={1}>
                <HStack gap={1.5} align="center">
                  <Users size={14} aria-hidden="true" />
                  <Text type="label" color="secondary" weight="semibold">
                    Clientas
                  </Text>
                </HStack>
                <List hasDividers density="compact">
                  {matchedClients.map((c) => (
                    <ListItem
                      key={c.id}
                      label={c.fullName}
                      description={
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {c.phoneE164}
                          {c.instagramHandle ? ` · ${c.instagramHandle}` : ''}
                        </Text>
                      }
                      onClick={() =>
                        handleNavigate(`/admin/clientas?q=${encodeURIComponent(c.phoneE164)}`)
                      }
                    />
                  ))}
                </List>
              </VStack>
            ) : null}

            {matchedNav.length > 0 ? (
              <VStack gap={1}>
                <HStack gap={1.5} align="center">
                  <Sparkles size={14} aria-hidden="true" />
                  <Text type="label" color="secondary" weight="semibold">
                    Accesos del panel
                  </Text>
                </HStack>
                <List hasDividers density="compact">
                  {matchedNav.map((item) => (
                    <ListItem
                      key={item.href}
                      label={item.label}
                      description={
                        <Text type="supporting" color="secondary">
                          {item.description}
                        </Text>
                      }
                      onClick={() => handleNavigate(item.href)}
                    />
                  ))}
                </List>
              </VStack>
            ) : null}
          </VStack>
        )}
      </VStack>
    </Dialog>
  );
}
