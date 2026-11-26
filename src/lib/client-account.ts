import {
  ClientPortalProfileSchema,
  type ClientAuthMethod,
  type ClientPortalProfile,
} from './contracts';
import { normalizePhoneE164 } from './format';
import type { Booking, ClientProfile, Service, StaffMember } from './types';

interface ClientAuthMethodConfig {
  method: ClientAuthMethod;
  label: string;
  isEnabled: boolean;
}

const CLIENT_AUTH_METHODS: readonly ClientAuthMethodConfig[] = [
  { method: 'whatsapp_otp', label: 'WhatsApp', isEnabled: true },
  { method: 'email_magic_link', label: 'Enlace mágico por correo', isEnabled: false },
  { method: 'google', label: 'Google', isEnabled: false },
];

export function isClientAuthMethodEnabled(
  method: ClientAuthMethod,
  methods: readonly ClientAuthMethodConfig[] = CLIENT_AUTH_METHODS,
): boolean {
  return methods.some((entry) => entry.method === method && entry.isEnabled);
}

type ClientProfileSource = Pick<
  ClientProfile,
  'fullName' | 'phoneE164' | 'email' | 'instagramHandle' | 'birthday'
> & { id?: string };

export interface ClientPortalHistoryContext {
  bookings: readonly Pick<Booking, 'clientId' | 'serviceId' | 'staffId' | 'status' | 'startAt'>[];
  services: readonly Pick<Service, 'id' | 'slug' | 'name' | 'isActive' | 'isPrivate'>[];
  staff: readonly Pick<StaffMember, 'id' | 'bookingSlug' | 'name' | 'isActive'>[];
}

export function selectClientPortalProfile(
  clients: readonly ClientProfileSource[],
  sessionPhoneE164: string,
  history?: ClientPortalHistoryContext,
): ClientPortalProfile {
  const phoneE164 = normalizePhoneE164(sessionPhoneE164);
  const client = phoneE164
    ? clients.find((entry) => normalizePhoneE164(entry.phoneE164) === phoneE164)
    : undefined;

  let lastServiceSlug: string | null | undefined;
  let lastServiceName: string | null | undefined;
  let lastStaffSlug: string | null | undefined;
  let lastStaffName: string | null | undefined;

  if (client?.id && history) {
    let latestBooking: ClientPortalHistoryContext['bookings'][number] | null = null;
    let latestStartMs = -Infinity;
    for (const booking of history.bookings) {
      if (booking.clientId !== client.id) continue;
      if (booking.status === 'canceled') continue;
      const startMs = Date.parse(booking.startAt);
      const score = Number.isFinite(startMs) ? startMs : 0;
      if (!latestBooking || score > latestStartMs) {
        latestBooking = booking;
        latestStartMs = score;
      }
    }
    if (latestBooking) {
      const matchedService = history.services.find(
        (srv) => srv.id === latestBooking.serviceId && srv.isActive && !srv.isPrivate,
      );
      if (matchedService) {
        lastServiceSlug = matchedService.slug;
        lastServiceName = matchedService.name;
        const matchedStaff = history.staff.find(
          (member) => member.id === latestBooking.staffId && member.isActive,
        );
        lastStaffSlug = matchedStaff ? (matchedStaff.bookingSlug || matchedStaff.id) : null;
        lastStaffName = matchedStaff ? matchedStaff.name : null;
      }
    }
  }

  return ClientPortalProfileSchema.parse({
    fullName: client?.fullName.trim().slice(0, 200) ?? '',
    phoneE164,
    email: client?.email?.trim().slice(0, 320) || null,
    instagramHandle: client?.instagramHandle?.trim().slice(0, 120) || null,
    birthday: client?.birthday?.trim().slice(0, 20) || null,
    isRegistered: Boolean(client),
    ...(lastServiceSlug !== undefined
      ? {
          lastServiceSlug,
          lastServiceName,
          lastStaffSlug: lastStaffSlug ?? null,
          lastStaffName: lastStaffName ?? null,
        }
      : {}),
  });
}
