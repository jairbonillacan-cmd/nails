import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  deleteStoredMedia,
  detectImageMimeFromMagicBytes,
  MAX_MEDIA_BYTES,
  MediaValidationError,
  parseSafeMediaPath,
  readStoredMedia,
  signMediaUrl,
  storeMediaUpload,
  validateMediaBuffer,
  validateMediaDataUrl,
  verifyMediaSignature,
} from './media';

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const VALID_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

const TEMP_UPLOADS_DIR = path.join(
  os.tmpdir(),
  `nails-media-test-${process.pid}-${crypto.randomUUID()}`,
);

let originalUploadsEnv: string | undefined;

beforeAll(() => {
  originalUploadsEnv = process.env.NAILS_DEMO_UPLOADS_DIR;
  process.env.NAILS_DEMO_UPLOADS_DIR = TEMP_UPLOADS_DIR;
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, CLOUDFLARE_CONTEXT_SYMBOL);
  globalThis.nailsEphemeralMediaSigningSecret = undefined;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (fs.existsSync(TEMP_UPLOADS_DIR)) {
    fs.rmSync(TEMP_UPLOADS_DIR, { recursive: true, force: true });
  }
});

afterAll(() => {
  if (fs.existsSync(TEMP_UPLOADS_DIR)) {
    fs.rmSync(TEMP_UPLOADS_DIR, { recursive: true, force: true });
  }
  if (originalUploadsEnv === undefined) {
    delete process.env.NAILS_DEMO_UPLOADS_DIR;
  } else {
    process.env.NAILS_DEMO_UPLOADS_DIR = originalUploadsEnv;
  }
});

describe('Cloudflare R2 Private Media Storage & Validation', () => {
  it('detects PNG, JPEG, and WEBP magic bytes and rejects spoofed or unsupported payloads', () => {
    expect(detectImageMimeFromMagicBytes(VALID_PNG_BYTES)).toBe('image/png');
    expect(detectImageMimeFromMagicBytes(VALID_JPEG_BYTES)).toBe('image/jpeg');
    expect(detectImageMimeFromMagicBytes(VALID_WEBP_BYTES)).toBe('image/webp');
    expect(
      detectImageMimeFromMagicBytes(Buffer.from('<svg onload=alert(1)></svg>', 'utf8')),
    ).toBeNull();

    const spoofedPngDataUrl = `data:image/png;base64,${Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'utf8',
    ).toString('base64')}`;

    expect(() => validateMediaDataUrl(spoofedPngDataUrl)).toThrowError(
      MediaValidationError,
    );
    try {
      validateMediaDataUrl(spoofedPngDataUrl);
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe('MAGIC_BYTE_MISMATCH');
    }

    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from('<svg/>', 'utf8').toString('base64')}`;
    try {
      validateMediaDataUrl(svgDataUrl);
      throw new Error('Expected SVG to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe('UNSUPPORTED_MIME');
    }

    try {
      validateMediaBuffer(VALID_JPEG_BYTES, 'image/png');
      throw new Error('Expected MIME mismatch to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe('MAGIC_BYTE_MISMATCH');
    }

    try {
      validateMediaBuffer(Buffer.alloc(0), 'image/png');
      throw new Error('Expected empty file to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe('EMPTY_FILE');
    }
  });

  it('rejects images larger than 2.5 MB decoded size on both buffer and data URL inputs', () => {
    const oversized = Buffer.alloc(MAX_MEDIA_BYTES + 1);
    VALID_PNG_BYTES.copy(oversized, 0);

    try {
      validateMediaBuffer(oversized, 'image/png');
      throw new Error('Expected oversized buffer to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe('FILE_TOO_LARGE');
    }

    const oversizedDataUrl = `data:image/png;base64,${oversized.toString('base64')}`;
    try {
      validateMediaDataUrl(oversizedDataUrl);
      throw new Error('Expected oversized data URL to be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(MediaValidationError);
      expect((err as MediaValidationError).code).toBe('FILE_TOO_LARGE');
    }
  });

  it('rejects path traversal, backslashes, and unknown folders in parseSafeMediaPath and deleteStoredMedia', async () => {
    expect(parseSafeMediaPath('proofs/valid_file-1.png')?.storagePath).toBe(
      'proofs/valid_file-1.png',
    );
    expect(parseSafeMediaPath('../.env')).toBeNull();
    expect(parseSafeMediaPath('proofs/../../package.json')).toBeNull();
    expect(parseSafeMediaPath('proofs\\evil.png')).toBeNull();
    expect(parseSafeMediaPath('unknown/file.png')).toBeNull();
    expect(parseSafeMediaPath('proofs/file.svg')).toBeNull();
    expect(parseSafeMediaPath('/proofs/file.png')).toBeNull();

    await expect(deleteStoredMedia('proofs/../secret.png')).rejects.toThrowError(
      MediaValidationError,
    );
    expect(await readStoredMedia('proofs/../secret.png')).toEqual({ status: 400 });
  });

  it('persists, reads, and deletes valid images via Tier 3 demo local fallback', async () => {
    const pngDataUrl = `data:image/png;base64,${VALID_PNG_BYTES.toString('base64')}`;
    const stored = await storeMediaUpload({
      dataUrl: pngDataUrl,
      folder: 'inspo',
    });

    expect(stored.storagePath).toMatch(/^inspo\/[0-9a-f-]+\.png$/i);
    expect(stored.storagePath).not.toContain('data:');
    expect(stored.contentType).toBe('image/png');
    expect(stored.sizeBytes).toBe(VALID_PNG_BYTES.byteLength);

    const diskPath = path.join(TEMP_UPLOADS_DIR, stored.storagePath);
    expect(fs.existsSync(diskPath)).toBe(true);
    expect(fs.readFileSync(diskPath).equals(VALID_PNG_BYTES)).toBe(true);

    const loaded = await readStoredMedia(stored.storagePath);
    expect(loaded.status).toBe(200);
    if (loaded.status === 200) {
      expect(loaded.driver).toBe('demo_local');
      expect(loaded.contentType).toBe('image/png');
      expect(loaded.bytes.equals(VALID_PNG_BYTES)).toBe(true);
    }

    const del1 = await deleteStoredMedia(stored.storagePath);
    expect(del1).toEqual({ deleted: true, driver: 'demo_local' });
    expect(fs.existsSync(diskPath)).toBe(false);

    const del2 = await deleteStoredMedia(stored.storagePath);
    expect(del2).toEqual({ deleted: false, driver: 'demo_local' });
  });

  it('uses Tier 1 native Cloudflare R2 binding (SALON_MEDIA_BUCKET) when present', async () => {
    vi.stubEnv('CLIENT_SESSION_SECRET', 'r2-binding-sign-secret');
    const store = new Map<string, { bytes: Uint8Array; contentType?: string }>();
    const mockBucket = {
      put: vi.fn(
        async (
          key: string,
          value: Uint8Array,
          options?: { httpMetadata?: { contentType?: string } },
        ) => {
          store.set(key, {
            bytes: new Uint8Array(value),
            contentType: options?.httpMetadata?.contentType,
          });
        },
      ),
      get: vi.fn(async (key: string) => {
        const entry = store.get(key);
        if (!entry) return null;
        return {
          arrayBuffer: async () =>
            entry.bytes.buffer.slice(
              entry.bytes.byteOffset,
              entry.bytes.byteOffset + entry.bytes.byteLength,
            ),
        };
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };

    Reflect.set(globalThis, CLOUDFLARE_CONTEXT_SYMBOL, {
      env: { SALON_MEDIA_BUCKET: mockBucket },
      cf: undefined,
      ctx: {},
    });

    const stored = await storeMediaUpload({
      buffer: VALID_WEBP_BYTES,
      declaredMimeType: 'image/webp',
      folder: 'proofs',
    });

    expect(mockBucket.put).toHaveBeenCalledTimes(1);
    expect(stored.storagePath).toMatch(/^proofs\/[0-9a-f-]+\.webp$/i);
    expect(stored.signedUrl).toContain(`/api/media/${stored.storagePath}?exp=`);

    const loaded = await readStoredMedia(stored.storagePath);
    expect(loaded.status).toBe(200);
    if (loaded.status === 200) {
      expect(loaded.driver).toBe('r2_binding');
      expect(loaded.contentType).toBe('image/webp');
      expect(loaded.bytes.equals(VALID_WEBP_BYTES)).toBe(true);
    }

    const del = await deleteStoredMedia(stored.storagePath);
    expect(del).toEqual({ deleted: true, driver: 'r2_binding' });
    expect(await readStoredMedia(stored.storagePath)).toEqual({ status: 404 });
  });

  it('uses Tier 2 S3-compatible R2 HTTP via aws4fetch when R2 env vars are configured', async () => {
    vi.stubEnv('R2_ACCOUNT_ID', 'acct1234567890');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'r2-access-key');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'r2-secret-key');
    vi.stubEnv('R2_BUCKET_NAME', 'laikona-nails-media');
    vi.stubEnv('CLIENT_SESSION_SECRET', 'r2-s3-sign-secret');

    const r2Objects = new Map<string, Uint8Array>();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const url = new URL(req.url);
      expect(url.hostname).toBe('acct1234567890.r2.cloudflarestorage.com');
      expect(req.headers.get('authorization')).toContain('AWS4-HMAC-SHA256');
      const key = url.pathname.replace(/^\/laikona-nails-media\//, '');

      if (req.method === 'PUT') {
        const body = new Uint8Array(await req.arrayBuffer());
        r2Objects.set(key, body);
        return new Response(null, { status: 200 });
      }
      if (req.method === 'GET') {
        const existing = r2Objects.get(key);
        if (!existing) return new Response(null, { status: 404 });
        return new Response(Buffer.from(existing), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        });
      }
      if (req.method === 'DELETE') {
        const existed = r2Objects.delete(key);
        return new Response(null, { status: existed ? 204 : 404 });
      }
      return new Response(null, { status: 405 });
    });

    const stored = await storeMediaUpload({
      buffer: VALID_JPEG_BYTES,
      declaredMimeType: 'image/jpeg',
      folder: 'proofs',
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(stored.storagePath).toMatch(/^proofs\/[0-9a-f-]+\.jpg$/i);
    expect(stored.contentType).toBe('image/jpeg');
    expect(stored.sizeBytes).toBe(VALID_JPEG_BYTES.byteLength);
    expect(stored.signedUrl).toContain(`/api/media/${stored.storagePath}?exp=`);

    const loaded = await readStoredMedia(stored.storagePath);
    expect(loaded.status).toBe(200);
    if (loaded.status === 200) {
      expect(loaded.driver).toBe('r2_s3');
      expect(loaded.bytes.equals(VALID_JPEG_BYTES)).toBe(true);
    }

    const del = await deleteStoredMedia(stored.storagePath);
    expect(del).toEqual({ deleted: true, driver: 'r2_s3' });
    expect(await readStoredMedia(stored.storagePath)).toEqual({ status: 404 });
  });

  it('signs and verifies short-lived HMAC-SHA256 media URLs and fails closed in production without secret', () => {
    vi.stubEnv('CLIENT_SESSION_SECRET', 'media-hmac-test-secret');
    const nowMs = Date.parse('2026-11-25T12:00:00.000Z');

    const signed = signMediaUrl('proofs/receipt-01.png', { ttlSeconds: 3600, nowMs });
    expect(signed).toBeTruthy();

    const parsedUrl = new URL(`https://laikona.mx${signed ?? ''}`);
    const exp = parsedUrl.searchParams.get('exp');
    const sig = parsedUrl.searchParams.get('sig');

    expect(verifyMediaSignature('proofs/receipt-01.png', exp, sig, nowMs + 60_000)).toBe(true);
    expect(verifyMediaSignature('proofs/receipt-01.png', exp, sig, nowMs + 3_600_000)).toBe(false);
    expect(verifyMediaSignature('proofs/other-file.png', exp, sig, nowMs + 60_000)).toBe(false);
    expect(verifyMediaSignature('proofs/receipt-01.png', exp, 'tampered-sig', nowMs + 60_000)).toBe(
      false,
    );

    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CLIENT_SESSION_SECRET', '');
    vi.stubEnv('ADMIN_SESSION_SECRET', '');

    expect(signMediaUrl('proofs/receipt-01.png', { nowMs })).toBeNull();
    expect(verifyMediaSignature('proofs/receipt-01.png', exp, sig, nowMs + 60_000)).toBe(false);
  });
});
