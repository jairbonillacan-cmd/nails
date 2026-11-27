import { describe, expect, it } from 'vitest';
import { roleCanAccess } from './rbac';

describe('roleCanAccess (RBAC section permissions)', () => {
  it('enforces ADR-0008 permissions for loyalty (owner/admin) and settings (owner only)', () => {
    expect(roleCanAccess('owner', 'loyalty')).toBe(true);
    expect(roleCanAccess('admin', 'loyalty')).toBe(true);
    expect(roleCanAccess('specialist', 'loyalty')).toBe(false);

    expect(roleCanAccess('owner', 'settings')).toBe(true);
    expect(roleCanAccess('admin', 'settings')).toBe(false);
    expect(roleCanAccess('specialist', 'settings')).toBe(false);

    expect(roleCanAccess('owner', 'brand')).toBe(true);
    expect(roleCanAccess('admin', 'brand')).toBe(false);
    expect(roleCanAccess('specialist', 'brand')).toBe(false);
  });
});
