import type { AdminRole } from './types';

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
    'loyalty',
    'settings',
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
    'loyalty',
  ]),
  specialist: new Set(['overview', 'bookings', 'availability', 'cash', 'reports']),
};

export function roleCanAccess(role: AdminRole, section: string): boolean {
  return ROLE_PERMISSIONS[role].has(section);
}
