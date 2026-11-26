import {
  ClientPortalProfileSchema,
  type ClientAuthMethod,
  type ClientPortalProfile,
} from './contracts';
import { normalizePhoneE164 } from './format';
import type { ClientProfile } from './types';

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
>;

export function selectClientPortalProfile(
  clients: readonly ClientProfileSource[],
  sessionPhoneE164: string,
): ClientPortalProfile {
  const phoneE164 = normalizePhoneE164(sessionPhoneE164);
  const client = phoneE164
    ? clients.find((entry) => normalizePhoneE164(entry.phoneE164) === phoneE164)
    : undefined;
  return ClientPortalProfileSchema.parse({
    fullName: client?.fullName.trim().slice(0, 200) ?? '',
    phoneE164,
    email: client?.email?.trim().slice(0, 320) || null,
    instagramHandle: client?.instagramHandle?.trim().slice(0, 120) || null,
    birthday: client?.birthday?.trim().slice(0, 20) || null,
    isRegistered: Boolean(client),
  });
}
