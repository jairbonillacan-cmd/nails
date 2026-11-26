import type { ClientPortalProfile } from '@/lib/contracts';
import { normalizePhoneE164 } from '@/lib/format';
import {
  extractMxPhoneDigits,
  formatBirthdayInput,
  formatMxPhoneDisplay,
  isValidMxPhone,
} from './bookingHelpers';

export interface ClientContactFields {
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
}

export type ClientContactPatch = Partial<ClientContactFields>;

const CONTACT_KEYS: ReadonlyArray<keyof ClientContactFields> = [
  'clientName',
  'clientPhone',
  'clientInstagram',
  'clientEmail',
  'clientBirthday',
];

export function profileToContactFields(profile: ClientPortalProfile): ClientContactFields {
  const handle = profile.instagramHandle?.trim().replace(/^@+/, '') ?? '';
  return {
    clientName: profile.fullName.trim(),
    clientPhone: formatMxPhoneDisplay(profile.phoneE164),
    clientInstagram: handle ? `@${handle}` : '',
    clientEmail: profile.email?.trim() ?? '',
    clientBirthday: profile.birthday ? formatBirthdayInput(profile.birthday) : '',
  };
}

export function resolveProfilePrefill(
  current: ClientContactFields,
  profile: ClientPortalProfile,
): ClientContactPatch {
  const fromProfile = profileToContactFields(profile);
  const patch: ClientContactPatch = {};
  for (const key of CONTACT_KEYS) {
    if (current[key].trim().length === 0 && fromProfile[key].length > 0) {
      patch[key] = fromProfile[key];
    }
  }
  return patch;
}

export function resolveSignOutClear(
  current: ClientContactFields,
  profile: ClientPortalProfile,
): ClientContactPatch {
  const fromProfile = profileToContactFields(profile);
  const patch: ClientContactPatch = {};
  for (const key of CONTACT_KEYS) {
    if (fromProfile[key].length > 0 && current[key].trim() === fromProfile[key]) {
      patch[key] = '';
    }
  }
  return patch;
}

export function resolveAccountTransitionPatch(
  current: ClientContactFields,
  previousProfile: ClientPortalProfile | null,
  nextProfile: ClientPortalProfile,
): ClientContactPatch {
  if (!previousProfile || previousProfile.phoneE164 === nextProfile.phoneE164) {
    return resolveProfilePrefill(current, nextProfile);
  }
  const clearPatch = resolveSignOutClear(current, previousProfile);
  const afterClear: ClientContactFields = { ...current, ...clearPatch };
  const prefillPatch = resolveProfilePrefill(afterClear, nextProfile);
  return { ...clearPatch, ...prefillPatch };
}

export function isPhoneMatchingSession(clientPhone: string, sessionPhoneE164: string): boolean {
  if (!isValidMxPhone(clientPhone)) return false;
  return normalizePhoneE164(extractMxPhoneDigits(clientPhone)) === normalizePhoneE164(sessionPhoneE164);
}
