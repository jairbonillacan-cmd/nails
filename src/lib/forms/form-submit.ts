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

export async function formSubmitResultFromResponse(
  res: Response,
  fallbackError: string,
): Promise<FormSubmitResult> {
  if (res.ok) return FORM_SUBMIT_OK;
  const json: unknown = await res.json().catch(() => null);
  const apiError =
    json !== null && typeof json === 'object' && 'error' in json && typeof json.error === 'string'
      ? json.error
      : '';
  return formSubmitError(apiError || fallbackError);
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
