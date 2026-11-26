import crypto from 'node:crypto';

const OWNER_PIN_REGEX = /^\d{4,6}$/;

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;
const HEX_RE = /^[0-9a-f]+$/i;

export function isValidOwnerPinFormat(pin: string): boolean {
  return OWNER_PIN_REGEX.test(pin.trim());
}

export function hashOwnerPin(pin: string): string {
  const normalized = pin.trim();
  if (!isValidOwnerPinFormat(normalized)) {
    throw new Error('El PIN debe tener entre 4 y 6 dígitos numéricos.');
  }
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derived = crypto.scryptSync(normalized, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

export function verifyOwnerPin(
  pin: string,
  storedHash: string | null | undefined,
): boolean {
  const normalized = pin.trim();
  if (!storedHash || !isValidOwnerPinFormat(normalized)) {
    return false;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4] ?? '';
  const expectedHex = parts[5] ?? '';

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    n < 1024 ||
    r < 1 ||
    p < 1 ||
    salt.length < 16 ||
    !HEX_RE.test(salt) ||
    expectedHex.length !== KEY_LEN * 2 ||
    !HEX_RE.test(expectedHex)
  ) {
    return false;
  }

  try {
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const actualBuf = crypto.scryptSync(normalized, salt, expectedBuf.length, {
      N: n,
      r,
      p,
    });
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}
