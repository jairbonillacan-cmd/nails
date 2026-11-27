'use client';

import { useState } from 'react';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { QuickSlotOption } from './NewBookingSlotStep';
import { fetchNewBookingRangeSlots } from './newBookingApi';

interface UseNewBookingSlotsParams {
  isOpen: boolean;
  serviceId: string;
  extraServiceIds: readonly string[];
  addonIds?: readonly string[];
  staffId: string;
  startDate: string;
  days?: number;
  limit?: number;
  preferredStartAt?: string;
  preferredStaffId?: string;
  onSyncStart?: () => void;
}

export function useNewBookingSlots({
  isOpen,
  serviceId,
  extraServiceIds,
  addonIds = [],
  staffId,
  startDate,
  days = 14,
  limit = 16,
  preferredStartAt,
  preferredStaffId,
  onSyncStart,
}: UseNewBookingSlotsParams) {
  const [slots, setSlots] = useState<QuickSlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<QuickSlotOption | null>(null);

  const syncKey = isOpen
    ? `${serviceId}|${extraServiceIds.join(',')}|${addonIds.join(',')}|${staffId}|${startDate}|${days}|${limit}|${preferredStartAt ?? ''}`
    : 'closed';

  useExternalSync(syncKey, async (signal, key) => {
    if (key === 'closed' || !serviceId) return;
    setLoadingSlots(true);
    setErrorText(null);
    onSyncStart?.();
    try {
      const result = await fetchNewBookingRangeSlots(
        { serviceId, extraServiceIds, addonIds, staffId, startDate, days, limit },
        signal,
      );
      if (signal.aborted) return;
      if (result.error) {
        setErrorText(result.error);
        setSlots([]);
        setSelectedSlot(null);
        return;
      }
      setSlots(result.slots);
      const matchedPreferred = preferredStartAt
        ? result.slots.find(
            (s) =>
              s.startAt === preferredStartAt &&
              (!preferredStaffId || s.staffId === preferredStaffId),
          )
        : null;
      setSelectedSlot(matchedPreferred ?? result.slots[0] ?? null);
    } catch {
      if (!signal.aborted) {
        setErrorText('Error de conexión al buscar horarios.');
        setSlots([]);
        setSelectedSlot(null);
      }
    } finally {
      if (!signal.aborted) setLoadingSlots(false);
    }
  });

  return { slots, loadingSlots, errorText, selectedSlot, setSelectedSlot };
}
