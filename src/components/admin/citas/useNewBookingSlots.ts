'use client';

import { useState } from 'react';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { QuickSlotOption } from './NewBookingSlotStep';
import { fetchNewBookingRangeSlots } from './newBookingApi';

interface UseNewBookingSlotsParams {
  isOpen: boolean;
  serviceId: string;
  extraServiceIds: readonly string[];
  addonIds: readonly string[];
  staffId: string;
  startDate: string;
  preferredStartAt?: string;
  preferredStaffId?: string;
  onSyncStart: () => void;
}

export function useNewBookingSlots({
  isOpen,
  serviceId,
  extraServiceIds,
  addonIds,
  staffId,
  startDate,
  preferredStartAt,
  preferredStaffId,
  onSyncStart,
}: UseNewBookingSlotsParams) {
  const [slots, setSlots] = useState<QuickSlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<QuickSlotOption | null>(null);

  const syncKey = isOpen
    ? `${serviceId}|${extraServiceIds.join(',')}|${addonIds.join(',')}|${staffId}|${startDate}|${preferredStartAt ?? ''}`
    : 'closed';

  useExternalSync(syncKey, async (signal, key) => {
    if (key === 'closed' || !serviceId) return;
    setLoadingSlots(true);
    onSyncStart();
    try {
      const flattened = await fetchNewBookingRangeSlots(
        { serviceId, extraServiceIds, addonIds, staffId, startDate },
        signal,
      );
      if (signal.aborted) return;
      setSlots(flattened);
      const matchedPreferred = preferredStartAt
        ? flattened.find(
            (s) =>
              s.startAt === preferredStartAt &&
              (!preferredStaffId || s.staffId === preferredStaffId),
          )
        : null;
      setSelectedSlot(matchedPreferred ?? flattened[0] ?? null);
    } catch {
      if (!signal.aborted) {
        setSlots([]);
        setSelectedSlot(null);
      }
    } finally {
      if (!signal.aborted) setLoadingSlots(false);
    }
  });

  return { slots, loadingSlots, selectedSlot, setSelectedSlot };
}
