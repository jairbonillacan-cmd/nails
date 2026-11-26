'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'laikona_last_booking_v1';
const CHANGE_EVENT = 'laikona:booking-memory-change';

export interface RememberedBookingPreference {
  serviceSlug: string;
  serviceName: string;
  staffSlug: string | null;
  staffName: string | null;
}

let cachedRaw: string | null = null;
let cachedValue: RememberedBookingPreference | null = null;

function parseMemory(raw: string | null): RememberedBookingPreference | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RememberedBookingPreference>;
    if (
      typeof parsed.serviceSlug !== 'string' ||
      !parsed.serviceSlug.trim() ||
      typeof parsed.serviceName !== 'string' ||
      !parsed.serviceName.trim()
    ) {
      return null;
    }
    return {
      serviceSlug: parsed.serviceSlug.trim().slice(0, 160),
      serviceName: parsed.serviceName.trim().slice(0, 200),
      staffSlug:
        typeof parsed.staffSlug === 'string' && parsed.staffSlug.trim()
          ? parsed.staffSlug.trim().slice(0, 160)
          : null,
      staffName:
        typeof parsed.staffName === 'string' && parsed.staffName.trim()
          ? parsed.staffName.trim().slice(0, 200)
          : null,
    };
  } catch {
    return null;
  }
}

function getClientSnapshot(): RememberedBookingPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    cachedValue = parseMemory(raw);
    return cachedValue;
  } catch {
    return null;
  }
}

function getServerSnapshot(): RememberedBookingPreference | null {
  return null;
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onStoreChange();
  window.addEventListener('storage', handler);
  window.addEventListener(CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(CHANGE_EVENT, handler);
  };
}

export function saveBookingMemory(entry: RememberedBookingPreference): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify({
      serviceSlug: entry.serviceSlug.trim().slice(0, 160),
      serviceName: entry.serviceName.trim().slice(0, 200),
      staffSlug: entry.staffSlug ? entry.staffSlug.trim().slice(0, 160) : null,
      staffName: entry.staffName ? entry.staffName.trim().slice(0, 200) : null,
    });
    window.localStorage.setItem(STORAGE_KEY, serialized);
    cachedRaw = serialized;
    cachedValue = parseMemory(serialized);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    return;
  }
}

export function useBookingMemory(): RememberedBookingPreference | null {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
