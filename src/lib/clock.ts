import crypto from 'node:crypto';

const BOOKING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface Clock {
  now(): Date;
  nowMs(): number;
  randomUUID(): string;
  randomCode(length?: number): string;
}

export interface FixedClock extends Clock {
  advanceMs(deltaMs: number): void;
  setNow(next: string | Date): void;
}

function encodeAlphabetBytes(bytes: Uint8Array, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += BOOKING_CODE_ALPHABET[byte & 31] ?? 'A';
  }
  return out;
}

function deterministicBytes(seed: string, length: number): Uint8Array {
  const chunks: Buffer[] = [];
  let collected = 0;
  let block = 0;
  while (collected < length) {
    const hash = crypto
      .createHash('sha256')
      .update(`${seed}:${block}`)
      .digest();
    chunks.push(hash);
    collected += hash.length;
    block += 1;
  }
  return Buffer.concat(chunks).subarray(0, length);
}

function formatUuidFromBytes(bytes: Uint8Array): string {
  const copy = Uint8Array.from(bytes.subarray(0, 16));
  copy[6] = ((copy[6] ?? 0) & 0x0f) | 0x40;
  copy[8] = ((copy[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(copy).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const systemClock: Clock = {
  now(): Date {
    return new Date();
  },
  nowMs(): number {
    return Date.now();
  },
  randomUUID(): string {
    return crypto.randomUUID();
  },
  randomCode(length = 6): string {
    if (length <= 0) return '';
    return encodeAlphabetBytes(crypto.randomBytes(length), length);
  },
};

export function createFixedClock(
  isoOrDate: string | Date,
  seedPrefix = 'fixed',
): FixedClock {
  let currentMs =
    isoOrDate instanceof Date ? isoOrDate.getTime() : new Date(isoOrDate).getTime();
  if (Number.isNaN(currentMs)) {
    throw new Error('Invalid date provided to createFixedClock');
  }
  let uuidSeq = 0;
  let codeSeq = 0;

  return {
    now(): Date {
      return new Date(currentMs);
    },
    nowMs(): number {
      return currentMs;
    },
    randomUUID(): string {
      uuidSeq += 1;
      const bytes = deterministicBytes(`${seedPrefix}:uuid:${uuidSeq}`, 16);
      return formatUuidFromBytes(bytes);
    },
    randomCode(length = 6): string {
      if (length <= 0) return '';
      codeSeq += 1;
      const bytes = deterministicBytes(`${seedPrefix}:code:${codeSeq}:${length}`, length);
      return encodeAlphabetBytes(bytes, length);
    },
    advanceMs(deltaMs: number): void {
      currentMs += deltaMs;
    },
    setNow(next: string | Date): void {
      const nextMs = next instanceof Date ? next.getTime() : new Date(next).getTime();
      if (Number.isNaN(nextMs)) {
        throw new Error('Invalid date provided to FixedClock.setNow');
      }
      currentMs = nextMs;
    },
  };
}

export function generateId(prefix?: string, clock: Clock = systemClock): string {
  const uuid = clock.randomUUID();
  return prefix ? `${prefix}-${uuid}` : uuid;
}

export function generateBookingCode(clock: Clock = systemClock): string {
  return `NL-${clock.randomCode(6)}`;
}
