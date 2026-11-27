import type { AdminRole } from './types';

export type AdminSection =
  | 'overview'
  | 'bookings'
  | 'whatsapp'
  | 'services'
  | 'availability'
  | 'team'
  | 'clients'
  | 'cash'
  | 'reports'
  | 'inventory'
  | 'coupons'
  | 'brand'
  | 'integrations';

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<string>> = {
  owner: new Set([
    'overview',
    'bookings',
    'whatsapp',
    'services',
    'availability',
    'team',
    'clients',
    'cash',
    'reports',
    'inventory',
    'coupons',
    'brand',
    'integrations',
  ]),
  admin: new Set([
    'overview',
    'bookings',
    'whatsapp',
    'services',
    'availability',
    'team',
    'clients',
    'cash',
    'reports',
    'inventory',
    'coupons',
  ]),
  specialist: new Set(['overview', 'bookings', 'availability', 'cash', 'reports']),
};

export function roleCanAccess(role: AdminRole, section: string): boolean {
  return ROLE_PERMISSIONS[role].has(section);
}
