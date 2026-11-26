import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildServiceComboOptions,
  filterRedundantAddons,
  resolveServiceZone,
  toggleExtraServiceInZone,
} from './serviceCombos';

const CATEGORIES = [
  { id: 'cat-esculturales', name: 'Uñas & Esculturales' },
  { id: 'cat-gel-retiro', name: 'Gel & Retiro' },
  { id: 'cat-pies', name: 'Pies & PediSpa' },
];

const SERVICES = [
  { id: 'srv-rubber', name: 'Rubber', categoryId: 'cat-esculturales' },
  { id: 'srv-acrilicas', name: 'Uñas acrílicas', categoryId: 'cat-esculturales' },
  { id: 'srv-gel-manos', name: 'Gel Semipermanente manos', categoryId: 'cat-gel-retiro' },
  { id: 'srv-retiro', name: 'Retiro', categoryId: 'cat-gel-retiro' },
  { id: 'srv-pedispa-gel', name: 'PediSpa + Gel', categoryId: 'cat-pies' },
  { id: 'srv-pedispa-acripie', name: 'PediSpa + Acripie', categoryId: 'cat-pies' },
  { id: 'srv-gel-pies', name: 'Gel Pies en seco', categoryId: 'cat-pies' },
];

const ADDONS = [
  { id: 'addon-retiro', name: 'Retiro de gel o acrílico previo' },
  { id: 'addon-nail-art-1', name: 'Nail Art Nivel 1 (French / Minimal)' },
  { id: 'addon-chrome', name: 'Efecto Glazed / Chrome / Cat Eye' },
];

function combosFor(primaryId: string, selectedExtraIds: string[] = []) {
  return buildServiceComboOptions({
    primary: SERVICES.find((service) => service.id === primaryId),
    services: SERVICES,
    categories: CATEGORIES,
    allAddons: ADDONS,
    selectedExtraIds,
  });
}

describe('booking extras never repeat or contradict the main service', () => {
  it('classifies hands and feet services from their names and categories', () => {
    expect(resolveServiceZone(SERVICES[0]!, CATEGORIES)).toBe('hands');
    expect(resolveServiceZone(SERVICES[4]!, CATEGORIES)).toBe('feet');
    expect(resolveServiceZone(SERVICES[6]!, CATEGORIES)).toBe('feet');
  });

  it('offers only the other zone and hides services already sold as an add-on', () => {
    const forRubber = combosFor('srv-rubber').extraServices.map((service) => service.id);
    expect(forRubber).toEqual(['srv-pedispa-gel', 'srv-pedispa-acripie', 'srv-gel-pies']);
    const forPedi = combosFor('srv-pedispa-gel').extraServices.map((service) => service.id);
    expect(forPedi).toEqual(['srv-rubber', 'srv-acrilicas', 'srv-gel-manos']);
    expect(forPedi).not.toContain('srv-retiro');
  });

  it('drops the add-on that duplicates the main service', () => {
    const retiro = SERVICES.find((service) => service.id === 'srv-retiro')!;
    expect(filterRedundantAddons(ADDONS, [retiro]).map((addon) => addon.id)).toEqual([
      'addon-nail-art-1',
      'addon-chrome',
    ]);
  });

  it('keeps one extra per zone, whatever ids arrive from the URL or a draft', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SERVICES.map((service) => service.id)),
        fc.array(fc.constantFrom(...SERVICES.map((service) => service.id), 'srv-unknown'), { maxLength: 8 }),
        (primaryId, requested) => {
          const combos = combosFor(primaryId, requested);
          const primaryZone = combos.zoneById.get(primaryId);
          const zones = combos.selectedExtraServices.map((service) => combos.zoneById.get(service.id));
          expect(new Set(zones).size).toBe(zones.length);
          expect(zones).not.toContain(primaryZone);
          for (const service of combos.extraServices) {
            expect(service.id).not.toBe(primaryId);
            expect(service.id).not.toBe('srv-retiro');
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('replaces the extra of the same zone instead of stacking two pedicures', () => {
    const { zoneById } = combosFor('srv-rubber');
    const first = toggleExtraServiceInZone({ selectedIds: [], serviceId: 'srv-pedispa-gel', checked: true, zoneById });
    const second = toggleExtraServiceInZone({ selectedIds: first, serviceId: 'srv-gel-pies', checked: true, zoneById });
    expect(second).toEqual(['srv-gel-pies']);
    expect(toggleExtraServiceInZone({ selectedIds: second, serviceId: 'srv-gel-pies', checked: false, zoneById })).toEqual([]);
  });
});
