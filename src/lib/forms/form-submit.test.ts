import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  FORM_SUBMIT_FALLBACK_ERROR,
  FORM_SUBMIT_OK,
  createSubmitGate,
  formSubmitError,
  formSubmitResultFromFetch,
  type FormSubmitResult,
} from './form-submit';

const resultArb: fc.Arbitrary<FormSubmitResult> = fc.oneof(
  fc.constant(FORM_SUBMIT_OK),
  fc.string().map((error) => ({ ok: false as const, error })),
);

describe('createSubmitGate', () => {
  it('runs exactly one task no matter how many submits overlap', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 12 }), resultArb, async (attempts, outcome) => {
        const gate = createSubmitGate();
        let calls = 0;
        let release: () => void = () => undefined;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        const task = async (): Promise<FormSubmitResult> => {
          calls += 1;
          await pending;
          return outcome;
        };
        const runs = Array.from({ length: attempts }, () => gate.run(task));
        expect(gate.isLocked()).toBe(true);
        release();
        const results = await Promise.all(runs);
        expect(calls).toBe(1);
        expect(results.filter((r) => r !== null)).toHaveLength(1);
        expect(gate.isLocked()).toBe(false);
      }),
    );
  });

  it('never reports success for a failed or throwing task, and always carries a visible error', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(resultArb, fc.constant('throw' as const)), async (outcome) => {
        const gate = createSubmitGate();
        const result = await gate.run(async () => {
          if (outcome === 'throw') throw new Error('network');
          return outcome;
        });
        expect(result).not.toBeNull();
        if (outcome !== 'throw' && outcome.ok) {
          expect(result).toEqual(FORM_SUBMIT_OK);
          return;
        }
        expect(result?.ok).toBe(false);
        if (result && !result.ok) expect(result.error.trim().length).toBeGreaterThan(0);
      }),
    );
  });

  it('unlocks after a failure so the form can be retried', async () => {
    const gate = createSubmitGate();
    await gate.run(async () => formSubmitError('Falló'));
    const retry = await gate.run(async () => FORM_SUBMIT_OK);
    expect(retry).toEqual(FORM_SUBMIT_OK);
  });
});

describe('formSubmitError', () => {
  it('falls back to a human message for blank errors', () => {
    fc.assert(
      fc.property(fc.constantFrom('', ' ', '\n', null, undefined), (blank) => {
        expect(formSubmitError(blank)).toEqual({ ok: false, error: FORM_SUBMIT_FALLBACK_ERROR });
      }),
    );
  });
});

describe('formSubmitResultFromFetch', () => {
  it('uses the fetch error when present and the fallback otherwise', () => {
    expect(
      formSubmitResultFromFetch({ ok: false, error: 'Ese código ya existe.' }, 'No se pudo'),
    ).toEqual({
      ok: false,
      error: 'Ese código ya existe.',
    });
    expect(formSubmitResultFromFetch({ ok: false, error: '' }, 'No se pudo')).toEqual({
      ok: false,
      error: 'No se pudo',
    });
    expect(formSubmitResultFromFetch({ ok: true }, 'No se pudo')).toEqual(FORM_SUBMIT_OK);
  });
});
