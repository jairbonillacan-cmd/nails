import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
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
  CajaConfig,
  CashRegisterEntry,
  Coupon,
  PaymentMethod,
  PaymentSplitMethod,
  StaffMember,
} from '@/lib/types';
import {
  computeCommissionsByStaff,
  isIsoInCajaPeriod,
  type CajaCustomRange,
  type CajaPeriod,
  type CouponPayloadData,
} from './cajaMetrics';
import {
  SPLIT_METHOD_ORDER,
  splitMethodLabel,
  type CommissionStaffRow,
  type MethodSummaryRow,
  type ServicePackageCatalogRow,
  type SplitDetailRow,
} from './cajaTypes';

export function buildSplitSummaryByMethod(
  data: AdminOverviewPayload | null,
  period: CajaPeriod = 'all',
  custom?: CajaCustomRange | null,
): MethodSummaryRow[] {
  if (!data) return [];
  const tz = data.settings.timezone || 'America/Mexico_City';
  const grouped = new Map<
    PaymentSplitMethod,
    { count: number; amountCents: number; tipCents: number }
  >();
  for (const split of data.paymentSplits) {
    if (!isIsoInCajaPeriod(split.createdAt, data.serverTodayKey, tz, period, custom)) {
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
  period: CajaPeriod = 'all',
  custom?: CajaCustomRange | null,
  retailCommissionPercent?: number,
): CommissionStaffRow[] {
  if (!data) return [];
  return computeCommissionsByStaff({
    staff: data.staff,
    cashEntries: data.cashEntries,
    paymentSplits: data.paymentSplits,
    todayKey: data.serverTodayKey,
    tz: data.settings.timezone || 'America/Mexico_City',
    period,
    custom,
    retailCommissionPercent,
    viewerRole: data.session.user.role,
    viewerStaffId: data.session.user.staffMemberId,
  });
}

const CAJA_MUTATION_TIMEOUT_MS = 20_000;

function isCajaTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
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

  try {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({ bookingId, status: 'confirmed' }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: json?.error || 'No se pudo confirmar el anticipo.' };
    }
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
    invalidateAdminCache('/api/admin/reports');
    return {
      ok: true,
      message: `Anticipo confirmado y cita ${bookingCode} lista en agenda.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'La confirmación tardó demasiado. Intenta de nuevo en unos segundos.'
        : 'No se pudo conectar para confirmar el anticipo.',
    };
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

  try {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({ action: 'reject_deposit', bookingId }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return { ok: false, error: json?.error || 'No se pudo rechazar el comprobante.' };
    }
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
    invalidateAdminCache('/api/admin/reports');
    return {
      ok: true,
      message: `Comprobante de ${bookingCode} rechazado. Ya avisamos a la clienta para que suba uno nuevo.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'El rechazo del comprobante tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para rechazar el comprobante.',
    };
  }
}

export interface RecordCajaEntryInput {
  entryType: 'expense' | 'product_sale' | 'service_income';
  description: string;
  amountMxn: number;
  method: PaymentMethod;
  staffId?: string | null;
  inventoryItemId?: string | null;
  inventoryQuantity?: number;
  productName?: string;
}

export async function recordCajaCashEntry(
  input: RecordCajaEntryInput,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const isInventorySale =
      input.entryType === 'product_sale' && Boolean(input.inventoryItemId);

    const payload = isInventorySale
      ? {
          kind: 'inventory' as const,
          data: {
            itemId: input.inventoryItemId ?? '',
            delta: -Math.max(1, Math.round(input.inventoryQuantity ?? 1)),
            reason: 'retail_sale' as const,
            paymentMethod: input.method,
            staffId: input.staffId ?? null,
            notes: input.description,
          },
        }
      : {
          kind: 'cash' as const,
          data: {
            bookingId: null,
            staffId: input.staffId ?? null,
            entryType: input.entryType,
            description: input.description,
            amountCents: Math.round(input.amountMxn * 100),
            tipCents: 0,
            commissionCents: 0,
            paymentMethod: input.method,
          },
        };

    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: json?.error || 'No se pudo guardar el movimiento.' };
    }
    invalidateAdminCache('/api/admin/reports');
    const message = isInventorySale
      ? `Venta de ${input.productName ?? 'producto'} registrada y stock actualizado.`
      : input.entryType === 'expense'
        ? 'Gasto registrado en caja.'
        : input.entryType === 'product_sale'
          ? 'Venta registrada en caja.'
          : 'Ingreso registrado en caja.';
    return { ok: true, message };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'El registro tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para guardar el movimiento.',
    };
  }
}

export interface UpdateCajaCashEntryInput {
  entryType: 'expense' | 'product_sale' | 'service_income';
  description: string;
  amountMxn: number;
  method: PaymentMethod;
  staffId: string | null;
  tipMxn?: number;
}

export async function updateCajaCashEntry(
  entryId: string,
  input: UpdateCajaCashEntryInput,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/operations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({
        kind: 'cash',
        id: entryId,
        data: {
          entryType: input.entryType,
          description: input.description.trim(),
          amountCents: Math.round(input.amountMxn * 100),
          paymentMethod: input.method,
          staffId: input.staffId,
          ...(input.tipMxn !== undefined
            ? { tipCents: Math.max(0, Math.round(input.tipMxn * 100)) }
            : {}),
        },
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      entry?: CashRegisterEntry;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error || 'No se pudo actualizar el movimiento.',
      };
    }
    if (json?.entry) {
      const updated = json.entry;
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
        current
          ? {
              ...current,
              cashEntries: current.cashEntries.map((item) =>
                item.id === entryId ? updated : item,
              ),
            }
          : current,
      );
    }
    invalidateAdminCache('/api/admin/reports');
    return { ok: true, message: 'Movimiento actualizado correctamente.' };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'La actualización tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para actualizar el movimiento.',
    };
  }
}

export async function deleteCajaCashEntry(
  entryId: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(
      `/api/admin/operations?kind=cash&id=${encodeURIComponent(entryId)}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      },
    );
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error || 'No se pudo eliminar el movimiento.',
      };
    }
    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      current
        ? {
            ...current,
            cashEntries: current.cashEntries.filter((item) => item.id !== entryId),
          }
        : current,
    );
    invalidateAdminCache('/api/admin/reports');
    return { ok: true, message: 'Movimiento manual eliminado de caja.' };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'La eliminación tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para eliminar el movimiento.',
    };
  }
}

export async function saveCajaCoupon(
  data: CouponPayloadData,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const isEditing = Boolean(data.id);
  try {
    const res = await fetch('/api/admin/operations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({
        kind: 'coupon',
        data,
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      coupon?: Coupon;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error:
          json?.error ||
          (isEditing
            ? 'No se pudieron guardar los cambios del código.'
            : 'No se pudo crear el código.'),
      };
    }
    if (json?.coupon) {
      const saved = json.coupon;
      mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) => {
        if (!current) return current;
        const exists = current.coupons.some((item) => item.id === saved.id);
        return {
          ...current,
          coupons: exists
            ? current.coupons.map((item) => (item.id === saved.id ? saved : item))
            : [saved, ...current.coupons],
        };
      });
    }
    return {
      ok: true,
      message: isEditing
        ? `Código ${data.code} actualizado.`
        : data.kind === 'gift_card'
          ? 'Tarjeta de regalo activada para tus clientas.'
          : 'Cupón activado en tu página de citas.',
    };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'Guardar el código tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para guardar el código.',
    };
  }
}

export async function toggleCajaCouponActive(
  coupon: Coupon,
  nextActive: boolean,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const result = await saveCajaCoupon({
    id: coupon.id,
    code: coupon.code,
    kind: coupon.kind,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    remainingBalanceCents: coupon.remainingBalanceCents,
    maxUses: coupon.maxUses,
    minSubtotalCents: coupon.minSubtotalCents,
    expiresAt: coupon.expiresAt,
    recipientName: coupon.recipientName,
    isActive: nextActive,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    message: nextActive
      ? `Código ${coupon.code} activado.`
      : `Código ${coupon.code} pausado.`,
  };
}

export async function deleteCajaCoupon(
  couponId: string,
  code: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(
      `/api/admin/operations?kind=coupon&id=${encodeURIComponent(couponId)}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      },
    );
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      code?: string;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error:
          json?.error ||
          (res.status === 404
            ? 'Este código ya no existe o fue eliminado anteriormente.'
            : 'No se pudo eliminar el código.'),
      };
    }
    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      current
        ? {
            ...current,
            coupons: current.coupons.filter((item) => item.id !== couponId),
          }
        : current,
    );
    invalidateAdminCache('/api/admin/reports');
    return {
      ok: true,
      message: `Código ${json?.code || code} eliminado.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'La eliminación del código tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para eliminar el código.',
    };
  }
}

export async function updateCajaStaffCommission(
  staffMember: StaffMember,
  commissionPercent: number,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const safePercent = Math.max(0, Math.min(100, Math.round(commissionPercent)));
  try {
    const res = await fetch('/api/admin/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({
        kind: 'staff',
        data: {
          id: staffMember.id,
          name: staffMember.name,
          commissionPercent: safePercent,
        },
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      staff?: StaffMember;
      error?: string;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error || 'No se pudo actualizar el porcentaje de comisión.',
      };
    }
    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      current
        ? {
            ...current,
            staff: current.staff.map((member) =>
              member.id === staffMember.id
                ? {
                    ...member,
                    commissionPercent: json?.staff?.commissionPercent ?? safePercent,
                  }
                : member,
            ),
          }
        : current,
    );
    invalidateAdminCache('/api/admin/reports');
    return {
      ok: true,
      message: `Comisión de ${staffMember.name} actualizada a ${safePercent}%.`,
    };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'La actualización tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para actualizar la comisión.',
    };
  }
}

export interface SaveCajaPackageInput {
  id?: string;
  name: string;
  description: string;
  serviceId: string;
  totalSessions: number;
  priceMxn: number;
  validDays: number;
  isActive: boolean;
}

export async function saveCajaPackage(
  input: SaveCajaPackageInput,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const isEditing = Boolean(input.id);
  try {
    const res = await fetch('/api/admin/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({
        kind: 'catalog',
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        description: input.description,
        serviceId: input.serviceId,
        totalSessions: Math.max(2, Math.min(24, Math.round(input.totalSessions || 2))),
        priceCents: Math.max(0, Math.round((input.priceMxn || 0) * 100)),
        validDays:
          input.validDays > 0
            ? Math.max(7, Math.min(730, Math.round(input.validDays)))
            : null,
        isActive: input.isActive,
      }),
    });
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    if (!res.ok) {
      return {
        ok: false,
        error:
          json?.error ||
          (isEditing
            ? 'No se pudieron guardar los cambios del paquete.'
            : 'No se pudo crear el paquete de sesiones.'),
      };
    }
    return {
      ok: true,
      message: isEditing
        ? `Paquete "${input.name}" actualizado.`
        : 'Paquete de sesiones guardado.',
    };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'Guardar el paquete tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para guardar el paquete.',
    };
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
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
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
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'Actualizar el paquete tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para actualizar el paquete.',
    };
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
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS * 2),
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
  } catch (err) {
    return {
      status: 'error',
      error: isCajaTimeoutError(err)
        ? 'La descarga tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para descargar el archivo.',
    };
  }
}

export async function saveCajaConfig(
  config: CajaConfig,
): Promise<{ ok: true; config: CajaConfig; message: string } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/admin/caja-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(CAJA_MUTATION_TIMEOUT_MS),
      body: JSON.stringify({ cajaConfig: config }),
    });
    const json = (await res.json().catch(() => null)) as {
      cajaConfig?: CajaConfig;
      error?: string;
    } | null;
    if (!res.ok || !json?.cajaConfig) {
      return { ok: false, error: json?.error || 'No se pudo guardar la configuración de caja.' };
    }
    const saved = json.cajaConfig;
    mutateAdminCache<AdminOverviewPayload>(ADMIN_CACHE_KEYS.overview, (current) =>
      current
        ? {
            ...current,
            settings: {
              ...current.settings,
              landingContent: { ...current.settings.landingContent, cajaConfig: saved },
            },
          }
        : current,
    );
    return { ok: true, config: saved, message: 'Preferencias de caja guardadas.' };
  } catch (err) {
    return {
      ok: false,
      error: isCajaTimeoutError(err)
        ? 'Guardar la configuración tardó demasiado. Intenta de nuevo.'
        : 'No se pudo conectar para guardar la configuración de caja.',
    };
  }
}
