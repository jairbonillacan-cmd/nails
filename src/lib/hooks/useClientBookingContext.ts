'use client';

import { useMemo, useState } from 'react';
import {
  NAIL_ALERTS,
  formatNailTechBadges,
  parseNailTechNotes,
  type NailAlert,
  type NailTechBadge,
  type ParsedNailTechNotes,
} from '@/components/admin/clientas/nailTechProfile';
import type { ClientPackageSummaryRow } from '@/components/admin/citas/CheckoutLoyaltySection';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import {
  computeClientLoyaltySummary,
  type ClientLoyaltySummary,
} from '@/lib/loyalty/stamps';
import type {
  BookingWithRelations,
  ClientProfile,
  LoyaltyProgram,
  LoyaltyStamp,
} from '@/lib/types';
import { useExternalSync } from './useExternalSync';

function normalizeAlertText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectSafetyAlerts(
  structuredAlerts: readonly NailAlert[],
  freeNotes: string,
  clientNotes: string,
  internalNotes: string,
): NailAlert[] {
  const matched = new Set<NailAlert>(structuredAlerts);
  const combined = normalizeAlertText(`${freeNotes} ${clientNotes} ${internalNotes}`);
  if (combined.trim()) {
    for (const alert of NAIL_ALERTS) {
      if (combined.includes(normalizeAlertText(alert))) {
        matched.add(alert);
      }
    }
  }
  return NAIL_ALERTS.filter((alert) => matched.has(alert));
}

async function fetchActivePackagesForBooking(
  clientId: string,
  serviceId: string,
  signal: AbortSignal,
): Promise<ClientPackageSummaryRow[]> {
  const res = await fetchJsonWithTimeout<{ clientPackages?: ClientPackageSummaryRow[] }>(
    `/api/admin/packages?clientId=${encodeURIComponent(clientId)}`,
    {
      cache: 'no-store',
      signal,
    },
  );
  if (signal.aborted || res.aborted || !res.ok) return [];
  return (res.data.clientPackages ?? [])
    .filter((pkg) => pkg.status === 'active' && !pkg.isExpired && pkg.remainingSessions > 0)
    .toSorted((a, b) => {
      const aMatch = a.serviceId === serviceId ? 0 : 1;
      const bMatch = b.serviceId === serviceId ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return b.remainingSessions - a.remainingSessions;
    });
}

interface UseClientBookingContextParams {
  booking: BookingWithRelations | null;
  clients?: readonly ClientProfile[];
  allBookings?: readonly BookingWithRelations[];
  loyaltyProgram?: LoyaltyProgram | null;
  loyaltyStamps?: readonly LoyaltyStamp[];
  syncScope: 'popover' | 'checkout';
  onPackagesCleared?: () => void;
}

interface ClientBookingContextResult {
  fullClientProfile: ClientProfile | null;
  loyaltySummary: ClientLoyaltySummary | null;
  clientPackages: ClientPackageSummaryRow[];
  parsedClientNotes: ParsedNailTechNotes;
  techBadges: NailTechBadge[];
  safetyAlerts: NailAlert[];
  lastCompletedBooking: BookingWithRelations | null;
}

export function useClientBookingContext({
  booking,
  clients = [],
  allBookings = [],
  loyaltyProgram = null,
  loyaltyStamps = [],
  syncScope,
  onPackagesCleared,
}: UseClientBookingContextParams): ClientBookingContextResult {
  const [clientPackages, setClientPackages] = useState<ClientPackageSummaryRow[]>([]);

  const packageSyncKey = booking
    ? `${syncScope}-pkg|${booking.clientId}|${booking.id}`
    : `${syncScope}-pkg-closed`;

  useExternalSync(packageSyncKey, async (signal, key) => {
    if (key === `${syncScope}-pkg-closed` || !booking) {
      setClientPackages([]);
      onPackagesCleared?.();
      return;
    }
    try {
      const active = await fetchActivePackagesForBooking(
        booking.clientId,
        booking.serviceId,
        signal,
      );
      if (!signal.aborted) {
        setClientPackages(active);
      }
    } catch {
      if (!signal.aborted) {
        setClientPackages([]);
      }
    }
  });

  const fullClientProfile = useMemo(() => {
    if (!booking) return null;
    return clients.find((c) => c.id === booking.clientId) ?? booking.client;
  }, [booking, clients]);

  const parsedClientNotes = useMemo(
    () => parseNailTechNotes(fullClientProfile?.notes ?? ''),
    [fullClientProfile?.notes],
  );

  const techBadges = useMemo(
    () => formatNailTechBadges(parsedClientNotes.profile),
    [parsedClientNotes.profile],
  );

  const safetyAlerts = useMemo(
    () =>
      booking
        ? detectSafetyAlerts(
            parsedClientNotes.profile.alerts,
            parsedClientNotes.freeNotes,
            booking.clientNotes,
            booking.internalNotes,
          )
        : [],
    [booking, parsedClientNotes.freeNotes, parsedClientNotes.profile.alerts],
  );

  const loyaltySummary = useMemo(
    () =>
      booking && loyaltyProgram
        ? computeClientLoyaltySummary(loyaltyProgram, loyaltyStamps, booking.clientId)
        : null,
    [booking, loyaltyProgram, loyaltyStamps],
  );

  const lastCompletedBooking = useMemo(() => {
    if (!booking || allBookings.length === 0) return null;
    const pastVisits = allBookings
      .filter(
        (item) =>
          item.clientId === booking.clientId &&
          item.id !== booking.id &&
          item.status === 'completed',
      )
      .toSorted((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt));
    return pastVisits[0] ?? null;
  }, [allBookings, booking]);

  return {
    fullClientProfile,
    loyaltySummary,
    clientPackages,
    parsedClientNotes,
    techBadges,
    safetyAlerts,
    lastCompletedBooking,
  };
}
