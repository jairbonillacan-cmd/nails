import type { AdminOverviewPayload } from '@/components/admin/AdminProvider';
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
  servicesCount: number;
  sales: number;
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
  if (method === 'transfer') return 'Transferencia SPEI';
  if (method === 'giftcard') return 'Tarjeta de regalo';
  return 'Pago en línea';
}

export function paymentMethodLabel(method: PaymentMethod): string {
  if (method === 'cash') return 'Efectivo';
  if (method === 'card') return 'Tarjeta';
  if (method === 'transfer') return 'Transferencia SPEI';
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
  if (method === 'instagram_dm') return { label: 'Por Instagram', color: 'purple' };
  return { label: 'Sin comprobante aún', color: 'yellow' };
}

export function isSafeProofHref(url: string | null): url is string {
  if (!url) return false;
  return url.startsWith('/api/media/') || url.startsWith('https://');
}

export function resolveInitialCajaRoute(param: string | null): {
  tab: CajaTab;
  highlightUncollected: boolean;
  promosView: PromosSubTab;
} {
  if (param === 'comisiones' || param === 'commissions') {
    return { tab: 'commissions', highlightUncollected: false, promosView: 'coupons' };
  }
  if (param === 'cupones' || param === 'coupons') {
    return { tab: 'promos', highlightUncollected: false, promosView: 'coupons' };
  }
  if (param === 'paquetes' || param === 'packages') {
    return { tab: 'promos', highlightUncollected: false, promosView: 'packages' };
  }
  if (param === 'anticipos' || param === 'receivable') {
    return { tab: 'deposits', highlightUncollected: false, promosView: 'coupons' };
  }
  if (param === 'sin-cobrar' || param === 'uncollected') {
    return { tab: 'summary', highlightUncollected: true, promosView: 'coupons' };
  }
  return { tab: 'summary', highlightUncollected: false, promosView: 'coupons' };
}
