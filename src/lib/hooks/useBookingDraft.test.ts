import { describe, expect, it, vi } from 'vitest';
import {
  applyBookingDraftPatch,
  BOOKING_DRAFT_MAX_AGE_MS,
  BOOKING_DRAFT_STORAGE_KEY,
  BOOKING_DRAFT_VERSION,
  clearBookingDraft,
  hasMeaningfulBookingDraft,
  readBookingDraft,
  resolveBookingDraftHydration,
  sanitizeBookingDraftFields,
  writeBookingDraft,
  type BookingDraftFields,
  type BookingDraftSelectionBinding,
  type BookingDraftStorageLike,
} from './useBookingDraft';

function createMemoryStorage(): BookingDraftStorageLike & {
  dump: () => Map<string, string>;
} {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    dump: () => new Map(map),
  };
}

function createThrowingStorage(): BookingDraftStorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

const SAMPLE_DRAFT: BookingDraftFields = {
  serviceId: 'srv-rubber',
  extraServiceIds: ['srv-retiro', 'srv-pedi'],
  addonIds: ['addon-chrome'],
  clientName: 'Sofía Ramírez',
  clientPhone: '222 123 4567',
  clientInstagram: '@sofia.nails',
  clientEmail: 'sofia@example.com',
  clientBirthday: '1998-05-14',
  clientNotes: 'Me gustaría tono rosa lechoso',
  proofDeliveryMethod: 'instagram_dm',
};

describe('useBookingDraft storage helpers', () => {
  it('persists, reads, and clears only allowlisted draft fields under the versioned key', () => {
    const storage = createMemoryStorage();
    const now = 1_700_000_000_000;

    expect(writeBookingDraft(SAMPLE_DRAFT, storage, now)).toBe(true);
    const raw = storage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    expect(raw).not.toBeNull();

    const parsedRaw = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    expect(parsedRaw.version).toBe(BOOKING_DRAFT_VERSION);
    expect(parsedRaw).not.toHaveProperty('inspoDataUrl');
    expect(parsedRaw).not.toHaveProperty('proofDataUrl');
    expect(parsedRaw).not.toHaveProperty('holdId');
    expect(parsedRaw).not.toHaveProperty('holdExpiresAt');

    const loaded = readBookingDraft(storage, now + 5_000);
    expect(loaded).toEqual({
      version: BOOKING_DRAFT_VERSION,
      updatedAt: now,
      ...SAMPLE_DRAFT,
      extraServiceIds: ['srv-pedi', 'srv-retiro'],
    });

    clearBookingDraft(storage);
    expect(readBookingDraft(storage, now + 5_000)).toBeNull();
  });

  it('strips raw data URLs, expired holds, and unknown keys on read and sanitize', () => {
    const storage = createMemoryStorage();
    const now = 1_700_000_000_000;

    storage.setItem(
      BOOKING_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: BOOKING_DRAFT_VERSION,
        updatedAt: now,
        serviceId: 'srv-rubber',
        extraServiceIds: ['srv-rubber', 'srv-pedi', 'srv-pedi'],
        addonIds: ['addon-b', 'addon-a'],
        clientName: 'Ana Pérez',
        clientPhone: '222 999 0000',
        clientInstagram: '',
        clientEmail: '',
        clientBirthday: '',
        clientNotes: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
        proofDeliveryMethod: 'invalid_method',
        inspoDataUrl: 'data:image/webp;base64,AAAA',
        proofDataUrl: 'data:image/jpeg;base64,BBBB',
        holdId: 'hold-expired-123',
        holdExpiresAt: now - 10_000,
      }),
    );

    const loaded = readBookingDraft(storage, now + 1000);
    expect(loaded).toEqual({
      version: BOOKING_DRAFT_VERSION,
      updatedAt: now,
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-pedi'],
      addonIds: ['addon-a', 'addon-b'],
      clientName: 'Ana Pérez',
      clientPhone: '222 999 0000',
      clientInstagram: '',
      clientEmail: '',
      clientBirthday: '',
      clientNotes: '',
      proofDeliveryMethod: 'none',
    });

    const sanitized = sanitizeBookingDraftFields({
      clientNotes: '  DATA:image/jpeg;base64,xyz',
      proofDeliveryMethod: 'web_upload',
    });
    expect(sanitized.clientNotes).toBe('');
    expect(sanitized.proofDeliveryMethod).toBe('web_upload');
  });

  it('drops corrupt JSON, wrong version, and expired drafts automatically', () => {
    const storage = createMemoryStorage();
    const now = 1_700_000_000_000;

    storage.setItem(BOOKING_DRAFT_STORAGE_KEY, '{bad-json');
    expect(readBookingDraft(storage, now)).toBeNull();
    expect(storage.getItem(BOOKING_DRAFT_STORAGE_KEY)).toBeNull();

    storage.setItem(
      BOOKING_DRAFT_STORAGE_KEY,
      JSON.stringify({ version: 99, updatedAt: now, clientName: 'Old' }),
    );
    expect(readBookingDraft(storage, now)).toBeNull();
    expect(storage.getItem(BOOKING_DRAFT_STORAGE_KEY)).toBeNull();

    writeBookingDraft(SAMPLE_DRAFT, storage, now);
    expect(readBookingDraft(storage, now + BOOKING_DRAFT_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(BOOKING_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('handles private browsing or throwing storage gracefully without crashing', () => {
    const throwing = createThrowingStorage();
    expect(writeBookingDraft(SAMPLE_DRAFT, throwing)).toBe(false);
    expect(readBookingDraft(throwing)).toBeNull();
    expect(() => clearBookingDraft(throwing)).not.toThrow();
  });

  it('respects URL overrides and validates catalog IDs during hydration resolution', () => {
    const validServiceIds = new Set(['srv-default', 'srv-rubber', 'srv-pedi']);
    const validAddonIds = new Set(['addon-chrome']);

    const fullPatch = resolveBookingDraftHydration(
      {
        ...SAMPLE_DRAFT,
        extraServiceIds: ['srv-pedi', 'srv-deleted'],
        addonIds: ['addon-chrome', 'addon-deleted'],
      },
      {
        validServiceIds,
        validAddonIds,
        defaultServiceId: 'srv-default',
      },
    );
    expect(fullPatch).toEqual({
      serviceId: 'srv-rubber',
      extraServiceIds: ['srv-pedi'],
      addonIds: ['addon-chrome'],
      clientName: 'Sofía Ramírez',
      clientPhone: '222 123 4567',
      clientInstagram: '@sofia.nails',
      clientEmail: 'sofia@example.com',
      clientBirthday: '1998-05-14',
      clientNotes: 'Me gustaría tono rosa lechoso',
      proofDeliveryMethod: 'instagram_dm',
    });

    const overriddenPatch = resolveBookingDraftHydration(SAMPLE_DRAFT, {
      validServiceIds,
      validAddonIds,
      defaultServiceId: 'srv-default',
      urlOverrides: {
        service: true,
        notes: true,
      },
    });
    expect(overriddenPatch).toEqual({
      clientName: 'Sofía Ramírez',
      clientPhone: '222 123 4567',
      clientInstagram: '@sofia.nails',
      clientEmail: 'sofia@example.com',
      clientBirthday: '1998-05-14',
      proofDeliveryMethod: 'instagram_dm',
    });
    expect(overriddenPatch).not.toHaveProperty('serviceId');
    expect(overriddenPatch).not.toHaveProperty('extraServiceIds');
    expect(overriddenPatch).not.toHaveProperty('addonIds');
    expect(overriddenPatch).not.toHaveProperty('clientNotes');
  });

  it('applies hydration patches strictly to non-empty restored fields', () => {
    const setSelectedServiceId = vi.fn();
    const setSelectedExtraServiceIds = vi.fn();
    const setSelectedAddonIds = vi.fn();
    const onChangeClientName = vi.fn();
    const onChangeClientPhone = vi.fn();
    const onChangeClientInstagram = vi.fn();
    const onChangeClientEmail = vi.fn();
    const onChangeClientBirthday = vi.fn();
    const onChangeClientNotes = vi.fn();
    const onChangeProofMethod = vi.fn();

    const binding: BookingDraftSelectionBinding = {
      selectedService: undefined,
      selectedExtraServiceIds: [],
      selectedAddonIds: [],
      setSelectedServiceId,
      setSelectedExtraServiceIds,
      setSelectedAddonIds,
      clientForm: {
        clientName: '',
        clientPhone: '',
        clientInstagram: '',
        clientEmail: '',
        clientBirthday: '',
        clientNotes: '',
        inspoFile: null,
        inspoDataUrl: null,
        proofDeliveryMethod: 'none',
        proofFile: null,
        proofDataUrl: null,
        onChangeClientName,
        onChangeClientPhone,
        onChangeClientInstagram,
        onChangeClientEmail,
        onChangeClientBirthday,
        onChangeClientNotes,
        onChangeInspoFile: vi.fn(),
        onChangeProofMethod,
        onChangeProofFile: vi.fn(),
      },
    };

    applyBookingDraftPatch(
      {
        serviceId: 'srv-rubber',
        clientName: 'Sofía Ramírez',
        proofDeliveryMethod: 'instagram_dm',
      },
      binding,
    );

    expect(setSelectedServiceId).toHaveBeenCalledWith('srv-rubber');
    expect(onChangeClientName).toHaveBeenCalledWith('Sofía Ramírez');
    expect(onChangeProofMethod).toHaveBeenCalledWith('instagram_dm');
    expect(setSelectedExtraServiceIds).not.toHaveBeenCalled();
    expect(onChangeClientNotes).not.toHaveBeenCalled();
  });

  it('detects whether a draft holds meaningful non-default content', () => {
    const emptyDraft = sanitizeBookingDraftFields({ serviceId: 'srv-default' });
    expect(hasMeaningfulBookingDraft(emptyDraft, 'srv-default')).toBe(false);
    expect(
      hasMeaningfulBookingDraft({ ...emptyDraft, serviceId: 'srv-rubber' }, 'srv-default'),
    ).toBe(true);
    expect(
      hasMeaningfulBookingDraft({ ...emptyDraft, clientName: 'Karla' }, 'srv-default'),
    ).toBe(true);
    expect(
      hasMeaningfulBookingDraft({ ...emptyDraft, proofDeliveryMethod: 'web_upload' }, 'srv-default'),
    ).toBe(true);
    expect(
      resolveBookingDraftHydration(emptyDraft, {
        validServiceIds: new Set(['srv-default']),
        validAddonIds: new Set(),
        defaultServiceId: 'srv-default',
      }),
    ).toBeNull();
  });
});
