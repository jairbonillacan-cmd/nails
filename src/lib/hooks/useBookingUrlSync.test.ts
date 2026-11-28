import { describe, expect, it } from 'vitest';
import {
  buildBookingSearchParams,
  parseStepFromSearch,
  resolveHistoryNavigationMode,
  resolvePopStateStep,
} from './useBookingUrlSync';

describe('useBookingUrlSync helpers', () => {
  it('writes Spanish ?paso= slugs for non-service steps, omits it on service, and preserves unrelated query params', () => {
    const initial = new URLSearchParams('offer=wl-offer-1&embed=1&utm_source=ig');

    const onService = buildBookingSearchParams(initial, {
      servicio: 'rubber',
      extrasCsv: '',
      addonsCsv: '',
      staff: '',
      date: '2026-12-14',
      layout: '',
      slot: '',
      step: 'service',
    });
    expect(onService.get('paso')).toBeNull();
    expect(onService.get('offer')).toBe('wl-offer-1');
    expect(onService.get('embed')).toBe('1');
    expect(onService.get('utm_source')).toBe('ig');
    expect(onService.get('servicio')).toBe('rubber');

    const onSchedule = buildBookingSearchParams(onService, {
      servicio: 'rubber',
      extrasCsv: 'retiro',
      addonsCsv: 'addon-1',
      staff: 'karla',
      date: '2026-12-14',
      layout: '',
      slot: '',
      step: 'schedule',
    });
    expect(onSchedule.get('paso')).toBe('horario');

    const onStaff = buildBookingSearchParams(onSchedule, {
      servicio: 'rubber',
      extrasCsv: 'retiro',
      addonsCsv: 'addon-1',
      staff: '',
      date: '2026-12-14',
      layout: '',
      slot: '2026-12-14T16:00:00.000Z',
      step: 'staff',
    });
    expect(onStaff.get('paso')).toBe('profesional');
    expect(onStaff.get('slot')).toBe('2026-12-14T16:00:00.000Z');

    const onDetails = buildBookingSearchParams(onStaff, {
      servicio: 'rubber',
      extrasCsv: '',
      addonsCsv: '',
      staff: '',
      date: '2026-12-14',
      layout: '',
      slot: '2026-12-14T16:00:00.000Z',
      step: 'details',
    });
    expect(onDetails.get('paso')).toBe('datos');

    const onPayment = buildBookingSearchParams(onDetails, {
      servicio: 'rubber',
      extrasCsv: '',
      addonsCsv: '',
      staff: '',
      date: '2026-12-14',
      layout: '',
      slot: '2026-12-14T16:00:00.000Z',
      step: 'payment',
    });
    expect(onPayment.get('paso')).toBe('anticipo');
  });

  it('uses pushState only on forward step transitions and replaceState on backward, same-step, or popstate updates', () => {
    expect(
      resolveHistoryNavigationMode({ prevStep: 'service', nextStep: 'schedule', fromPopState: false }),
    ).toBe('push');
    expect(
      resolveHistoryNavigationMode({ prevStep: 'schedule', nextStep: 'details', fromPopState: false }),
    ).toBe('push');
    expect(
      resolveHistoryNavigationMode({ prevStep: 'details', nextStep: 'payment', fromPopState: false }),
    ).toBe('push');
    expect(
      resolveHistoryNavigationMode({ prevStep: 'details', nextStep: 'schedule', fromPopState: false }),
    ).toBe('replace');
    expect(
      resolveHistoryNavigationMode({ prevStep: 'schedule', nextStep: 'schedule', fromPopState: false }),
    ).toBe('replace');
    expect(
      resolveHistoryNavigationMode({ prevStep: 'schedule', nextStep: 'details', fromPopState: true }),
    ).toBe('replace');
  });

  it('parses ?paso= from search strings and clamps slot-required steps safely on popstate without a slot', () => {
    expect(parseStepFromSearch('')).toBe('service');
    expect(parseStepFromSearch('?paso=servicio')).toBe('service');
    expect(parseStepFromSearch('?paso=horario')).toBe('schedule');
    expect(parseStepFromSearch('?paso=profesional')).toBe('staff');
    expect(parseStepFromSearch('?paso=datos')).toBe('details');
    expect(parseStepFromSearch('?paso=anticipo')).toBe('payment');
    expect(parseStepFromSearch('?paso=desconocido')).toBe('service');

    expect(resolvePopStateStep('?paso=datos', false)).toEqual({
      targetStep: 'details',
      clampedStep: 'schedule',
    });
    expect(resolvePopStateStep('?paso=profesional', false)).toEqual({
      targetStep: 'staff',
      clampedStep: 'schedule',
    });
    expect(resolvePopStateStep('?paso=anticipo', false)).toEqual({
      targetStep: 'payment',
      clampedStep: 'schedule',
    });
    expect(resolvePopStateStep('?paso=datos', true)).toEqual({
      targetStep: 'details',
      clampedStep: 'details',
    });
    expect(resolvePopStateStep('?servicio=rubber', false)).toEqual({
      targetStep: 'service',
      clampedStep: 'service',
    });
  });
});
