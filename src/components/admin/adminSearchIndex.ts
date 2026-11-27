import { agendaHref, clientasHref } from '@/lib/admin-links';
import { formatDateShortInTimezone } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminRole, BookingWithRelations, ClientProfile, Service } from '@/lib/types';
import type { AdminOverviewPayload } from './AdminProvider';
import { getDayOfWeekFromDateKey, shiftDateKey } from './citas/scheduleGridGeometry';

interface QuickNavTarget {
  label: string;
  description: string;
  href: string;
  keywords: string;
  visible: boolean;
}

export interface QuickDateJumpTarget {
  id: string;
  dateKey: string;
  label: string;
  description: string;
  href: string;
}

interface FlatSearchOption {
  optionId: string;
  href: string;
}

export interface QuickSearchResults {
  dateJumps: QuickDateJumpTarget[];
  matchedBookings: BookingWithRelations[];
  matchedClients: ClientProfile[];
  matchedServices: Service[];
  matchedNav: QuickNavTarget[];
  flatOptions: FlatSearchOption[];
}

const MONTH_ALIASES: Record<string, number> = {
  ene: 1,
  enero: 1,
  feb: 2,
  febrero: 2,
  mar: 3,
  marzo: 3,
  abr: 4,
  abril: 4,
  may: 5,
  mayo: 5,
  jun: 6,
  junio: 6,
  jul: 7,
  julio: 7,
  ago: 8,
  agosto: 8,
  sep: 9,
  sept: 9,
  septiembre: 9,
  oct: 10,
  octubre: 10,
  nov: 11,
  noviembre: 11,
  dic: 12,
  diciembre: 12,
};

const WEEKDAY_ALIASES: Record<string, number> = {
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  martes: 2,
  mar: 2,
  miercoles: 3,
  mie: 3,
  jueves: 4,
  jue: 4,
  viernes: 5,
  vie: 5,
  sabado: 6,
  sab: 6,
};

function stripAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2020 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseAdminDateJump(
  rawQuery: string,
  todayKey: string,
  timezone: string,
): QuickDateJumpTarget | null {
  const cleaned = stripAccents(rawQuery.trim()).replace(/\s+/g, ' ');
  if (!cleaned) return null;

  let resolvedKey: string | null = null;
  let titlePrefix = 'Ir a fecha';

  if (cleaned === 'hoy') {
    resolvedKey = todayKey;
    titlePrefix = 'Ir a hoy';
  } else if (cleaned === 'manana') {
    resolvedKey = shiftDateKey(todayKey, 1);
    titlePrefix = 'Ir a mañana';
  } else if (cleaned === 'pasado manana') {
    resolvedKey = shiftDateKey(todayKey, 2);
    titlePrefix = 'Ir a pasado mañana';
  } else if (cleaned === 'ayer') {
    resolvedKey = shiftDateKey(todayKey, -1);
    titlePrefix = 'Ir a ayer';
  } else if (WEEKDAY_ALIASES[cleaned] !== undefined) {
    const targetDow = WEEKDAY_ALIASES[cleaned];
    const currentDow = getDayOfWeekFromDateKey(todayKey);
    const delta = (targetDow - currentDow + 7) % 7 || 7;
    resolvedKey = shiftDateKey(todayKey, delta);
    titlePrefix = 'Ir a próximo día';
  } else {
    const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(cleaned);
    if (isoMatch) {
      const y = Number(isoMatch[1]);
      const m = Number(isoMatch[2]);
      const d = Number(isoMatch[3]);
      if (isValidCalendarDate(y, m, d)) {
        resolvedKey = formatIsoDate(y, m, d);
      }
    }

    if (!resolvedKey) {
      const slashMatch = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(cleaned);
      if (slashMatch) {
        const d = Number(slashMatch[1]);
        const m = Number(slashMatch[2]);
        const baseYear = Number(todayKey.slice(0, 4)) || 2026;
        const y = slashMatch[3] ? Number(slashMatch[3]) : baseYear;
        if (isValidCalendarDate(y, m, d)) {
          let candidate = formatIsoDate(y, m, d);
          if (!slashMatch[3] && candidate < shiftDateKey(todayKey, -30)) {
            if (isValidCalendarDate(y + 1, m, d)) {
              candidate = formatIsoDate(y + 1, m, d);
            }
          }
          resolvedKey = candidate;
        }
      }
    }

    if (!resolvedKey) {
      const textMatch = /^(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?$/.exec(
        cleaned,
      );
      if (textMatch) {
        const d = Number(textMatch[1]);
        const monthNum = MONTH_ALIASES[textMatch[2] ?? ''];
        const baseYear = Number(todayKey.slice(0, 4)) || 2026;
        const y = textMatch[3] ? Number(textMatch[3]) : baseYear;
        if (monthNum && isValidCalendarDate(y, monthNum, d)) {
          let candidate = formatIsoDate(y, monthNum, d);
          if (!textMatch[3] && candidate < shiftDateKey(todayKey, -30)) {
            if (isValidCalendarDate(y + 1, monthNum, d)) {
              candidate = formatIsoDate(y + 1, monthNum, d);
            }
          }
          resolvedKey = candidate;
        }
      }
    }
  }

  if (!resolvedKey) return null;

  const formatted = formatDateShortInTimezone(`${resolvedKey}T18:00:00Z`, timezone);
  return {
    id: `date-${resolvedKey}`,
    dateKey: resolvedKey,
    label: `${titlePrefix} · ${formatted}`,
    description: `Abrir la agenda en ${resolvedKey}`,
    href: agendaHref({ date: resolvedKey }),
  };
}

function getQuickNavTargets(role: AdminRole): QuickNavTarget[] {
  return [
    {
      label: 'Nueva cita',
      description: 'Registrar una cita nueva en la agenda (atajo N)',
      href: agendaHref({ new: true }),
      keywords: 'nueva cita agendar crear reserva',
      visible: true,
    },
    {
      label: 'Agenda',
      description: 'Horarios por profesional, mover citas y cobrar (G A)',
      href: '/admin/citas',
      keywords: 'citas agenda calendario horarios',
      visible: true,
    },
    {
      label: 'WhatsApp',
      description: 'Mensajes con clientas, recordatorios automáticos y plantillas (G W)',
      href: '/admin/whatsapp',
      keywords: 'whatsapp mensajes inbox chat recordatorios plantillas meta simulador',
      visible: roleCanAccess(role, 'whatsapp'),
    },
    {
      label: 'Resumen',
      description: 'Resumen del día, pendientes y tus citas de hoy (G R)',
      href: '/admin',
      keywords: 'inicio resumen hoy citas pendientes',
      visible: true,
    },
    {
      label: 'Clientas',
      description: 'Directorio, sellos, cumpleaños y mensajes (G C)',
      href: '/admin/clientas',
      keywords: 'clientas directorio sellos cumpleanos mensajes paquetes',
      visible: roleCanAccess(role, 'clients'),
    },
    {
      label: 'Caja',
      description: 'Corte del día, anticipos, comisiones y promociones (G J)',
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
      description: 'Profesionales, comisiones y accesos del salón',
      href: '/admin/equipo',
      keywords: 'equipo profesionales comisiones accesos roles',
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
      description: 'Días con más citas, ocupación y servicios rentables (G E)',
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
      description: 'Google Calendar, cobros en línea y enlaces técnicos',
      href: '/admin/integraciones',
      keywords: 'conexiones google calendar mercado pago spei sms reseñas',
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
  const tz = data.settings.timezone || 'America/Mexico_City';
  const todayKey = data.serverTodayKey;
  const normalized = stripAccents(rawQuery.trim());
  const digitsQuery = rawQuery.replace(/\D/g, '');

  const parsedJump = parseAdminDateJump(rawQuery, todayKey, tz);
  const dateJumps: QuickDateJumpTarget[] = parsedJump
    ? [parsedJump]
    : !normalized
      ? [
          {
            id: `date-${todayKey}`,
            dateKey: todayKey,
            label: `Agenda de hoy · ${formatDateShortInTimezone(`${todayKey}T18:00:00Z`, tz)}`,
            description: 'Ver calendario por profesional de hoy',
            href: agendaHref({ date: todayKey }),
          },
          {
            id: `date-${shiftDateKey(todayKey, 1)}`,
            dateKey: shiftDateKey(todayKey, 1),
            label: `Agenda de mañana · ${formatDateShortInTimezone(`${shiftDateKey(todayKey, 1)}T18:00:00Z`, tz)}`,
            description: 'Ver citas y huecos libres de mañana',
            href: agendaHref({ date: shiftDateKey(todayKey, 1) }),
          },
        ]
      : [];

  const matchedBookings = !normalized
    ? data.bookings.slice(0, 3)
    : data.bookings
        .filter((b) => {
          const haystack = stripAccents(
            `${b.bookingCode} ${b.client.fullName} ${b.client.phoneE164} ${b.clientInstagram ?? b.client.instagramHandle ?? ''} ${b.service.name} ${b.staff.name}`,
          );
          if (haystack.includes(normalized)) return true;
          if (digitsQuery.length >= 3) {
            return b.client.phoneE164.replace(/\D/g, '').includes(digitsQuery);
          }
          return false;
        })
        .slice(0, 5);

  const matchedClients = !roleCanAccess(role, 'clients')
    ? []
    : !normalized
      ? data.clients.slice(0, 3)
      : data.clients
          .filter((c) => {
            const haystack = stripAccents(
              `${c.fullName} ${c.phoneE164} ${c.instagramHandle ?? ''} ${c.email ?? ''}`,
            );
            if (haystack.includes(normalized)) return true;
            if (digitsQuery.length >= 3) {
              return c.phoneE164.replace(/\D/g, '').includes(digitsQuery);
            }
            return false;
          })
          .slice(0, 5);

  const matchedServices = !normalized
    ? []
    : data.services
        .filter((s) => s.isActive)
        .filter((s) =>
          stripAccents(
            `${s.name} ${s.description} ${Math.round(s.priceCents / 100)}`,
          ).includes(normalized),
        )
        .slice(0, 5);

  const allowedNav = getQuickNavTargets(role).filter((item) => item.visible);
  const matchedNav = !normalized
    ? allowedNav.slice(0, 4)
    : allowedNav
        .filter((item) =>
          stripAccents(`${item.label} ${item.description} ${item.keywords}`).includes(
            normalized,
          ),
        )
        .slice(0, 6);

  const flatOptions: FlatSearchOption[] = [];
  for (const jump of dateJumps) {
    flatOptions.push({
      optionId: `ad-search-opt-${jump.id}`,
      href: jump.href,
    });
  }
  for (const b of matchedBookings) {
    flatOptions.push({
      optionId: `ad-search-opt-booking-${b.id}`,
      href: agendaHref({ q: b.bookingCode }),
    });
  }
  for (const c of matchedClients) {
    flatOptions.push({
      optionId: `ad-search-opt-client-${c.id}`,
      href: clientasHref({ q: c.phoneE164 }),
    });
  }
  const serviceTargetHref = roleCanAccess(role, 'services')
    ? '/admin/servicios'
    : agendaHref({ new: true });
  for (const s of matchedServices) {
    flatOptions.push({
      optionId: `ad-search-opt-service-${s.id}`,
      href: serviceTargetHref,
    });
  }
  matchedNav.forEach((item, idx) => {
    flatOptions.push({
      optionId: `ad-search-opt-nav-${idx}`,
      href: item.href,
    });
  });

  return {
    dateJumps,
    matchedBookings,
    matchedClients,
    matchedServices,
    matchedNav,
    flatOptions,
  };
}
