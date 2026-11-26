import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { ClientProfile } from '@/lib/types';
import {
  getInitialLetter,
  type BannerNotice,
  type ClientPackageRow,
} from './clientasTypes';

export interface ClientNoShowStats {
  noShowCount: number;
  completedCount: number;
  evaluatedCount: number;
  ratePercent: number;
}

export function buildVisitCountByClient(
  data: AdminOverviewPayload | null,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!data) return map;
  for (const b of data.bookings) {
    if (b.status === 'canceled') continue;
    map.set(b.clientId, (map.get(b.clientId) ?? 0) + 1);
  }
  return map;
}

export function buildNoShowStatsByClient(
  data: AdminOverviewPayload | null,
): Map<string, ClientNoShowStats> {
  const map = new Map<string, ClientNoShowStats>();
  if (!data) return map;
  const counts = new Map<string, { completed: number; noShow: number }>();
  for (const b of data.bookings) {
    if (b.status !== 'completed' && b.status !== 'no_show') continue;
    const entry = counts.get(b.clientId) ?? { completed: 0, noShow: 0 };
    if (b.status === 'completed') entry.completed += 1;
    else entry.noShow += 1;
    counts.set(b.clientId, entry);
  }
  for (const client of data.clients) {
    const entry = counts.get(client.id) ?? { completed: 0, noShow: 0 };
    const noShowCount = Math.max(client.noShowCount, entry.noShow);
    const completedCount = entry.completed;
    const evaluatedCount = completedCount + noShowCount;
    const ratePercent =
      evaluatedCount > 0 ? Math.round((noShowCount / evaluatedCount) * 100) : 0;
    map.set(client.id, {
      noShowCount,
      completedCount,
      evaluatedCount,
      ratePercent,
    });
  }
  return map;
}

export function buildLoyaltyByClientId(
  data: AdminOverviewPayload | null,
): Map<string, ReturnType<typeof computeClientLoyaltySummary>> {
  const map = new Map<string, ReturnType<typeof computeClientLoyaltySummary>>();
  if (!data || !data.loyaltyProgram) return map;
  const rewardServiceName = data.loyaltyProgram.rewardServiceId
    ? (data.services.find((s) => s.id === data.loyaltyProgram?.rewardServiceId)?.name ??
      null)
    : null;
  for (const client of data.clients) {
    map.set(
      client.id,
      computeClientLoyaltySummary(
        data.loyaltyProgram,
        data.loyaltyStamps,
        client.id,
        rewardServiceName,
      ),
    );
  }
  return map;
}

export function filterClientRows(
  data: AdminOverviewPayload | null,
  query: string,
  onlyBirthdays: boolean,
  currentMonth: string,
): ClientProfile[] {
  if (!data) return [];
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const qDigits = trimmed.replace(/\D/g, '');
  const filtered = data.clients.filter((c) => {
    if (onlyBirthdays && (!c.birthday || c.birthday.slice(5, 7) !== currentMonth)) {
      return false;
    }
    if (!trimmed) return true;
    const phoneDigits = c.phoneE164.replace(/\D/g, '');
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.phoneE164.toLowerCase().includes(q) ||
      (qDigits.length >= 4 && phoneDigits.includes(qDigits)) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.instagramHandle || '').toLowerCase().includes(q) ||
      c.notes.toLowerCase().includes(q)
    );
  });
  return filtered.toSorted((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
}

export function groupClientsByLetter(
  rows: readonly ClientProfile[],
): Array<[string, ClientProfile[]]> {
  const groups = new Map<string, ClientProfile[]>();
  for (const client of rows) {
    const letter = getInitialLetter(client.fullName);
    const list = groups.get(letter) ?? [];
    list.push(client);
    groups.set(letter, list);
  }
  return Array.from(groups.entries()).toSorted(([a], [b]) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'es');
  });
}

export function buildReturningClients(
  data: AdminOverviewPayload | null,
  visitCountByClient: ReadonlyMap<string, number>,
): Array<{ client: ClientProfile; visits: number }> {
  if (!data) return [];
  return data.clients
    .map((client) => ({
      client,
      visits: visitCountByClient.get(client.id) ?? 0,
    }))
    .filter((entry) => entry.visits >= 2)
    .toSorted((a, b) => b.visits - a.visits);
}

export function groupPackagesByClientId(
  clientPackages: readonly ClientPackageRow[],
): Map<string, ClientPackageRow[]> {
  const map = new Map<string, ClientPackageRow[]>();
  for (const pkg of clientPackages) {
    const list = map.get(pkg.clientId) ?? [];
    list.push(pkg);
    map.set(pkg.clientId, list);
  }
  return map;
}

export async function saveClientProfileRequest(input: {
  clientId: string;
  notes: string;
  birthday: string | null;
  email: string | null;
  instagramHandle: string | null;
}): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/clients', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      return json.error || 'No se pudo actualizar la ficha.';
    }
    return null;
  } catch {
    return 'No se pudo conectar para guardar la ficha.';
  }
}

export async function createClientProfileRequest(input: {
  fullName: string;
  phone: string;
  email: string | null;
  instagramHandle: string | null;
  birthday: string | null;
  technicalNotes: string;
}): Promise<{ ok: boolean; error?: string; conflict?: boolean }> {
  try {
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const json = (await res.json()) as { error?: string };
    if (res.status === 409) {
      return {
        ok: false,
        conflict: true,
        error: json.error || 'Ya existe una clienta registrada con ese WhatsApp.',
      };
    }
    if (!res.ok) {
      return { ok: false, error: json.error || 'Revisa los datos ingresados.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo conectar para guardar la clienta.' };
  }
}

export async function dispatchRetentionCampaignRequest(params: {
  kind: 'birthday' | 'reactivation';
  clientId: string;
  clientName: string;
  messagePreview: string;
  fallbackUrl: string;
}): Promise<{ ok: boolean; notice: BannerNotice; targetUrl?: string }> {
  try {
    const res = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: params.kind,
        clientId: params.clientId,
        messagePreview: params.messagePreview,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      error?: string;
      whatsappUrl?: string;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        notice: {
          status: 'error',
          title: json?.error || 'No se pudo registrar el envío.',
        },
      };
    }
    const targetUrl = json?.whatsappUrl || params.fallbackUrl;
    return {
      ok: true,
      targetUrl,
      notice: {
        status: 'success',
        title:
          params.kind === 'birthday'
            ? `Felicitación de cumpleaños lista para ${params.clientName}.`
            : `Mensaje de regreso listo para ${params.clientName}.`,
        whatsappUrl: targetUrl,
      },
    };
  } catch {
    return {
      ok: false,
      notice: {
        status: 'error',
        title: 'No se pudo conectar para registrar el mensaje.',
      },
    };
  }
}

export async function assignClientPackageRequest(
  targetClientId: string,
  targetPackageId: string,
  notesText: string,
): Promise<{ ok: boolean; notice: BannerNotice }> {
  try {
    const res = await fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'assign',
        clientId: targetClientId,
        packageId: targetPackageId,
        notes: notesText.trim(),
      }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return {
        ok: false,
        notice: {
          status: 'error',
          title: json?.error || 'No se pudo asignar el paquete.',
        },
      };
    }
    return {
      ok: true,
      notice: { status: 'success', title: 'Paquete asignado a la clienta.' },
    };
  } catch {
    return {
      ok: false,
      notice: {
        status: 'error',
        title: 'No se pudo conectar para asignar el paquete.',
      },
    };
  }
}

export async function redeemClientPackageSessionRequest(
  pkg: ClientPackageRow,
): Promise<{ ok: boolean; notice: BannerNotice }> {
  try {
    const res = await fetch('/api/admin/packages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', clientPackageId: pkg.id }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return {
        ok: false,
        notice: {
          status: 'error',
          title: json?.error || 'No se pudo descontar la sesión.',
        },
      };
    }
    return {
      ok: true,
      notice: {
        status: 'success',
        title: `Se descontó 1 sesión de "${pkg.packageName}" (${pkg.clientName}).`,
      },
    };
  } catch {
    return {
      ok: false,
      notice: {
        status: 'error',
        title: 'No se pudo conectar para descontar la sesión.',
      },
    };
  }
}
