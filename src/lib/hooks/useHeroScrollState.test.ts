import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  resolveHeroScrollState,
  resolveNavPhase,
  type HeroNavPhase,
  type HeroScrollState,
} from './useHeroScrollState';

const scrollStateArb = fc.constantFrom<HeroScrollState>('pending', 'top', 'inside', 'past');

function replay(states: readonly HeroScrollState[]): HeroNavPhase[] {
  const phases: HeroNavPhase[] = [];
  let phase: HeroNavPhase = { state: 'pending', isFloating: false };
  for (const state of states) {
    phase = resolveNavPhase(phase, state);
    phases.push(phase);
  }
  return phases;
}

describe('resolveHeroScrollState', () => {
  it('never reports past while the hero still covers the nav', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 25, max: 5000 }),
        fc.integer({ min: 97, max: 2000 }),
        (scrollY, heroBottom) => {
          expect(resolveHeroScrollState({ scrollY, heroBottom, topThreshold: 24, navHeight: 96 })).toBe('inside');
        },
      ),
    );
  });

  it('is top near the start regardless of the hero', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 }), fc.option(fc.integer({ min: -2000, max: 2000 })), (scrollY, heroBottom) => {
        expect(resolveHeroScrollState({ scrollY, heroBottom, topThreshold: 24, navHeight: 96 })).toBe('top');
      }),
    );
  });
});

describe('resolveNavPhase', () => {
  it('floats only when past, or while leaving straight from past', () => {
    fc.assert(
      fc.property(fc.array(scrollStateArb, { maxLength: 40 }), (states) => {
        const phases = replay(states);
        phases.forEach((phase, index) => {
          if (phase.state === 'past') expect(phase.isFloating).toBe(true);
          if (phase.state === 'top' || phase.state === 'pending') expect(phase.isFloating).toBe(false);
          if (phase.state === 'inside' && phase.isFloating) {
            const previous = phases[index - 1];
            expect(previous?.state === 'past' || (previous?.state === 'inside' && previous.isFloating)).toBe(true);
          }
        });
      }),
    );
  });

  it('a reload mid-hero never flashes the capsule', () => {
    expect(replay(['inside'])).toEqual([{ state: 'inside', isFloating: false }]);
    expect(replay(['top', 'inside'])).toEqual([
      { state: 'top', isFloating: false },
      { state: 'inside', isFloating: false },
    ]);
  });

  it('keeps the capsule look while it lifts away going back up', () => {
    expect(replay(['past', 'inside', 'top']).map((p) => p.isFloating)).toEqual([true, true, false]);
  });
});
