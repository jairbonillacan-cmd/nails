'use client';

import { useEffect, useRef } from 'react';
import type { AdminOverviewPayload } from '@/lib/admin/overview-types';
import type { SalonSettings } from '@/lib/types';

interface UseAdminProviderSyncParams {
  initialData: AdminOverviewPayload | null;
  currentData: AdminOverviewPayload | null;
  onHydrateInitial: (next: AdminOverviewPayload) => void;
  onSyncSettings: (settings: SalonSettings) => void;
}

export function useAdminProviderSync({
  initialData,
  currentData,
  onHydrateInitial,
  onSyncSettings,
}: UseAdminProviderSyncParams): void {
  const lastInitialRef = useRef<AdminOverviewPayload | null>(initialData);
  const lastSyncedSettingsRef = useRef<SalonSettings | null>(null);

  useEffect(() => {
    if (initialData && initialData !== lastInitialRef.current) {
      lastInitialRef.current = initialData;
      onHydrateInitial(initialData);
    }
  }, [initialData, onHydrateInitial]);

  useEffect(() => {
    const nextSettings = currentData?.settings ?? null;
    if (nextSettings && nextSettings !== lastSyncedSettingsRef.current) {
      lastSyncedSettingsRef.current = nextSettings;
      onSyncSettings(nextSettings);
    }
  }, [currentData, onSyncSettings]);
}
