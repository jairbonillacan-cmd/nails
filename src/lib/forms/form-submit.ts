export type FormSubmitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export const FORM_SUBMIT_FALLBACK_ERROR =
  'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.';

export const FORM_SUBMIT_OK: FormSubmitResult = { ok: true };

export function formSubmitError(error: string | null | undefined): FormSubmitResult {
  const clean = (error ?? '').trim();
  return { ok: false, error: clean || FORM_SUBMIT_FALLBACK_ERROR };
}

export function formSubmitResultFromFetch(
  result: { readonly ok: boolean; readonly error?: string },
  fallbackError: string,
): FormSubmitResult {
  if (result.ok) return FORM_SUBMIT_OK;
  return formSubmitError(result.error || fallbackError);
}

export interface SubmitGate {
  readonly isLocked: () => boolean;
  readonly run: (task: () => Promise<FormSubmitResult>) => Promise<FormSubmitResult | null>;
}

export function createSubmitGate(): SubmitGate {
  let locked = false;
  return {
    isLocked: () => locked,
    run: async (task) => {
      if (locked) return null;
      locked = true;
      try {
        const result = await task();
        return result.ok ? FORM_SUBMIT_OK : formSubmitError(result.error);
      } catch {
        return formSubmitError(null);
      } finally {
        locked = false;
      }
    },
  };
}
