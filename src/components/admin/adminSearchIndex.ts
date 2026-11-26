import { roleCanAccess } from '@/lib/rbac';
import type { AdminRole, BookingWithRelations, ClientProfile } from '@/lib/types';
import type { AdminOverviewPayload } from './AdminProvider';

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

export interface QuickSearchResults {
  matchedBookings: BookingWithRelations[];
  matchedClients: ClientProfile[];
  matchedNav: QuickNavTarget[];
  flatOptions: FlatSearchOption[];
}

function getQuickNavTargets(role: AdminRole): QuickNavTarget[] {
  return [
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
  ];
}

export function buildQuickSearchResults(
  data: AdminOverviewPayload,
  rawQuery: string,
): QuickSearchResults {
  const role = data.session.user.role;
  const normalized = rawQuery.trim().toLowerCase();

  const matchedBookings = !normalized
    ? data.bookings.slice(0, 4)
    : data.bookings
        .filter((b) => {
          const haystack =
            `${b.bookingCode} ${b.client.fullName} ${b.client.phoneE164} ${b.clientInstagram ?? b.client.instagramHandle ?? ''} ${b.service.name} ${b.staff.name}`.toLowerCase();
          return haystack.includes(normalized);
        })
        .slice(0, 5);

  const matchedClients = !roleCanAccess(role, 'clients')
    ? []
    : !normalized
      ? data.clients.slice(0, 4)
      : data.clients
          .filter((c) => {
            const haystack =
              `${c.fullName} ${c.phoneE164} ${c.instagramHandle ?? ''} ${c.email ?? ''}`.toLowerCase();
            return haystack.includes(normalized);
          })
          .slice(0, 5);

  const allowedNav = getQuickNavTargets(role).filter((item) => item.visible);
  const matchedNav = !normalized
    ? allowedNav.slice(0, 5)
    : allowedNav
        .filter((item) =>
          `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalized),
        )
        .slice(0, 6);

  const flatOptions: FlatSearchOption[] = [];
  for (const b of matchedBookings) {
    flatOptions.push({
      optionId: `ad-search-opt-booking-${b.id}`,
      href: `/admin/citas?q=${encodeURIComponent(b.bookingCode)}`,
    });
  }
  for (const c of matchedClients) {
    flatOptions.push({
      optionId: `ad-search-opt-client-${c.id}`,
      href: `/admin/clientas?q=${encodeURIComponent(c.phoneE164)}`,
    });
  }
  matchedNav.forEach((item, idx) => {
    flatOptions.push({
      optionId: `ad-search-opt-nav-${idx}`,
      href: item.href,
    });
  });

  return { matchedBookings, matchedClients, matchedNav, flatOptions };
}
