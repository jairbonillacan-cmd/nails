'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  normalizeUniqueSortedIds,
  type ProofDeliveryMethod,
} from '@/components/booking/bookingHelpers';
import type { BookingFlowState } from '@/components/booking/bookingMachine';
import type { BookingSelectionState } from './useBookingSelectionState';

export const BOOKING_DRAFT_STORAGE_KEY = 'laikona_booking_draft_v1';
export const BOOKING_DRAFT_VERSION = 1;
export const BOOKING_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const MAX_SHORT_FIELD_LENGTH = 200;
const MAX_NOTES_LENGTH = 1000;
const MAX_EXTRA_SERVICES = 8;
const MAX_ADDONS = 20;
const DATA_URI_PREFIX_RE = /^\s*data:/i;

export interface BookingDraftFields {
  serviceId: string;
  extraServiceIds: string[];
  addonIds: string[];
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  clientEmail: string;
  clientBirthday: string;
  clientNotes: string;
  proofDeliveryMethod: ProofDeliveryMethod;
}

export interface StoredBookingDraft extends BookingDraftFields {
  version: typeof BOOKING_DRAFT_VERSION;
  updatedAt: number;
}

export interface BookingDraftStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface BookingDraftUrlOverrides {
  service?: boolean;
  extras?: boolean;
  addons?: boolean;
  notes?: boolean;
}

export type BookingDraftHydrationPatch = Partial<BookingDraftFields>;

export type BookingDraftSelectionBinding = Pick<
  BookingSelectionState,
  | 'selectedService'
  | 'selectedExtraServiceIds'
  | 'selectedAddonIds'
  | 'setSelectedServiceId'
  | 'setSelectedExtraServiceIds'
  | 'setSelectedAddonIds'
  | 'clientForm'
>;

interface UseBookingDraftOptions {
  selection: BookingDraftSelectionBinding;
  defaultServiceId: string;
  validServiceIds: readonly string[];
  validAddonIds: readonly string[];
  urlOverrides: BookingDraftUrlOverrides;
  phase: BookingFlowState['phase'];
}

interface UseBookingDraftResult {
  hasRestoredDraft: boolean;
  dismissRestoredBanner: () => void;
  resetDraft: () => void;
}

function getDefaultSessionStorage(): BookingDraftStorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string' || DATA_URI_PREFIX_RE.test(value)) return '';
  return value.slice(0, maxLength);
}

function sanitizeIdList(value: unknown, maxItems: number, excludeId?: string): string[] {
  if (!Array.isArray(value)) return [];
  const rawStrings = value.filter((item): item is string => typeof item === 'string');
  return normalizeUniqueSortedIds(rawStrings, excludeId).slice(0, maxItems);
}

function sanitizeProofMethod(value: unknown): ProofDeliveryMethod {
  return value === 'instagram_dm' || value === 'none' || value === 'web_upload'
    ? value
    : 'none';
}

export function sanitizeBookingDraftFields(
  input: Partial<Record<keyof BookingDraftFields, unknown>>,
): BookingDraftFields {
  const serviceId = sanitizeText(input.serviceId, MAX_SHORT_FIELD_LENGTH).trim();
  return {
    serviceId,
    extraServiceIds: sanitizeIdList(input.extraServiceIds, MAX_EXTRA_SERVICES, serviceId),
    addonIds: sanitizeIdList(input.addonIds, MAX_ADDONS),
    clientName: sanitizeText(input.clientName, MAX_SHORT_FIELD_LENGTH),
    clientPhone: sanitizeText(input.clientPhone, MAX_SHORT_FIELD_LENGTH),
    clientInstagram: sanitizeText(input.clientInstagram, MAX_SHORT_FIELD_LENGTH),
    clientEmail: sanitizeText(input.clientEmail, MAX_SHORT_FIELD_LENGTH),
    clientBirthday: sanitizeText(input.clientBirthday, MAX_SHORT_FIELD_LENGTH),
    clientNotes: sanitizeText(input.clientNotes, MAX_NOTES_LENGTH),
    proofDeliveryMethod: sanitizeProofMethod(input.proofDeliveryMethod),
  };
}

export function hasMeaningfulBookingDraft(
  fields: BookingDraftFields,
  defaultServiceId: string,
): boolean {
  return (
    fields.clientName.trim().length > 0 ||
    fields.clientPhone.trim().length > 0 ||
    fields.clientInstagram.trim().length > 0 ||
    fields.clientEmail.trim().length > 0 ||
    fields.clientBirthday.trim().length > 0 ||
    fields.clientNotes.trim().length > 0 ||
    fields.proofDeliveryMethod !== 'none' ||
    fields.extraServiceIds.length > 0 ||
    fields.addonIds.length > 0 ||
    Boolean(fields.serviceId && fields.serviceId !== defaultServiceId)
  );
}

export function clearBookingDraft(
  storage: BookingDraftStorageLike | null = getDefaultSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    return;
  }
}

export function readBookingDraft(
  storage: BookingDraftStorageLike | null = getDefaultSessionStorage(),
  nowMs: number = Date.now(),
): StoredBookingDraft | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearBookingDraft(storage);
    return null;
  }

  if (!isRecord(parsed) || parsed.version !== BOOKING_DRAFT_VERSION) {
    clearBookingDraft(storage);
    return null;
  }

  const updatedAt = parsed.updatedAt;
  if (
    typeof updatedAt !== 'number' ||
    !Number.isFinite(updatedAt) ||
    nowMs - updatedAt > BOOKING_DRAFT_MAX_AGE_MS ||
    updatedAt - nowMs > 60_000
  ) {
    clearBookingDraft(storage);
    return null;
  }

  return {
    version: BOOKING_DRAFT_VERSION,
    updatedAt,
    ...sanitizeBookingDraftFields(parsed),
  };
}

export function writeBookingDraft(
  fields: BookingDraftFields,
  storage: BookingDraftStorageLike | null = getDefaultSessionStorage(),
  nowMs: number = Date.now(),
): boolean {
  if (!storage) return false;
  const payload: StoredBookingDraft = {
    version: BOOKING_DRAFT_VERSION,
    updatedAt: nowMs,
    ...sanitizeBookingDraftFields(fields),
  };
  try {
    storage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function resolveBookingDraftHydration(
  draft: BookingDraftFields,
  options: {
    validServiceIds: ReadonlySet<string>;
    validAddonIds: ReadonlySet<string>;
    defaultServiceId: string;
    urlOverrides?: BookingDraftUrlOverrides;
  },
): BookingDraftHydrationPatch | null {
  const overrides = options.urlOverrides ?? {};
  const patch: BookingDraftHydrationPatch = {};
  let hasChanges = false;

  const canRestoreService =
    !overrides.service && Boolean(draft.serviceId) && options.validServiceIds.has(draft.serviceId);
  const effectiveServiceId = canRestoreService ? draft.serviceId : options.defaultServiceId;

  if (canRestoreService && draft.serviceId !== options.defaultServiceId) {
    patch.serviceId = draft.serviceId;
    hasChanges = true;
  }
  if (!overrides.service && !overrides.extras) {
    const validExtras = draft.extraServiceIds.filter(
      (id) => id !== effectiveServiceId && options.validServiceIds.has(id),
    );
    if (validExtras.length > 0) {
      patch.extraServiceIds = validExtras;
      hasChanges = true;
    }
  }
  if (!overrides.service && !overrides.addons) {
    const validAddons = draft.addonIds.filter((id) => options.validAddonIds.has(id));
    if (validAddons.length > 0) {
      patch.addonIds = validAddons;
      hasChanges = true;
    }
  }

  const textKeys: ReadonlyArray<
    'clientName' | 'clientPhone' | 'clientInstagram' | 'clientEmail' | 'clientBirthday' | 'clientNotes'
  > = ['clientName', 'clientPhone', 'clientInstagram', 'clientEmail', 'clientBirthday', 'clientNotes'];
  for (const key of textKeys) {
    if ((key !== 'clientNotes' || !overrides.notes) && draft[key].trim().length > 0) {
      patch[key] = draft[key];
      hasChanges = true;
    }
  }
  if (draft.proofDeliveryMethod !== 'none') {
    patch.proofDeliveryMethod = draft.proofDeliveryMethod;
    hasChanges = true;
  }
  return hasChanges ? patch : null;
}

export function applyBookingDraftPatch(
  patch: BookingDraftHydrationPatch,
  selection: BookingDraftSelectionBinding,
): void {
  if (patch.serviceId) selection.setSelectedServiceId(patch.serviceId);
  if (patch.extraServiceIds) selection.setSelectedExtraServiceIds(patch.extraServiceIds);
  if (patch.addonIds) selection.setSelectedAddonIds(patch.addonIds);
  if (patch.clientName !== undefined) selection.clientForm.onChangeClientName(patch.clientName);
  if (patch.clientPhone !== undefined) selection.clientForm.onChangeClientPhone(patch.clientPhone);
  if (patch.clientInstagram !== undefined) selection.clientForm.onChangeClientInstagram(patch.clientInstagram);
  if (patch.clientEmail !== undefined) selection.clientForm.onChangeClientEmail(patch.clientEmail);
  if (patch.clientBirthday !== undefined) selection.clientForm.onChangeClientBirthday(patch.clientBirthday);
  if (patch.clientNotes !== undefined) selection.clientForm.onChangeClientNotes(patch.clientNotes);
  if (patch.proofDeliveryMethod) selection.clientForm.onChangeProofMethod(patch.proofDeliveryMethod);
}

export function useBookingDraft({
  selection,
  defaultServiceId,
  validServiceIds,
  validAddonIds,
  urlOverrides,
  phase,
}: UseBookingDraftOptions): UseBookingDraftResult {
  const [restoredBannerOpen, setRestoredBannerOpen] = useState(false);
  const hasHydratedRef = useRef(false);
  const latestRef = useRef({ selection, defaultServiceId, validServiceIds, validAddonIds, urlOverrides });

  useEffect(() => {
    latestRef.current = { selection, defaultServiceId, validServiceIds, validAddonIds, urlOverrides };
  }, [selection, defaultServiceId, validServiceIds, validAddonIds, urlOverrides]);

  useEffect(() => {
    let cancelled = false;
    const stored = readBookingDraft();
    let restored = false;
    if (stored) {
      const cfg = latestRef.current;
      const patch = resolveBookingDraftHydration(stored, {
        validServiceIds: new Set(cfg.validServiceIds),
        validAddonIds: new Set(cfg.validAddonIds),
        defaultServiceId: cfg.defaultServiceId,
        urlOverrides: cfg.urlOverrides,
      });
      if (patch) {
        applyBookingDraftPatch(patch, cfg.selection);
        restored = true;
      }
    }
    queueMicrotask(() => {
      if (cancelled) return;
      hasHydratedRef.current = true;
      if (restored) setRestoredBannerOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const serviceId = selection.selectedService?.id ?? '';
  const extraKey = selection.selectedExtraServiceIds.join(',');
  const addonKey = selection.selectedAddonIds.join(',');
  const { clientName, clientPhone, clientInstagram, clientEmail, clientBirthday, clientNotes, proofDeliveryMethod } =
    selection.clientForm;

  useEffect(() => {
    if (phase === 'confirmed') {
      clearBookingDraft();
      return;
    }
    if (!hasHydratedRef.current) return;
    const currentFields: BookingDraftFields = {
      serviceId,
      extraServiceIds: extraKey ? extraKey.split(',') : [],
      addonIds: addonKey ? addonKey.split(',') : [],
      clientName,
      clientPhone,
      clientInstagram,
      clientEmail,
      clientBirthday,
      clientNotes,
      proofDeliveryMethod,
    };
    if (hasMeaningfulBookingDraft(currentFields, defaultServiceId)) {
      writeBookingDraft(currentFields);
    } else {
      clearBookingDraft();
    }
  }, [phase, defaultServiceId, serviceId, extraKey, addonKey, clientName, clientPhone, clientInstagram, clientEmail, clientBirthday, clientNotes, proofDeliveryMethod]);

  const dismissRestoredBanner = useCallback(() => setRestoredBannerOpen(false), []);

  const resetDraft = useCallback(() => {
    clearBookingDraft();
    setRestoredBannerOpen(false);
    const current = latestRef.current.selection;
    current.setSelectedServiceId(defaultServiceId);
    current.setSelectedExtraServiceIds([]);
    current.setSelectedAddonIds([]);
    current.clientForm.onChangeClientName('');
    current.clientForm.onChangeClientPhone('');
    current.clientForm.onChangeClientInstagram('');
    current.clientForm.onChangeClientEmail('');
    current.clientForm.onChangeClientBirthday('');
    current.clientForm.onChangeClientNotes('');
    current.clientForm.onChangeProofMethod('none');
    current.clientForm.onChangeInspoFile(null, null);
    current.clientForm.onChangeProofFile(null, null);
  }, [defaultServiceId]);

  return {
    hasRestoredDraft: restoredBannerOpen && phase !== 'confirmed',
    dismissRestoredBanner,
    resetDraft,
  };
}
