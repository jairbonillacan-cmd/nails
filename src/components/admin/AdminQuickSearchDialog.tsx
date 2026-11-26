'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { CalendarDays, Search, Sparkles, Users } from 'lucide-react';
import { formatDateShortInTimezone, formatTimeInTimezone } from '@/lib/format';
import { useQuickSearchKeyboardNav } from '@/lib/hooks/useAdminCache';
import { roleCanAccess } from '@/lib/rbac';
import type { BookingStatus } from '@/lib/types';
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

interface FlatSearchOption {
  optionId: string;
  href: string;
}

function getSearchStatusMeta(status: BookingStatus): {
  label: string;
  tone: 'neutral' | 'warning' | 'accent' | 'success';
} {
  if (status === 'confirmed') return { label: 'Confirmada', tone: 'success' };
  if (status === 'pending_confirmation' || status === 'pending_payment') {
    return { label: 'Por confirmar', tone: 'warning' };
  }
  if (status === 'completed') return { label: 'Completada', tone: 'neutral' };
  if (status === 'no_show') return { label: 'No llegó', tone: 'warning' };
  return { label: 'Cancelada', tone: 'neutral' };
}

export function AdminQuickSearchDialog({
  isOpen,
  onOpenChange,
  data,
}: AdminQuickSearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const role = data.session.user.role;
  const tz = data.settings.timezone || 'America/Mexico_City';
  const normalized = query.trim().toLowerCase();

  const navTargets = useMemo<QuickNavTarget[]>(
    () => [
      {
        label: 'Inicio',
        description: 'Resumen del día, pendientes y tus citas de hoy',
        href: '/admin',
        keywords: 'inicio resumen hoy citas pendientes',
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
        label: 'Agenda',
        description: 'Horarios por manicurista, reprogramar y cobrar',
        href: '/admin/citas',
        keywords: 'citas agenda calendario horarios',
        visible: true,
      },
      {
        label: 'Clientas',
        description: 'Directorio, sellos, cumpleaños y mensajes',
        href: '/admin/clientas',
        keywords: 'clientas directorio sellos cumpleanos mensajes paquetes',
        visible: roleCanAccess(role, 'clients'),
      },
      {
        label: 'Caja',
        description: 'Corte del día, anticipos, comisiones y promociones',
        href: '/admin/caja',
        keywords: 'caja cobros anticipos comisiones cupones propinas paquetes',
        visible: roleCanAccess(role, 'cash'),
      },
      {
        label: 'Servicios',
        description: 'Precios, duraciones, fotos y extras',
        href: '/admin/servicios',
        keywords: 'servicios catalogo precios extras disenos',
        visible: roleCanAccess(role, 'services'),
      },
      {
        label: 'Horarios',
        description: 'Turnos de trabajo, descansos, vacaciones y festivos',
        href: '/admin/disponibilidad',
        keywords: 'horarios disponibilidad turnos descansos vacaciones festivos',
        visible: roleCanAccess(role, 'availability'),
      },
      {
        label: 'Equipo',
        description: 'Manicuristas, comisiones y accesos del salón',
        href: '/admin/equipo',
        keywords: 'equipo manicuristas comisiones accesos roles',
        visible: roleCanAccess(role, 'team'),
      },
      {
        label: 'Mi página',
        description: 'Logo, colores, código QR y tarjeta de sellos',
        href: '/admin/marca',
        keywords: 'mi pagina marca colores qr logo tarjeta sellos reglas',
        visible: roleCanAccess(role, 'brand'),
      },
      {
        label: 'Reportes',
        description: 'Días con más citas, ocupación y servicios más rentables',
        href: '/admin/reportes',
        keywords: 'reportes ocupacion dias horas ventas servicios cancelaciones',
        visible: roleCanAccess(role, 'reports'),
      },
      {
        label: 'Inventario',
        description: 'Productos, existencias y alertas de poco material',
        href: '/admin/inventario',
        keywords: 'inventario stock material productos insumos',
        visible: roleCanAccess(role, 'inventory'),
      },
      {
        label: 'Conexiones',
        description: 'Google Calendar, recordatorios por WhatsApp y cobros',
        href: '/admin/integraciones',
        keywords: 'conexiones whatsapp google calendar mercado pago spei',
        visible: roleCanAccess(role, 'integrations'),
      },
      {
        label: 'Guía inicial',
        description: 'Pasos rápidos para dejar listo tu salón',
        href: '/admin/onboarding',
        keywords: 'guia inicial configurar pasos salon',
        visible: role === 'owner',
      },
      {
        label: 'Portal de clientas (/mis-citas)',
        description: 'Página donde tus clientas consultan sus citas y sellos',
        href: '/mis-citas',
        keywords: 'mis citas portal clientas historial sellos paquetes',
        visible: true,
      },
    ],
    [role],
  );

  const matchedBookings = useMemo(() => {
    if (!normalized) return data.bookings.slice(0, 4);
    return data.bookings
      .filter((b) => {
        const haystack =
          `${b.bookingCode} ${b.client.fullName} ${b.client.phoneE164} ${b.clientInstagram ?? b.client.instagramHandle ?? ''} ${b.service.name} ${b.staff.name}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 5);
  }, [data.bookings, normalized]);

  const matchedClients = useMemo(() => {
    if (!roleCanAccess(role, 'clients')) return [];
    if (!normalized) return data.clients.slice(0, 4);
    return data.clients
      .filter((c) => {
        const haystack =
          `${c.fullName} ${c.phoneE164} ${c.instagramHandle ?? ''} ${c.email ?? ''}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 5);
  }, [data.clients, normalized, role]);

  const matchedNav = useMemo(() => {
    const allowed = navTargets.filter((item) => item.visible);
    if (!normalized) return allowed.slice(0, 5);
    return allowed
      .filter((item) =>
        `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalized),
      )
      .slice(0, 6);
  }, [navTargets, normalized]);

  const flatOptions = useMemo<FlatSearchOption[]>(() => {
    const list: FlatSearchOption[] = [];
    for (const b of matchedBookings) {
      list.push({
        optionId: `ad-search-opt-booking-${b.id}`,
        href: `/admin/citas?q=${encodeURIComponent(b.bookingCode)}`,
      });
    }
    for (const c of matchedClients) {
      list.push({
        optionId: `ad-search-opt-client-${c.id}`,
        href: `/admin/clientas?q=${encodeURIComponent(c.phoneE164)}`,
      });
    }
    matchedNav.forEach((item, idx) => {
      list.push({
        optionId: `ad-search-opt-nav-${idx}`,
        href: item.href,
      });
    });
    return list;
  }, [matchedBookings, matchedClients, matchedNav]);

  const safeActiveIndex =
    flatOptions.length === 0 ? -1 : Math.min(activeIndex, flatOptions.length - 1);
  const activeOption = safeActiveIndex >= 0 ? flatOptions[safeActiveIndex] : undefined;

  const handleClose = useCallback(() => {
    onOpenChange(false);
    setQuery('');
    setActiveIndex(0);
  }, [onOpenChange]);

  const handleNavigate = useCallback(
    (href: string) => {
      handleClose();
      router.push(href);
    },
    [handleClose, router],
  );

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setActiveIndex(0);
  };

  const scrollOptionIntoView = useCallback((optionId: string | undefined) => {
    if (!optionId || typeof document === 'undefined') return;
    document.getElementById(optionId)?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleMove = useCallback(
    (delta: -1 | 1 | 'first' | 'last') => {
      if (flatOptions.length === 0) return;
      const nextIndex =
        delta === 'first'
          ? 0
          : delta === 'last'
            ? flatOptions.length - 1
            : delta === 1
              ? (safeActiveIndex + 1) % flatOptions.length
              : safeActiveIndex <= 0
                ? flatOptions.length - 1
                : safeActiveIndex - 1;
      setActiveIndex(nextIndex);
      scrollOptionIntoView(flatOptions[nextIndex]?.optionId);
    },
    [flatOptions, safeActiveIndex, scrollOptionIntoView],
  );

  const handleSelectActive = useCallback(() => {
    if (activeOption) {
      handleNavigate(activeOption.href);
    }
  }, [activeOption, handleNavigate]);

  useQuickSearchKeyboardNav({
    isOpen,
    itemCount: flatOptions.length,
    inputRef,
    onMove: handleMove,
    onSelectActive: handleSelectActive,
    onClose: handleClose,
  });

  const hasResults = flatOptions.length > 0;
  const clientsOffset = matchedBookings.length;
  const navOffset = matchedBookings.length + matchedClients.length;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) {
          setQuery('');
          setActiveIndex(0);
        }
      }}
      width={560}
      padding={5}
    >
      <DialogHeader
        title="Búsqueda rápida"
        subtitle="Encuentra clientas, citas por código o salta directo a cualquier sección."
        onOpenChange={onOpenChange}
      />
      <VStack gap={4} paddingBlockStart={3} className="fx-sheet-in">
        <TextInput
          ref={inputRef}
          label="Buscar en el panel"
          isLabelHidden
          placeholder="Nombre de clienta, @instagram, código NL-..., servicio o sección..."
          value={query}
          onChange={handleQueryChange}
          role="combobox"
          aria-expanded={hasResults}
          aria-controls="ad-search-results"
          aria-autocomplete="list"
          aria-activedescendant={activeOption?.optionId}
          startIcon={<Search size={16} aria-hidden="true" />}
          hasClear
          hasAutoFocus
        />

        {!hasResults ? (
          <VStack className="ad-empty" gap={1} role="status">
            <Text weight="semibold">Sin coincidencias</Text>
            <Text type="supporting" color="secondary">
              No encontramos resultados para «{query}». Prueba con un nombre, teléfono o sección.
            </Text>
          </VStack>
        ) : (
          <VStack
            id="ad-search-results"
            role="listbox"
            aria-label="Resultados de búsqueda"
            gap={3}
          >
            {matchedBookings.length > 0 ? (
              <VStack className="ad-surface" gap={0}>
                <HStack gap={1.5} align="center" justify="between" className="ad-section-head">
                  <HStack gap={1.5} align="center">
                    <CalendarDays size={14} aria-hidden="true" />
                    <Text type="label" color="secondary" weight="semibold">
                      Citas
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {matchedBookings.length}
                  </Text>
                </HStack>
                <List hasDividers density="compact" role="presentation">
                  {matchedBookings.map((b, idx) => {
                    const statusMeta = getSearchStatusMeta(b.status);
                    const flatIdx = idx;
                    const isActive = safeActiveIndex === flatIdx;
                    const optionId = `ad-search-opt-booking-${b.id}`;
                    return (
                      <ListItem
                        key={b.id}
                        id={optionId}
                        role="option"
                        aria-selected={isActive}
                        isSelected={isActive}
                        className="ad-search-item"
                        data-active={isActive ? 'true' : 'false'}
                        label={`${b.client.fullName} — ${b.service.name}`}
                        description={
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {b.bookingCode} · {formatDateShortInTimezone(b.startAt, tz)} ·{' '}
                            {formatTimeInTimezone(b.startAt, tz, true)} · {b.staff.name}
                          </Text>
                        }
                        endContent={
                          <Text
                            color="inherit"
                            className="ad-chip"
                            data-tone={statusMeta.tone}
                          >
                            {statusMeta.label}
                          </Text>
                        }
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() =>
                          handleNavigate(`/admin/citas?q=${encodeURIComponent(b.bookingCode)}`)
                        }
                      />
                    );
                  })}
                </List>
              </VStack>
            ) : null}

            {matchedClients.length > 0 ? (
              <VStack className="ad-surface" gap={0}>
                <HStack gap={1.5} align="center" justify="between" className="ad-section-head">
                  <HStack gap={1.5} align="center">
                    <Users size={14} aria-hidden="true" />
                    <Text type="label" color="secondary" weight="semibold">
                      Clientas
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary" hasTabularNumbers>
                    {matchedClients.length}
                  </Text>
                </HStack>
                <List hasDividers density="compact" role="presentation">
                  {matchedClients.map((c, idx) => {
                    const flatIdx = clientsOffset + idx;
                    const isActive = safeActiveIndex === flatIdx;
                    const optionId = `ad-search-opt-client-${c.id}`;
                    return (
                      <ListItem
                        key={c.id}
                        id={optionId}
                        role="option"
                        aria-selected={isActive}
                        isSelected={isActive}
                        className="ad-search-item"
                        data-active={isActive ? 'true' : 'false'}
                        label={c.fullName}
                        description={
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {c.phoneE164}
                            {c.instagramHandle ? ` · ${c.instagramHandle}` : ''}
                          </Text>
                        }
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() =>
                          handleNavigate(`/admin/clientas?q=${encodeURIComponent(c.phoneE164)}`)
                        }
                      />
                    );
                  })}
                </List>
              </VStack>
            ) : null}

            {matchedNav.length > 0 ? (
              <VStack className="ad-surface" gap={0}>
                <HStack gap={1.5} align="center" className="ad-section-head">
                  <Sparkles size={14} aria-hidden="true" />
                  <Text type="label" color="secondary" weight="semibold">
                    Accesos del panel
                  </Text>
                </HStack>
                <List hasDividers density="compact" role="presentation">
                  {matchedNav.map((item, idx) => {
                    const flatIdx = navOffset + idx;
                    const isActive = safeActiveIndex === flatIdx;
                    const optionId = `ad-search-opt-nav-${idx}`;
                    return (
                      <ListItem
                        key={item.href}
                        id={optionId}
                        role="option"
                        aria-selected={isActive}
                        isSelected={isActive}
                        className="ad-search-item"
                        data-active={isActive ? 'true' : 'false'}
                        label={item.label}
                        description={
                          <Text type="supporting" color="secondary">
                            {item.description}
                          </Text>
                        }
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() => handleNavigate(item.href)}
                      />
                    );
                  })}
                </List>
              </VStack>
            ) : null}
          </VStack>
        )}

        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <HStack gap={2} align="center" wrap="wrap">
            <HStack gap={1} align="center">
              <kbd className="ad-kbd">↑ ↓</kbd>
              <Text type="supporting" color="secondary">
                navegar
              </Text>
            </HStack>
            <HStack gap={1} align="center">
              <kbd className="ad-kbd">Enter</kbd>
              <Text type="supporting" color="secondary">
                abrir
              </Text>
            </HStack>
          </HStack>
          <HStack gap={1.5} align="center">
            <kbd className="ad-kbd">Esc</kbd>
            <Text type="supporting" color="secondary">
              salir
            </Text>
          </HStack>
        </HStack>
      </VStack>
    </Dialog>
  );
}
