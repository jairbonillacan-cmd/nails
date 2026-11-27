import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  formatNailTechBadges,
  NAIL_ALERTS,
  NAIL_BASES,
  NAIL_LENGTHS,
  NAIL_SHAPES,
  parseNailTechNotes,
  serializeNailTechNotes,
  type NailTechProfile,
} from './nailTechProfile';

describe('nailTechProfile', () => {
  it('preserves legacy plain-text notes untouched', () => {
    const legacy = 'Prefiere tonos milky nude y gel frío.\nLlega 5 minutos antes.';
    const parsed = parseNailTechNotes(legacy);
    expect(parsed.profile).toEqual({
      shape: null,
      length: null,
      base: null,
      alerts: [],
    });
    expect(parsed.freeNotes).toBe(legacy);
    expect(serializeNailTechNotes(parsed.profile, parsed.freeNotes)).toBe(legacy);
  });

  it('serializes and parses structured nail-tech chips alongside free notes', () => {
    const profile: NailTechProfile = {
      shape: 'Almendra',
      length: 'Corto',
      base: 'Rubber',
      alerts: ['Cutícula sensible', 'Uña delgada'],
    };
    const serialized = serializeNailTechNotes(profile, 'Le encanta el french clásico.');
    expect(serialized).toBe(
      '[Ficha técnica] Forma: Almendra · Largo: Corto · Base: Rubber · Alertas: Cutícula sensible, Uña delgada\n\nLe encanta el french clásico.',
    );
    const parsed = parseNailTechNotes(serialized);
    expect(parsed.profile).toEqual(profile);
    expect(parsed.freeNotes).toBe('Le encanta el french clásico.');
  });

  it('parses accent-insensitive and pipe-separated legacy headers cleanly', () => {
    const raw =
      '[Ficha tecnica] forma: coffin | largo: medio | base: acrilico | alertas: alergia a acetona, cuticula sensible\n\nNota extra';
    const parsed = parseNailTechNotes(raw);
    expect(parsed.profile).toEqual({
      shape: 'Coffin',
      length: 'Medio',
      base: 'Acrílico',
      alerts: ['Cutícula sensible', 'Alergia a acetona'],
    });
    expect(parsed.freeNotes).toBe('Nota extra');
  });

  it('emits neutral badges for preferences and warning badges for alerts', () => {
    const badges = formatNailTechBadges({
      shape: 'Stiletto',
      length: 'Largo',
      base: 'Gel',
      alerts: ['Alergia a acetona'],
    });
    expect(badges).toEqual([
      { label: 'Stiletto', tone: 'neutral' },
      { label: 'Largo', tone: 'neutral' },
      { label: 'Gel', tone: 'neutral' },
      { label: 'Alergia a acetona', tone: 'warning' },
    ]);
  });

  it('satisfies round-trip invariant for arbitrary profiles and free notes', () => {
    const profileArb: fc.Arbitrary<NailTechProfile> = fc.record({
      shape: fc.option(fc.constantFrom(...NAIL_SHAPES), { nil: null }),
      length: fc.option(fc.constantFrom(...NAIL_LENGTHS), { nil: null }),
      base: fc.option(fc.constantFrom(...NAIL_BASES), { nil: null }),
      alerts: fc.subarray([...NAIL_ALERTS]),
    });
    const freeNotesArb = fc
      .string({ maxLength: 180 })
      .filter((s) => !/^\s*\[Ficha t[eé]cnica\]/i.test(s));

    fc.assert(
      fc.property(profileArb, freeNotesArb, (profile, freeNotes) => {
        const serialized = serializeNailTechNotes(profile, freeNotes);
        const parsed = parseNailTechNotes(serialized);
        const expectedAlerts = NAIL_ALERTS.filter((a) => profile.alerts.includes(a));
        expect(parsed.profile).toEqual({
          shape: profile.shape,
          length: profile.length,
          base: profile.base,
          alerts: expectedAlerts,
        });
        expect(parsed.freeNotes).toBe(freeNotes.trim());
      }),
    );
  });
});
