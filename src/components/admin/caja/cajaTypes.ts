import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
import { hasBookingProofSubmitted } from '@/lib/booking/balance';
import type { PaymentMethod, PaymentSplitMethod } from '@/lib/types';

export type CajaTab = 'summary' | 'deposits' | 'commissions' | 'promos';
export type PromosSubTab = 'coupons' | 'packages';
export type PendingDepositRow = AdminOverviewPayload['pendingDeposits'][number];
export type UncollectedBookingRow = AdminOverviewPayload['uncollectedBookings'][number];

export interface ServicePackageCatalogRow {
  id: string;
  name: string;
  description: string;
  serviceId: string;
  totalSessions: number;
  priceCents: number;
  validDays: number | null;
  isActive: boolean;
  createdAt: string;
}

export interface MethodSummaryRow {
  method: PaymentSplitMethod;
  label: string;
  count: number;
  amountCents: number;
  tipCents: number;
}

export type SplitDetailRow = {
  id: string;
  createdAt: string;
  bookingCode: string;
  clientName: string;
  method: PaymentSplitMethod;
  amountCents: number;
  tipCents: number;
  tipStaffName: string | null;
  reference: string | null;
};

export type CommissionStaffRow = {
  id: string;
  name: string;
  percent: number;
  retailPercent: number;
  servicesCount: number;
  sales: number;
  serviceSales: number;
  serviceCommission: number;
  retailSales: number;
  retailCommission: number;
  otherCommission: number;
  commission: number;
  tips: number;
  splitTipsCents: number;
  splitTipsCount: number;
  totalPayout: number;
};

export const SPLIT_METHOD_ORDER: readonly PaymentSplitMethod[] = [
  'cash',
  'card',
  'transfer',
  'giftcard',
  'online',
];

export function splitMethodLabel(method: PaymentSplitMethod): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  if (method === 'giftcard') return 'Tarjeta de regalo';
  return 'Pago en línea';
}

export function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia';
  return 'Tarjeta de regalo';
}

export function splitMethodTokenColor(
  method: PaymentSplitMethod,
): 'green' | 'blue' | 'purple' | 'pink' | 'teal' {
  if (method === 'cash') return 'green';
  if (method === 'card') return 'blue';
  if (method === 'transfer') return 'purple';
  if (method === 'giftcard') return 'pink';
  return 'teal';
}

export function formatInstagramDisplay(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

export function formatInstagramUrl(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`;
}

export function proofMethodMeta(method: PendingDepositRow['proofDeliveryMethod']): {
  label: string;
  color: 'blue' | 'purple' | 'yellow';
} {
  if (method === 'web_upload') return { label: 'Foto subida', color: 'blue' };
  if (method === 'web_link') return { label: 'Enlace de recibo', color: 'blue' };
  if (method === 'instagram_dm') return { label: 'Por Instagram', color: 'purple' };
  return { label: 'Sin comprobante aún', color: 'yellow' };
}

export function isImageProofHref(
  url: string | null,
  method?: PendingDepositRow['proofDeliveryMethod'],
): url is string {
  if (!url) return false;
  if (method === 'web_link' || url.startsWith('https://')) return false;
  return url.startsWith('/api/media/');
}

export function isSafeProofHref(url: string | null): url is string {
  if (!url) return false;
  return url.startsWith('/api/media/') || url.startsWith('https://');
}

export function hasCajaDepositProof(
  deposit: Pick<PendingDepositRow, 'proofDeliveryMethod' | 'paymentProofUrl'>,
): boolean {
  return hasBookingProofSubmitted(deposit);
}

export function formatCajaDepositsBreakdown(
  awaitingReviewCount: number,
  missingProofCount: number,
): string {
  if (awaitingReviewCount > 0 && missingProofCount > 0) {
    return `${awaitingReviewCount} por revisar · ${missingProofCount} sin comprobante`;
  }
  if (awaitingReviewCount > 0) {
    return `${awaitingReviewCount} ${awaitingReviewCount === 1 ? 'comprobante' : 'comprobantes'} por revisar`;
  }
  if (missingProofCount > 0) {
    return `${missingProofCount} sin comprobante`;
  }
  return 'Todo revisado';
}

export function resolveInitialCajaRoute(
  param: string | null,
  subParam?: string | null,
): {
  tab: CajaTab;
  highlightUncollected: boolean;
  promosView: PromosSubTab;
} {
  if (param === 'comisiones' || param === 'commissions') {
    return { tab: 'commissions', highlightUncollected: false, promosView: 'coupons' };
  }
  if (param === 'promos') {
    const promosView: PromosSubTab =
      subParam === 'packages' || subParam === 'paquetes' ? 'packages' : 'coupons';
    return { tab: 'promos', highlightUncollected: false, promosView };
  }
  if (param === 'cupones' || param === 'coupons') {
    return { tab: 'promos', highlightUncollected: false, promosView: 'coupons' };
  }
  if (param === 'paquetes' || param === 'packages') {
    return { tab: 'promos', highlightUncollected: false, promosView: 'packages' };
  }
  if (param === 'anticipos' || param === 'receivable' || param === 'deposits') {
    return { tab: 'deposits', highlightUncollected: false, promosView: 'coupons' };
  }
  if (param === 'sin-cobrar' || param === 'uncollected') {
    return { tab: 'summary', highlightUncollected: true, promosView: 'coupons' };
  }
  return { tab: 'summary', highlightUncollected: false, promosView: 'coupons' };
}
