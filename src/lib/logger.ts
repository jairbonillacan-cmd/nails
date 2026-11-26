type LogLevel = 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  context: Record<string, unknown>;
}

export type LogSink = (entry: StructuredLogEntry) => void;

const SENSITIVE_KEY_RE =
  /(password|secret|token|authorization|cookie|pin|clabe|api[_-]?key|signature|credential|bearer|private[_-]?key|otp|demo[_-]?code)/i;
const PHONE_KEY_RE = /(phone|whatsapp|mobile|tel|cel)/i;
const EMAIL_KEY_RE = /(email|correo|mail)/i;

const EMAIL_VALUE_RE = /\b([a-zA-Z0-9._%+-])([a-zA-Z0-9._%+-]*)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
const BEARER_VALUE_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi;
const PHONE_VALUE_RE = /(?:\+?\d[\d\s\-()]{7,}\d)/g;

declare global {
  var nailsLoggerSink: LogSink | undefined;
}

function maskPhoneValue(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return raw;
  const tail = digits.slice(-3);
  return `***${tail}`;
}

function maskEmailValue(raw: string): string {
  return raw.replace(EMAIL_VALUE_RE, (_m, first: string, _rest: string, domain: string) => {
    return `${first}***@${domain}`;
  });
}

function redactStringValue(raw: string, keyHint?: string): string {
  if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) {
    return '[REDACTED]';
  }
  if (keyHint && EMAIL_KEY_RE.test(keyHint)) {
    return maskEmailValue(raw);
  }
  if (keyHint && PHONE_KEY_RE.test(keyHint)) {
    return maskPhoneValue(raw);
  }
  let sanitized = raw.replace(BEARER_VALUE_RE, '$1 [REDACTED]');
  sanitized = maskEmailValue(sanitized);
  sanitized = sanitized.replace(PHONE_VALUE_RE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 16) return match;
    if (/^\d{4}-\d{2}-\d{2}$/.test(match.trim())) return match;
    return `***${digits.slice(-3)}`;
  });
  return sanitized;
}

function redactInternal(
  value: unknown,
  keyHint: string | undefined,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (keyHint && SENSITIVE_KEY_RE.test(keyHint)) {
    return '[REDACTED]';
  }
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactStringValue(value, keyHint);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactStringValue(value.message),
    };
  }
  if (depth >= 5) {
    return '[MAX_DEPTH]';
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[CIRCULAR]';
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => redactInternal(item, undefined, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactInternal(v, k, depth + 1, seen);
    }
    return out;
  }
  return String(value);
}

export function redactPii(value: unknown, keyHint?: string): unknown {
  return redactInternal(value, keyHint, 0, new WeakSet<object>());
}

export function setLoggerSinkForTests(sink: LogSink | null): void {
  globalThis.nailsLoggerSink = sink ?? undefined;
}

function emitLog(level: LogLevel, event: string, context?: LogContext): void {
  const customSink = globalThis.nailsLoggerSink;
  if (process.env.NODE_ENV === 'test' && !customSink) {
    return;
  }

  const redactedContext = context
    ? (redactPii(context) as Record<string, unknown>)
    : {};

  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    context: redactedContext,
  };

  if (customSink) {
    customSink(entry);
    return;
  }

  const serialized = JSON.stringify(entry);
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export function logInfo(event: string, context?: LogContext): void {
  emitLog('info', event, context);
}

export function logWarn(event: string, context?: LogContext): void {
  emitLog('warn', event, context);
}

export function logError(event: string, context?: LogContext): void {
  emitLog('error', event, context);
}
