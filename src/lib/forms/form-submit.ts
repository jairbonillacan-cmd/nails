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
  result: {
    readonly ok: boolean;
    readonly error?: string;
    readonly status?: number;
    readonly retryAfterSeconds?: number;
  },
  fallbackError: string,
): FormSubmitResult {
  if (result.ok) return FORM_SUBMIT_OK;
  const cleanError = (result.error ?? '').trim();
  if (cleanError) return formSubmitError(cleanError);
  if (result.status === 429) {
    return formSubmitError(
      result.retryAfterSeconds
        ? `Demasiados intentos seguidos. Espera ${result.retryAfterSeconds} segundos e intenta de nuevo.`
        : 'Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.',
    );
  }
  if (result.status === 409) {
    return formSubmitError(
      'Este registro cambió o ya existe un conflicto. Actualiza la vista e intenta de nuevo.',
    );
  }
  return formSubmitError(fallbackError);
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
