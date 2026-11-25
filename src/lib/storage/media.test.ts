import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  detectImageMimeFromMagicBytes,
  MAX_MEDIA_BYTES,
  MediaValidationError,
  storeMediaUpload,
  validateMediaBuffer,
  validateMediaDataUrl,
} from './media';

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const VALID_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const VALID_WEBP_BYTES = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);

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

describe('Media Storage Validation & Persistence (A5)', () => {
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

  it('persists valid images to isolated demo uploads directory without returning base64', async () => {
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
  });

  it('uploads validated images to Supabase salon-media bucket and returns signedUrl when Supabase is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'mock-anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-service-role-key');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/storage/v1/object/sign/salon-media/')) {
        return new Response(
          JSON.stringify({ signedURL: '/object/sign/salon-media/proofs/signed-token' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/storage/v1/object/salon-media/')) {
        return new Response(
          JSON.stringify({ Id: 'obj-1', Key: 'salon-media/proofs/test.jpg' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 404 });
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
    expect(stored.signedUrl).toContain('signed-token');
  });
});
