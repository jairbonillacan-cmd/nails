import type { AdminRole } from './types';

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<string>> = {
  owner: new Set([
    'overview',
    'bookings',
    'services',
    'availability',
    'team',
    'clients',
    'cash',
    'inventory',
    'coupons',
    'brand',
    'integrations',
  ]),
  admin: new Set([
    'overview',
    'bookings',
    'services',
    'availability',
    'team',
    'clients',
    'cash',
    'inventory',
    'coupons',
  ]),
  specialist: new Set(['overview', 'bookings', 'availability', 'cash']),
};

export function roleCanAccess(role: AdminRole, section: string): boolean {
  return ROLE_PERMISSIONS[role].has(section);
}
