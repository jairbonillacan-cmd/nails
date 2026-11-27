'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  agendaHref,
  parseAgendaParams,
  type AgendaLinkParams,
  type AgendaStatusParam,
  type AgendaViewParam,
} from '@/lib/admin-links';
import { isMetricDateKey } from '@/lib/metrics';
import {
  ADMIN_MOBILE_MEDIA_QUERY,
  useMediaQueryHydrated,
} from './useIsNarrowScreen';

interface AgendaOneShotParams {
  isNew: boolean;
  collectId: string | null;
  clientName: string;
  clientPhone: string;
  clientInstagram: string;
  staffId: string;
  serviceId: string;
}

export interface NormalizedAgendaUrlState {
  explicitView: AgendaViewParam | null;
  dateKey: string;
  staffFilter: string;
  status: AgendaStatusParam;
  q: string;
  waitlistOpen: boolean;
  hasOneShotParams: boolean;
  oneShot: AgendaOneShotParams;
}

export interface AgendaUrlPatch {
  view?: AgendaViewParam | null;
  dateKey?: string;
  staffFilter?: string;
  status?: AgendaStatusParam;
  q?: string;
  waitlistOpen?: boolean;
}

interface NormalizeAgendaUrlOptions {
  todayKey: string;
  lockedStaffId: string | null;
  validStaffIds?: ReadonlySet<string>;
}

interface BuildAgendaHrefOptions {
  todayKey: string;
  lockedStaffId: string | null;
}

export function normalizeAgendaUrlState(
  params: AgendaLinkParams,
  opts: NormalizeAgendaUrlOptions,
): NormalizedAgendaUrlState {
  const explicitView: AgendaViewParam | null = params.view ?? null;
  const dateKey =
    params.date && isMetricDateKey(params.date) ? params.date : opts.todayKey;

  let staffFilter = 'all';
  if (opts.lockedStaffId) {
    staffFilter = opts.lockedStaffId;
  } else if (params.staff && params.staff !== 'all') {
    if (!opts.validStaffIds || opts.validStaffIds.size === 0) {
      staffFilter = params.staff;
    } else if (opts.validStaffIds.has(params.staff)) {
      staffFilter = params.staff;
    }
  }

  let status: AgendaStatusParam = 'upcoming';
  if (params.status) {
    status = params.status;
  } else if (
    params.tab === 'pending' ||
    params.tab === 'past' ||
    params.tab === 'canceled' ||
    params.tab === 'upcoming'
  ) {
    status = params.tab;
  }

  const q = params.q ?? '';
  const waitlistOpen =
    params.panel === 'waitlist' || params.tab === 'waitlist';

  const oneShot: AgendaOneShotParams = {
    isNew: Boolean(params.new),
    collectId: params.collect ?? null,
    clientName: params.clientName ?? '',
    clientPhone: params.clientPhone ?? '',
    clientInstagram: params.clientInstagram ?? '',
    staffId: params.staffId ?? '',
    serviceId: params.serviceId ?? '',
  };

  const hasOneShotParams = Boolean(
    oneShot.isNew ||
      oneShot.collectId ||
      oneShot.clientName ||
      oneShot.clientPhone ||
      oneShot.clientInstagram ||
      oneShot.staffId ||
      oneShot.serviceId,
  );

  return {
    explicitView,
    dateKey,
    staffFilter,
    status,
    q,
    waitlistOpen,
    hasOneShotParams,
    oneShot,
  };
}

export function buildAgendaNextHref(
  current: NormalizedAgendaUrlState,
  patch: AgendaUrlPatch,
  opts: BuildAgendaHrefOptions,
): string {
  const nextView =
    patch.view !== undefined ? patch.view : current.explicitView;
  const nextDate =
    patch.dateKey !== undefined ? patch.dateKey : current.dateKey;
  const nextStaff = opts.lockedStaffId
    ? 'all'
    : patch.staffFilter !== undefined
      ? patch.staffFilter
      : current.staffFilter;
  const nextStatus =
    patch.status !== undefined ? patch.status : current.status;
  const nextQ =
    patch.q !== undefined ? patch.q.trim() : current.q.trim();
  const nextWaitlist =
    patch.waitlistOpen !== undefined
      ? patch.waitlistOpen
      : current.waitlistOpen;

  const linkParams: AgendaLinkParams = {};
  if (nextView) {
    linkParams.view = nextView;
  }
  if (nextDate && isMetricDateKey(nextDate) && nextDate !== opts.todayKey) {
    linkParams.date = nextDate;
  }
  if (!opts.lockedStaffId && nextStaff && nextStaff !== 'all') {
    linkParams.staff = nextStaff;
  }
  if (nextStatus && nextStatus !== 'upcoming') {
    linkParams.status = nextStatus;
  }
  if (nextQ) {
    linkParams.q = nextQ;
  }
  if (nextWaitlist) {
    linkParams.panel = 'waitlist';
  }

  return agendaHref(linkParams);
}

export function useAgendaUrlState(params: {
  todayKey: string;
  lockedStaffId: string | null;
  validStaffIds?: ReadonlySet<string>;
  mobileQuery?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNarrow = useMediaQueryHydrated(
    params.mobileQuery ?? ADMIN_MOBILE_MEDIA_QUERY,
  );

  const parsedParams = useMemo(
    () => parseAgendaParams(searchParams),
    [searchParams],
  );

  const state = useMemo(
    () =>
      normalizeAgendaUrlState(parsedParams, {
        todayKey: params.todayKey,
        lockedStaffId: params.lockedStaffId,
        validStaffIds: params.validStaffIds,
      }),
    [parsedParams, params.todayKey, params.lockedStaffId, params.validStaffIds],
  );

  const resolvedView: AgendaViewParam | null =
    state.explicitView ??
    (isNarrow === null ? null : isNarrow ? 'list' : 'day');

  const navigate = useCallback(
    (
      patch: AgendaUrlPatch,
      options?: { history?: 'push' | 'replace' },
    ) => {
      const currentHref = buildAgendaNextHref(state, {}, {
        todayKey: params.todayKey,
        lockedStaffId: params.lockedStaffId,
      });
      const nextHref = buildAgendaNextHref(state, patch, {
        todayKey: params.todayKey,
        lockedStaffId: params.lockedStaffId,
      });
      if (!state.hasOneShotParams && nextHref === currentHref) {
        return;
      }
      const mode = options?.history ?? 'push';
      if (mode === 'replace') {
        router.replace(nextHref, { scroll: false });
      } else {
        router.push(nextHref, { scroll: false });
      }
    },
    [params.lockedStaffId, params.todayKey, router, state],
  );

  const setView = useCallback(
    (nextView: AgendaViewParam) => {
      navigate({ view: nextView }, { history: 'push' });
    },
    [navigate],
  );

  const setDate = useCallback(
    (nextDateKey: string) => {
      navigate({ dateKey: nextDateKey }, { history: 'push' });
    },
    [navigate],
  );

  const setStaff = useCallback(
    (nextStaffFilter: string) => {
      if (params.lockedStaffId) return;
      navigate({ staffFilter: nextStaffFilter }, { history: 'push' });
    },
    [navigate, params.lockedStaffId],
  );

  const setStatus = useCallback(
    (nextStatus: AgendaStatusParam) => {
      navigate({ status: nextStatus }, { history: 'push' });
    },
    [navigate],
  );

  const setWaitlistOpen = useCallback(
    (open: boolean) => {
      navigate({ waitlistOpen: open }, { history: 'push' });
    },
    [navigate],
  );

  const setSearch = useCallback(
    (nextQ: string) => {
      navigate({ q: nextQ }, { history: 'replace' });
    },
    [navigate],
  );

  const clearOneShotParams = useCallback(() => {
    const cleanHref = buildAgendaNextHref(state, {}, {
      todayKey: params.todayKey,
      lockedStaffId: params.lockedStaffId,
    });
    router.replace(cleanHref, { scroll: false });
  }, [params.lockedStaffId, params.todayKey, router, state]);

  return {
    ...state,
    isNarrow,
    isHydrated: isNarrow !== null,
    resolvedView,
    setView,
    setDate,
    setStaff,
    setStatus,
    setWaitlistOpen,
    setSearch,
    updateFilters: navigate,
    clearOneShotParams,
  };
}
