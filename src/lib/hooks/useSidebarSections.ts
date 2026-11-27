'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

const SIDEBAR_SECTION_IDS = [
  'operacion',
  'salon',
  'profesionales',
  'mas',
] as const;

export type SidebarSectionId = (typeof SIDEBAR_SECTION_IDS)[number];

const SIDEBAR_SECTION_SET: ReadonlySet<string> = new Set(SIDEBAR_SECTION_IDS);
const STORAGE_KEY = 'laikona.admin.sidebarCollapsedSections';
const EMPTY_SERIALIZED = '[]';

const listeners = new Set<() => void>();
let memoryFallback = EMPTY_SERIALIZED;

function normalizeCollapsedSections(ids: readonly string[]): SidebarSectionId[] {
  const unique = new Set<SidebarSectionId>();
  for (const id of ids) {
    if (SIDEBAR_SECTION_SET.has(id)) {
      unique.add(id as SidebarSectionId);
    }
  }
  return SIDEBAR_SECTION_IDS.filter((id) => unique.has(id));
}

export function parseCollapsedSections(raw: string | null | undefined): SidebarSectionId[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const strings = parsed.filter((item): item is string => typeof item === 'string');
    return normalizeCollapsedSections(strings);
  } catch {
    return [];
  }
}

export function serializeCollapsedSections(ids: readonly SidebarSectionId[]): string {
  return JSON.stringify(normalizeCollapsedSections(ids));
}

export function toggleCollapsedSectionList(
  current: readonly SidebarSectionId[],
  sectionId: SidebarSectionId,
): SidebarSectionId[] {
  const exists = current.includes(sectionId);
  const next = exists
    ? current.filter((id) => id !== sectionId)
    : [...current, sectionId];
  return normalizeCollapsedSections(next);
}

export function expandSectionIfCollapsed(
  current: readonly SidebarSectionId[],
  sectionId: SidebarSectionId | null,
): SidebarSectionId[] | null {
  if (!sectionId || !current.includes(sectionId)) return null;
  return normalizeCollapsedSections(current.filter((id) => id !== sectionId));
}

export function readStoredCollapsedSections(): SidebarSectionId[] {
  if (typeof window === 'undefined') {
    return parseCollapsedSections(memoryFallback);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return parseCollapsedSections(memoryFallback);
    return parseCollapsedSections(raw);
  } catch {
    return parseCollapsedSections(memoryFallback);
  }
}

export function writeStoredCollapsedSections(
  ids: readonly SidebarSectionId[],
): SidebarSectionId[] {
  const normalized = normalizeCollapsedSections(ids);
  const serialized = JSON.stringify(normalized);
  memoryFallback = serialized;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      memoryFallback = serialized;
    }
  }
  for (const listener of listeners) {
    listener();
  }
  return normalized;
}

export function resetSidebarSectionsMemoryForTest(): void {
  memoryFallback = EMPTY_SERIALIZED;
}

function getSerializedSnapshot(): string {
  if (typeof window === 'undefined') {
    return memoryFallback;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return memoryFallback;
    return serializeCollapsedSections(parseCollapsedSections(raw));
  } catch {
    return memoryFallback;
  }
}

function getServerSnapshot(): string {
  return EMPTY_SERIALIZED;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (typeof window === 'undefined') {
    return () => {
      listeners.delete(callback);
    };
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function matchesNavPath(pathname: string, matchPath: string): boolean {
  if (pathname === matchPath) return true;
  if (matchPath === '/admin') return false;
  return pathname.startsWith(`${matchPath}/`);
}

export function resolveActiveSidebarSection(
  pathname: string,
  primaryGroups: ReadonlyArray<{
    id: SidebarSectionId;
    items: ReadonlyArray<{ matchPath: string }>;
  }>,
  footerItems: ReadonlyArray<{ matchPath: string }>,
): SidebarSectionId | null {
  for (const group of primaryGroups) {
    if (group.items.some((item) => matchesNavPath(pathname, item.matchPath))) {
      return group.id;
    }
  }
  if (footerItems.some((item) => matchesNavPath(pathname, item.matchPath))) {
    return 'mas';
  }
  return null;
}

export function computeCollapsedSectionBadge(
  items: ReadonlyArray<{ badge?: string | null }>,
): string | null {
  let numericTotal = 0;
  let hasNumeric = false;
  let fallbackBadge: string | null = null;

  for (const item of items) {
    const raw = item.badge?.trim();
    if (!raw) continue;
    if (/^\d+$/.test(raw)) {
      const value = Number(raw);
      if (value > 0) {
        numericTotal += value;
        hasNumeric = true;
      }
    } else if (!fallbackBadge) {
      fallbackBadge = raw;
    }
  }

  if (hasNumeric && numericTotal > 0) {
    return String(numericTotal);
  }
  return fallbackBadge;
}

export function computeCollapsedStaffBadge(
  staffRows: ReadonlyArray<{ todayCount: number }>,
): string | null {
  const totalToday = staffRows.reduce(
    (sum, row) => sum + (row.todayCount > 0 ? row.todayCount : 0),
    0,
  );
  return totalToday > 0 ? `${totalToday} hoy` : null;
}

export function useSidebarSections(params: {
  pathname: string;
  primaryNavGroups: ReadonlyArray<{
    id: SidebarSectionId;
    items: ReadonlyArray<{ matchPath: string }>;
  }>;
  footerNavItems: ReadonlyArray<{ matchPath: string }>;
}) {
  const { pathname, primaryNavGroups, footerNavItems } = params;
  const serialized = useSyncExternalStore(subscribe, getSerializedSnapshot, getServerSnapshot);
  const collapsedList = useMemo(() => parseCollapsedSections(serialized), [serialized]);
  const collapsedSet = useMemo(() => new Set<SidebarSectionId>(collapsedList), [collapsedList]);
  const activeSection = useMemo(
    () => resolveActiveSidebarSection(pathname, primaryNavGroups, footerNavItems),
    [pathname, primaryNavGroups, footerNavItems],
  );
  const lastPathnameRef = useRef(pathname);

  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    const next = expandSectionIfCollapsed(readStoredCollapsedSections(), activeSection);
    if (next !== null) {
      writeStoredCollapsedSections(next);
    }
  }, [pathname, activeSection]);

  const toggleSection = useCallback((sectionId: SidebarSectionId) => {
    const current = readStoredCollapsedSections();
    writeStoredCollapsedSections(toggleCollapsedSectionList(current, sectionId));
  }, []);

  const isSectionCollapsed = useCallback(
    (sectionId: SidebarSectionId) => collapsedSet.has(sectionId),
    [collapsedSet],
  );

  return {
    collapsedSections: collapsedList,
    activeSection,
    isSectionCollapsed,
    toggleSection,
  };
}
