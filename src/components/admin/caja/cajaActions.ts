import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import { shiftDateKey } from '@/components/admin/citas/scheduleGridGeometry';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  ADMIN_CACHE_KEYS,
  applyOptimisticBookingStatus,
  applyOptimisticBookingStatusToList,
  getAdminCacheSnapshot,
  invalidateAdminCache,
  mutateAdminCache,
} from '@/lib/hooks/useAdminCache';
import type {
  BookingWithRelations,
  PaymentMethod,
  PaymentSplitMethod,
} from '@/lib/types';
import {
  SPLIT_METHOD_ORDER,
  splitMethodLabel,
  type CommissionStaffRow,
  type MethodSummaryRow,
  type ServicePackageCatalogRow,
  type SplitDetailRow,
} from './cajaTypes';

export type CommissionPeriod = 'today' | '7d' | '30d' | 'all';

function getCommissionCutoffKey(
  todayKey: string,
  period: CommissionPeriod,
): string | null {
  if (period === 'today') return todayKey;
  if (period === '7d') return shiftDateKey(todayKey, -6);
  if (period === '30d') return shiftDateKey(todayKey, -29);
  return null;
}

export function buildSplitSummaryByMethod(
  data: AdminOverviewPayload | null,
  period: CommissionPeriod = 'all',
): MethodSummaryRow[] {
  if (!data) return [];
  const tz = data.settings.timezone || 'America/Mexico_City';
  const cutoffKey = getCommissionCutoffKey(data.serverTodayKey, period);
  const grouped = new Map<
    PaymentSplitMethod,
    { count: number; amountCents: number; tipCents: number }
  >();
  for (const split of data.paymentSplits) {
    if (
      cutoffKey &&
      getDateKeyInTimezone(new Date(split.createdAt), tz) < cutoffKey
    ) {
      continue;
    }
    const current = grouped.get(split.method) ?? {
      count: 0,
      amountCents: 0,
      tipCents: 0,
    };
    current.count += 1;
    current.amountCents += split.amountCents;
    current.tipCents += split.tipCents;
    grouped.set(split.method, current);
  }
  const rows: MethodSummaryRow[] = [];
  for (const m of SPLIT_METHOD_ORDER) {
    const stats = grouped.get(m);
    if (!stats) continue;
    rows.push({
      method: m,
      label: splitMethodLabel(m),
      count: stats.count,
      amountCents: stats.amountCents,
      tipCents: stats.tipCents,
    });
  }
  return rows;
}

export function buildSplitDetails(data: AdminOverviewPayload | null): SplitDetailRow[] {
  if (!data) return [];
  const bookingMap = new Map(data.bookings.map((b) => [b.id, b]));
  const staffMap = new Map(data.staff.map((s) => [s.id, s.name]));
  return data.paymentSplits
    .map((split) => {
      const bk = bookingMap.get(split.bookingId);
      return {
        id: split.id,
        createdAt: split.createdAt,
        bookingCode: bk?.bookingCode ?? split.bookingId,
        clientName: bk?.client.fullName ?? 'Clienta',
        method: split.method,
        amountCents: split.amountCents,
        tipCents: split.tipCents,
        tipStaffName: split.tipStaffId ? (staffMap.get(split.tipStaffId) ?? null) : null,
        reference: split.reference ?? null,
      };
    })
    .toSorted(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function buildCommissionsByStaff(
  data: AdminOverviewPayload | null,
  period: CommissionPeriod = 'all',
): CommissionStaffRow[] {
  if (!data) return [];
  const tz = data.settings.timezone || 'America/Mexico_City';
  const cutoffKey = getCommissionCutoffKey(data.serverTodayKey, period);
  const scopedCashEntries = cutoffKey
    ? data.cashEntries.filter(
        (e) => getDateKeyInTimezone(new Date(e.occurredAt), tz) >= cutoffKey,
      )
    : data.cashEntries;
  const scopedSplits = cutoffKey
    ? data.paymentSplits.filter(
        (split) => getDateKeyInTimezone(new Date(split.createdAt), tz) >= cutoffKey,
      )
    : data.paymentSplits;
  return data.staff.map((st) => {
    const entries = scopedCashEntries.filter((e) => e.staffId === st.id);
    const sales = entries.reduce((s, e) => s + e.amountCents, 0);
    const commission = entries.reduce((s, e) => s + e.commissionCents, 0);
    const tips = entries.reduce((s, e) => s + e.tipCents, 0);
    const splitTipsEntries = scopedSplits.filter(
      (split) => split.tipStaffId === st.id && split.tipCents > 0,
    );
    const splitTipsCents = splitTipsEntries.reduce((s, item) => s + item.tipCents, 0);
    return {
      id: st.id,
      name: st.name,
      percent: st.commissionPercent,
      servicesCount: entries.filter((e) => e.amountCents > 0).length,
      sales,
      commission,
      tips,
      splitTipsCents,
      splitTipsCount: splitTipsEntries.length,
      totalPayout: commission + tips,
    };
  });
}

export async function approveCajaDeposit(
  data: AdminOverviewPayload,
  bookingId: string,
  bookingCode: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const prevOverview =
    getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) ?? data;
  const prevBookings = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
    ADMIN_CACHE_KEYS.bookings,
  );

  mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
    applyOptimisticBookingStatus(current ?? prevOverview, bookingId, 'confirmed'),
  );
  if (prevBookings) {
    mutateAdminCache<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
      (current) =>
        current
          ? applyOptimisticBookingStatusToList(current, bookingId, 'confirmed')
          : current,
    );
  }

  const rollback = () => {
    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
    if (prevBookings) {
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        prevBookings,
      );
    }
  };

  try {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, status: 'confirmed' }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      rollback();
      return { ok: false, error: json?.error || 'No se pudo confirmar el anticipo.' };
    }
    invalidateAdminCache('/api/admin/reports');
    return {
      ok: true,
      message: `Anticipo confirmado y cita ${bookingCode} lista en agenda.`,
    };
  } catch {
    rollback();
    return { ok: false, error: 'No se pudo conectar para confirmar el anticipo.' };
  }
}

function applyOptimisticDepositRejection(
  overview: AdminOverviewPayload,
  bookingId: string,
  rejectedAtIso: string,
): AdminOverviewPayload {
  return {
    ...overview,
    bookings: overview.bookings.map((booking) =>
      booking.id === bookingId
        ? {
            ...booking,
            paymentProofUrl: null,
            proofDeliveryMethod: 'none',
            proofRejectedAt: rejectedAtIso,
            updatedAt: rejectedAtIso,
          }
        : booking,
    ),
    pendingDeposits: overview.pendingDeposits.map((dep) =>
      dep.bookingId === bookingId
        ? {
            ...dep,
            paymentProofUrl: null,
            proofDeliveryMethod: 'none',
          }
        : dep,
    ),
  };
}

function applyOptimisticDepositRejectionToList(
  payload: { bookings: BookingWithRelations[] },
  bookingId: string,
  rejectedAtIso: string,
): { bookings: BookingWithRelations[] } {
  return {
    bookings: payload.bookings.map((booking) =>
      booking.id === bookingId
        ? {
            ...booking,
            paymentProofUrl: null,
            proofDeliveryMethod: 'none',
            proofRejectedAt: rejectedAtIso,
            updatedAt: rejectedAtIso,
          }
        : booking,
    ),
  };
}

export async function rejectCajaDeposit(
  data: AdminOverviewPayload,
  bookingId: string,
  bookingCode: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const prevOverview =
    getAdminCacheSnapshot<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview) ?? data;
  const prevBookings = getAdminCacheSnapshot<{ bookings: BookingWithRelations[] }>(
    ADMIN_CACHE_KEYS.bookings,
  );
  const rejectedAtIso = new Date().toISOString();

  mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
    applyOptimisticDepositRejection(current ?? prevOverview, bookingId, rejectedAtIso),
  );
  if (prevBookings) {
    mutateAdminCache<{ bookings: BookingWithRelations[] }>(
      ADMIN_CACHE_KEYS.bookings,
      (current) =>
        current
          ? applyOptimisticDepositRejectionToList(current, bookingId, rejectedAtIso)
          : current,
    );
  }

  const rollback = () => {
    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, prevOverview);
    if (prevBookings) {
      mutateAdminCache<{ bookings: BookingWithRelations[] }>(
        ADMIN_CACHE_KEYS.bookings,
        prevBookings,
      );
    }
  };

  try {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject_deposit', bookingId }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      rollback();
      return { ok: false, error: json?.error || 'No se pudo rechazar el comprobante.' };
    }
    invalidateAdminCache('/api/admin/reports');
    return {
      ok: true,
      message: `Comprobante de ${bookingCode} rechazado. Ya avisamos a la clienta para que suba uno nuevo.`,
    };
  } catch {
    rollback();
    return { ok: false, error: 'No se pudo conectar para rechazar el comprobante.' };
  }
}

export async function recordCajaCashEntry(input: {
  entryType: 'expense' | 'product_sale' | 'service_income';
  description: string;
  amountMxn: number;
  method: PaymentMethod;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'cash',
        data: {
          bookingId: null,
          staffId: null,
          entryType: input.entryType,
          description: input.description,
          amountCents: Math.round(input.amountMxn * 100),
          tipCents: 0,
          commissionCents: 0,
          paymentMethod: input.method,
        },
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: json?.error || 'No se pudo guardar el movimiento.' };
    }
    const message =
      input.entryType === 'expense'
        ? 'Gasto registrado en caja.'
        : input.entryType === 'product_sale'
          ? 'Venta registrada en caja.'
          : 'Ingreso registrado en caja.';
    return { ok: true, message };
  } catch {
    return { ok: false, error: 'No se pudo conectar para guardar el movimiento.' };
  }
}

export async function createCajaCoupon(input: {
  code: string;
  kind: 'coupon' | 'gift_card';
  discountType: 'percent' | 'fixed_cents';
  value: number;
  recipient: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  const isFixed = input.kind === 'gift_card' || input.discountType === 'fixed_cents';
  try {
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'coupon',
        data: {
          code: input.code,
          kind: input.kind,
          discountType: isFixed ? 'fixed_cents' : 'percent',
          discountValue: isFixed ? Math.round(input.value * 100) : input.value,
          remainingBalanceCents:
            input.kind === 'gift_card' ? Math.round(input.value * 100) : null,
          maxUses: input.kind === 'gift_card' ? 1 : 100,
          minSubtotalCents: 0,
          expiresAt: null,
          recipientName: input.recipient || null,
          isActive: true,
        },
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: json?.error || 'No se pudo crear el código.' };
    }
    return {
      ok: true,
      message:
        input.kind === 'gift_card'
          ? 'Tarjeta de regalo activada para tus clientas.'
          : 'Cupón activado en tu página de citas.',
    };
  } catch {
    return { ok: false, error: 'No se pudo conectar para crear el código.' };
  }
}

export async function createCajaPackage(input: {
  name: string;
  description: string;
  serviceId: string;
  totalSessions: number;
  priceMxn: number;
  validDays: number;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'catalog',
        name: input.name,
        description: input.description,
        serviceId: input.serviceId,
        totalSessions: Math.max(2, Math.min(24, Math.round(input.totalSessions || 2))),
        priceCents: Math.max(0, Math.round((input.priceMxn || 0) * 100)),
        validDays:
          input.validDays > 0
            ? Math.max(7, Math.min(730, Math.round(input.validDays)))
            : null,
        isActive: true,
      }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: json?.error || 'No se pudo crear el paquete de sesiones.' };
    }
    return { ok: true, message: 'Paquete de sesiones guardado.' };
  } catch {
    return { ok: false, error: 'No se pudo conectar para guardar el paquete.' };
  }
}

export async function toggleCajaPackage(
  pkg: ServicePackageCatalogRow,
  nextActive: boolean,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/packages', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'toggle_catalog',
        packageId: pkg.id,
        isActive: nextActive,
      }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: json?.error || 'No se pudo actualizar el paquete.' };
    }
    return {
      ok: true,
      message: nextActive
        ? `Paquete "${pkg.name}" activado.`
        : `Paquete "${pkg.name}" pausado.`,
    };
  } catch {
    return { ok: false, error: 'No se pudo conectar para actualizar el paquete.' };
  }
}

export async function exportCajaCsv(
  ownerPin?: string,
): Promise<
  | { status: 'ok' }
  | { status: 'pin_required'; error: string | null }
  | { status: 'error'; error: string }
> {
  try {
    const headers: Record<string, string> = {};
    if (ownerPin) {
      headers['x-owner-pin'] = ownerPin;
    }
    const res = await fetch('/api/admin/operations?export=csv', {
      method: 'GET',
      headers,
    });
    if (res.status === 403) {
      const errJson = (await res.json().catch(() => null)) as {
        code?: string;
        error?: string;
      } | null;
      if (
        errJson?.code === 'OWNER_PIN_REQUIRED' ||
        errJson?.code === 'OWNER_PIN_INVALID'
      ) {
        return {
          status: 'pin_required',
          error:
            errJson.code === 'OWNER_PIN_INVALID'
              ? errJson.error || 'PIN de dueña incorrecto.'
              : null,
        };
      }
      return {
        status: 'error',
        error: errJson?.error || 'No tienes permiso para descargar el archivo.',
      };
    }
    if (!res.ok) {
      return { status: 'error', error: 'No se pudo descargar el archivo.' };
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'nails-reporte-caja.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
    return { status: 'ok' };
  } catch {
    return { status: 'error', error: 'No se pudo conectar para descargar el archivo.' };
  }
}
