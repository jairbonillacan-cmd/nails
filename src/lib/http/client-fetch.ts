export const DEFAULT_CLIENT_FETCH_TIMEOUT_MS = 15_000;
const BEST_EFFORT_TIMEOUT_MS = 10_000;

interface ClientFetchOptions extends RequestInit {
  timeoutMs?: number;
}

type ClientFetchFailureReason =
  | 'http_error'
  | 'invalid_json'
  | 'timeout'
  | 'network'
  | 'aborted';

type ClientFetchResult<T> =
  | {
      ok: true;
      status: number;
      data: T;
      retryAfterSeconds?: undefined;
      aborted: false;
    }
  | {
      ok: false;
      status: number;
      data: T | null;
      error: string;
      retryAfterSeconds?: number;
      reason: ClientFetchFailureReason;
      aborted: boolean;
    };

type ClientBlobFetchResult =
  | {
      ok: true;
      status: number;
      blob: Blob;
      retryAfterSeconds?: undefined;
      aborted: false;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      retryAfterSeconds?: number;
      reason: ClientFetchFailureReason;
      aborted: boolean;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractServerError(parsed: unknown): string | null {
  if (!isRecord(parsed)) return null;
  const raw = parsed.error;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractServerCode(parsed: unknown): string | undefined {
  if (!isRecord(parsed)) return undefined;
  const raw = parsed.code;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseRetryAfterSeconds(
  headerValue: string | null,
  nowMs = Date.now(),
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  if (/^-?\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    const deltaSeconds = Math.ceil((dateMs - nowMs) / 1000);
    return deltaSeconds > 0 ? deltaSeconds : 1;
  }
  return undefined;
}

function formatRateLimitError(
  serverError: string | null,
  retryAfterSeconds: number | undefined,
): string {
  if (retryAfterSeconds) {
    if (serverError) {
      if (/\d+\s*(?:s|seg)/i.test(serverError)) return serverError;
      return `${serverError.replace(/\.+$/, '')}. Intenta de nuevo en ${retryAfterSeconds} s.`;
    }
    return `Demasiados intentos seguidos. Espera ${retryAfterSeconds} segundos e intenta de nuevo.`;
  }
  return serverError || 'Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo.';
}

function buildCombinedSignal(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; timeoutSignal: AbortSignal | undefined } {
  const timeoutSignal =
    timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  if (callerSignal && timeoutSignal) {
    if (typeof AbortSignal.any === 'function') {
      return { signal: AbortSignal.any([callerSignal, timeoutSignal]), timeoutSignal };
    }
    return { signal: callerSignal, timeoutSignal: undefined };
  }

  return { signal: callerSignal ?? timeoutSignal, timeoutSignal };
}

function classifyFetchError(
  err: unknown,
  callerSignal: AbortSignal | null | undefined,
  timeoutSignal: AbortSignal | undefined,
): { reason: 'aborted' | 'timeout' | 'network'; aborted: boolean; error: string } {
  if (callerSignal?.aborted) {
    return {
      reason: 'aborted',
      aborted: true,
      error: 'Solicitud cancelada.',
    };
  }
  const errName = err instanceof Error ? err.name : '';
  if (timeoutSignal?.aborted || errName === 'TimeoutError' || errName === 'AbortError') {
    return {
      reason: 'timeout',
      aborted: false,
      error: 'La solicitud tardó demasiado en responder. Revisa tu conexión e intenta de nuevo.',
    };
  }
  return {
    reason: 'network',
    aborted: false,
    error: 'Error de conexión. Revisa tu internet e intenta de nuevo.',
  };
}

export async function fetchJsonWithTimeout<T = unknown>(
  input: string | URL,
  options: ClientFetchOptions = {},
): Promise<ClientFetchResult<T>> {
  const { timeoutMs = DEFAULT_CLIENT_FETCH_TIMEOUT_MS, signal: callerSignal, ...init } = options;

  if (callerSignal?.aborted) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Solicitud cancelada.',
      reason: 'aborted',
      aborted: true,
    };
  }

  const { signal, timeoutSignal } = buildCombinedSignal(callerSignal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    const classified = classifyFetchError(err, callerSignal, timeoutSignal);
    return {
      ok: false,
      status: 0,
      data: null,
      error: classified.error,
      reason: classified.reason,
      aborted: classified.aborted,
    };
  }

  let rawText: string;
  try {
    rawText = await response.text();
  } catch (err) {
    const classified = classifyFetchError(err, callerSignal, timeoutSignal);
    return {
      ok: false,
      status: response.status,
      data: null,
      error: classified.error,
      reason: classified.reason,
      aborted: classified.aborted,
    };
  }

  if (callerSignal?.aborted) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: 'Solicitud cancelada.',
      reason: 'aborted',
      aborted: true,
    };
  }

  const retryAfterSeconds =
    response.status === 429 || response.status === 503
      ? parseRetryAfterSeconds(response.headers.get('Retry-After'))
      : undefined;

  const trimmedText = rawText.trim();
  let parsed: unknown = null;
  let hasValidJson = false;

  if (trimmedText.length > 0) {
    try {
      parsed = JSON.parse(trimmedText) as unknown;
      hasValidJson = true;
    } catch {
      parsed = null;
      hasValidJson = false;
    }
  } else if (response.status === 204) {
    parsed = {};
    hasValidJson = true;
  }

  if (!response.ok) {
    const serverError = hasValidJson ? extractServerError(parsed) : null;
    const error =
      response.status === 429
        ? formatRateLimitError(serverError, retryAfterSeconds)
        : hasValidJson
          ? (serverError ??
            `No pudimos completar la solicitud (error ${response.status}). Intenta de nuevo.`)
          : `El servidor tardó demasiado o no pudo responder (error ${response.status}). Intenta de nuevo en unos segundos.`;

    return {
      ok: false,
      status: response.status,
      data: hasValidJson ? (parsed as T) : null,
      error,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      reason: hasValidJson ? 'http_error' : 'invalid_json',
      aborted: false,
    };
  }

  if (!hasValidJson) {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: 'El servidor devolvió una respuesta inesperada. Intenta de nuevo en unos segundos.',
      reason: 'invalid_json',
      aborted: false,
    };
  }

  return {
    ok: true,
    status: response.status,
    data: parsed as T,
    aborted: false,
  };
}

export async function fetchBlobWithTimeout(
  input: string | URL,
  options: ClientFetchOptions = {},
): Promise<ClientBlobFetchResult> {
  const { timeoutMs = DEFAULT_CLIENT_FETCH_TIMEOUT_MS, signal: callerSignal, ...init } = options;

  if (callerSignal?.aborted) {
    return {
      ok: false,
      status: 0,
      error: 'Solicitud cancelada.',
      reason: 'aborted',
      aborted: true,
    };
  }

  const { signal, timeoutSignal } = buildCombinedSignal(callerSignal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    const classified = classifyFetchError(err, callerSignal, timeoutSignal);
    return {
      ok: false,
      status: 0,
      error: classified.error,
      reason: classified.reason,
      aborted: classified.aborted,
    };
  }

  if (!response.ok) {
    const retryAfterSeconds =
      response.status === 429 || response.status === 503
        ? parseRetryAfterSeconds(response.headers.get('Retry-After'))
        : undefined;
    let parsed: unknown = null;
    let hasValidJson = false;
    try {
      const rawText = await response.text();
      if (rawText.trim().length > 0) {
        parsed = JSON.parse(rawText) as unknown;
        hasValidJson = true;
      }
    } catch {
      parsed = null;
      hasValidJson = false;
    }

    const serverError = hasValidJson ? extractServerError(parsed) : null;
    const code = hasValidJson ? extractServerCode(parsed) : undefined;
    const error =
      response.status === 429
        ? formatRateLimitError(serverError, retryAfterSeconds)
        : hasValidJson
          ? (serverError ??
            `No pudimos completar la descarga (error ${response.status}). Intenta de nuevo.`)
          : `El servidor tardó demasiado o no pudo responder (error ${response.status}). Intenta de nuevo en unos segundos.`;

    return {
      ok: false,
      status: response.status,
      error,
      ...(code ? { code } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      reason: hasValidJson ? 'http_error' : 'invalid_json',
      aborted: false,
    };
  }

  try {
    const blob = await response.blob();
    if (callerSignal?.aborted) {
      return {
        ok: false,
        status: response.status,
        error: 'Solicitud cancelada.',
        reason: 'aborted',
        aborted: true,
      };
    }
    return {
      ok: true,
      status: response.status,
      blob,
      aborted: false,
    };
  } catch (err) {
    const classified = classifyFetchError(err, callerSignal, timeoutSignal);
    return {
      ok: false,
      status: response.status,
      error: classified.error,
      reason: classified.reason,
      aborted: classified.aborted,
    };
  }
}

export function sendBestEffortRequest(
  input: string | URL,
  options: ClientFetchOptions = {},
): void {
  const { timeoutMs = BEST_EFFORT_TIMEOUT_MS, signal: callerSignal, ...init } = options;
  if (callerSignal?.aborted) return;
  const { signal } = buildCombinedSignal(callerSignal, timeoutMs);
  void fetch(input, {
    ...init,
    ...(signal ? { signal } : {}),
  }).catch(() => undefined);
}
