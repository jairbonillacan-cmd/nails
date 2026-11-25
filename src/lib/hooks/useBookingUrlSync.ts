'use client';

import { useEffect } from 'react';
import type { BookingLayoutView } from '../types';

export interface BookingUrlParams {
  servicio?: string;
  extras?: string[];
  addons?: string[];
  staff?: string;
  date?: string;
  layout?: BookingLayoutView;
  defaultLayout?: BookingLayoutView;
  slot?: string;
}

function normalizeCsvList(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) return '';
  const unique = Array.from(
    new Set(values.map((v) => v.trim()).filter((v) => v.length > 0)),
  );
  return unique.join(',');
}

function syncSearchParam(
  params: URLSearchParams,
  key: string,
  value: string,
): void {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

export function useBookingUrlSync(params: BookingUrlParams): void {
  const servicio = params.servicio?.trim() ?? '';
  const extrasCsv = normalizeCsvList(params.extras);
  const addonsCsv = normalizeCsvList(params.addons);
  const staff = params.staff?.trim() ?? '';
  const date = params.date?.trim() ?? '';
  const defaultLayout = params.defaultLayout ?? 'month';
  const layout =
    params.layout && params.layout !== defaultLayout ? params.layout : '';
  const slot = params.slot?.trim() ?? '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentSearch = new URLSearchParams(window.location.search);
    const nextSearch = new URLSearchParams(window.location.search);

    syncSearchParam(nextSearch, 'servicio', servicio);
    syncSearchParam(nextSearch, 'extras', extrasCsv);
    syncSearchParam(nextSearch, 'addons', addonsCsv);
    syncSearchParam(nextSearch, 'staff', staff);
    syncSearchParam(nextSearch, 'date', date);
    syncSearchParam(nextSearch, 'layout', layout);
    syncSearchParam(nextSearch, 'slot', slot);

    const currentQuery = currentSearch.toString();
    const nextQuery = nextSearch.toString();
    if (currentQuery === nextQuery) return;

    const hash = window.location.hash || '';
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [servicio, extrasCsv, addonsCsv, staff, date, layout, slot]);
}
