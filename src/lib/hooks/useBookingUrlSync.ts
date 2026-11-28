'use client';

import { useEffect, useRef } from 'react';
import {
  BOOKING_STEPS,
  BOOKING_STEP_URL_SLUGS,
  isSlotRequiredStep,
  parseBookingStepParam,
  type BookingStep,
} from '@/components/booking/bookingMachine';
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
  step: BookingStep;
  hasSelectedSlot: boolean;
  onPopStateStep: (step: BookingStep) => void;
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

export function buildBookingSearchParams(
  currentSearch: URLSearchParams,
  input: {
    servicio: string;
    extrasCsv: string;
    addonsCsv: string;
    staff: string;
    date: string;
    layout: string;
    slot: string;
    step: BookingStep;
  },
): URLSearchParams {
  const nextSearch = new URLSearchParams(currentSearch.toString());
  syncSearchParam(nextSearch, 'servicio', input.servicio);
  syncSearchParam(nextSearch, 'extras', input.extrasCsv);
  syncSearchParam(nextSearch, 'addons', input.addonsCsv);
  syncSearchParam(nextSearch, 'staff', input.staff);
  syncSearchParam(nextSearch, 'date', input.date);
  syncSearchParam(nextSearch, 'layout', input.layout);
  syncSearchParam(nextSearch, 'slot', input.slot);
  syncSearchParam(
    nextSearch,
    'paso',
    input.step === 'service' ? '' : BOOKING_STEP_URL_SLUGS[input.step],
  );
  return nextSearch;
}

export function parseStepFromSearch(search: string): BookingStep {
  const params = new URLSearchParams(search);
  return parseBookingStepParam(params.get('paso')) ?? 'service';
}

export function resolveHistoryNavigationMode(input: {
  prevStep: BookingStep;
  nextStep: BookingStep;
  fromPopState: boolean;
}): 'push' | 'replace' {
  if (input.fromPopState) return 'replace';
  return BOOKING_STEPS.indexOf(input.nextStep) > BOOKING_STEPS.indexOf(input.prevStep)
    ? 'push'
    : 'replace';
}

export function resolvePopStateStep(
  search: string,
  hasSelectedSlot: boolean,
): { targetStep: BookingStep; clampedStep: BookingStep } {
  const targetStep = parseStepFromSearch(search);
  const clampedStep =
    !hasSelectedSlot && isSlotRequiredStep(targetStep) ? 'schedule' : targetStep;
  return { targetStep, clampedStep };
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
  const { step, hasSelectedSlot, onPopStateStep } = params;

  const prevStepRef = useRef<BookingStep>(step);
  const popStateStepRef = useRef<BookingStep | null>(null);
  const latestPopContextRef = useRef({ hasSelectedSlot, onPopStateStep });

  useEffect(() => {
    latestPopContextRef.current = { hasSelectedSlot, onPopStateStep };
  }, [hasSelectedSlot, onPopStateStep]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      const ctx = latestPopContextRef.current;
      const { targetStep, clampedStep } = resolvePopStateStep(
        window.location.search,
        ctx.hasSelectedSlot,
      );
      popStateStepRef.current = clampedStep;
      if (clampedStep !== targetStep) {
        const repairedSearch = new URLSearchParams(window.location.search);
        syncSearchParam(
          repairedSearch,
          'paso',
          clampedStep === 'service' ? '' : BOOKING_STEP_URL_SLUGS[clampedStep],
        );
        const query = repairedSearch.toString();
        const hash = window.location.hash || '';
        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${hash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
      }
      ctx.onPopStateStep(clampedStep);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromPopState = popStateStepRef.current !== null;
    const mode = resolveHistoryNavigationMode({
      prevStep: prevStepRef.current,
      nextStep: step,
      fromPopState,
    });
    prevStepRef.current = step;
    popStateStepRef.current = null;

    const currentSearch = new URLSearchParams(window.location.search);
    const nextSearch = buildBookingSearchParams(currentSearch, {
      servicio,
      extrasCsv,
      addonsCsv,
      staff,
      date,
      layout,
      slot,
      step,
    });

    const currentQuery = currentSearch.toString();
    const nextQuery = nextSearch.toString();
    if (currentQuery === nextQuery) return;

    const hash = window.location.hash || '';
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
    if (mode === 'push') {
      window.history.pushState(window.history.state, '', nextUrl);
    } else {
      window.history.replaceState(window.history.state, '', nextUrl);
    }
  }, [servicio, extrasCsv, addonsCsv, staff, date, layout, slot, step]);
}
