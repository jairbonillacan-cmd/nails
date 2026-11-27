import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeCollapsedSectionBadge,
  computeCollapsedStaffBadge,
  expandSectionIfCollapsed,
  parseCollapsedSections,
  readStoredCollapsedSections,
  resetSidebarSectionsMemoryForTest,
  resolveActiveSidebarSection,
  serializeCollapsedSections,
  toggleCollapsedSectionList,
  writeStoredCollapsedSections,
} from './useSidebarSections';

describe('useSidebarSections helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSidebarSectionsMemoryForTest();
  });

  it('parses valid section arrays, deduplicates, ignores unknown keys, and handles corrupted input', () => {
    expect(parseCollapsedSections(null)).toEqual([]);
    expect(parseCollapsedSections('')).toEqual([]);
    expect(parseCollapsedSections('{not-json')).toEqual([]);
    expect(parseCollapsedSections('"operacion"')).toEqual([]);
    expect(parseCollapsedSections('["mas","unknown",123,"operacion","mas"]')).toEqual([
      'operacion',
      'mas',
    ]);
    expect(serializeCollapsedSections(['mas', 'operacion', 'mas'])).toBe(
      '["operacion","mas"]',
    );
  });

  it('toggles sections cleanly while preserving canonical order', () => {
    const afterFirst = toggleCollapsedSectionList([], 'salon');
    expect(afterFirst).toEqual(['salon']);

    const afterSecond = toggleCollapsedSectionList(afterFirst, 'operacion');
    expect(afterSecond).toEqual(['operacion', 'salon']);

    const afterThird = toggleCollapsedSectionList(afterSecond, 'salon');
    expect(afterThird).toEqual(['operacion']);
  });

  it('persists collapsed sections in memory fallback when window is unavailable', () => {
    expect(readStoredCollapsedSections()).toEqual([]);
    writeStoredCollapsedSections(['profesionales', 'mas']);
    expect(readStoredCollapsedSections()).toEqual(['profesionales', 'mas']);
    writeStoredCollapsedSections([]);
    expect(readStoredCollapsedSections()).toEqual([]);
  });

  it('persists to window.localStorage and safely recovers from corrupted or throwing storage', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    });

    writeStoredCollapsedSections(['mas', 'operacion']);
    expect(store.get('laikona.admin.sidebarCollapsedSections')).toBe('["operacion","mas"]');
    expect(readStoredCollapsedSections()).toEqual(['operacion', 'mas']);

    store.set('laikona.admin.sidebarCollapsedSections', '{broken-json');
    expect(readStoredCollapsedSections()).toEqual([]);

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage blocked');
        },
        setItem: () => {
          throw new Error('storage blocked');
        },
      },
    });
    writeStoredCollapsedSections(['salon']);
    expect(readStoredCollapsedSections()).toEqual(['salon']);
  });

  it('resolves the active sidebar section from pathname and expands collapsed section on navigation', () => {
    const primaryGroups = [
      {
        id: 'operacion' as const,
        items: [{ matchPath: '/admin' }, { matchPath: '/admin/citas' }],
      },
      {
        id: 'salon' as const,
        items: [{ matchPath: '/admin/servicios' }, { matchPath: '/admin/inventario' }],
      },
    ];
    const footerItems = [{ matchPath: '/admin/marca' }, { matchPath: '/admin/integraciones' }];

    expect(resolveActiveSidebarSection('/admin', primaryGroups, footerItems)).toBe('operacion');
    expect(resolveActiveSidebarSection('/admin/citas', primaryGroups, footerItems)).toBe(
      'operacion',
    );
    expect(resolveActiveSidebarSection('/admin/servicios/nuevo', primaryGroups, footerItems)).toBe(
      'salon',
    );
    expect(resolveActiveSidebarSection('/admin/marca', primaryGroups, footerItems)).toBe('mas');
    expect(resolveActiveSidebarSection('/admin/desconocido', primaryGroups, footerItems)).toBeNull();

    expect(expandSectionIfCollapsed(['salon', 'mas'], 'salon')).toEqual(['mas']);
    expect(expandSectionIfCollapsed(['mas'], 'salon')).toBeNull();
    expect(expandSectionIfCollapsed(['mas'], null)).toBeNull();
  });

  it('aggregates collapsed section badges for numeric counts, progress badges, and staff rows', () => {
    expect(computeCollapsedSectionBadge([{ badge: null }, { badge: undefined }])).toBeNull();
    expect(computeCollapsedSectionBadge([{ badge: '0' }])).toBeNull();
    expect(
      computeCollapsedSectionBadge([{ badge: '3' }, { badge: null }, { badge: '4' }]),
    ).toBe('7');
    expect(computeCollapsedSectionBadge([{ badge: '3/5' }])).toBe('3/5');
    expect(
      computeCollapsedSectionBadge([{ badge: '3/5' }, { badge: '2' }]),
    ).toBe('2');

    expect(computeCollapsedStaffBadge([{ todayCount: 0 }, { todayCount: 0 }])).toBeNull();
    expect(computeCollapsedStaffBadge([{ todayCount: 2 }, { todayCount: 3 }])).toBe('5 hoy');
  });
});
