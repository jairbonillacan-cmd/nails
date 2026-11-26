import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
} from '@/lib/auth/admin-session';
import { getSnapshot } from '@/lib/repositories/db';
import { storeMediaUpload } from '@/lib/storage/media';
import {
  DELETE as deleteAdminBrandGallery,
  PATCH as patchAdminBrand,
  POST as postAdminBrandGallery,
} from '@/app/api/admin/brand/route';
import { GET as getMediaFile } from '@/app/api/media/[...path]/route';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2cEAAAAASUVORK5CYII=';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const TEMP_DB_PATH = path.join(
  os.tmpdir(),
  `nails-brand-test-${process.pid}-${crypto.randomUUID()}.json`,
);
const TEMP_UPLOADS_DIR = path.join(
  os.tmpdir(),
  `nails-brand-uploads-${process.pid}-${crypto.randomUUID()}`,
);

let originalDbPathEnv: string | undefined;
let originalUploadsDirEnv: string | undefined;

function makeRequest(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): NextRequest {
  return new NextRequest(url, {
    method: init?.method ?? 'GET',
    headers: init?.headers,
    body: init?.body,
  });
}

function getOwnerCookieHeader(): string {
  const owner = getSnapshot().adminUsers.find((u) => u.role === 'owner' && u.isActive);
  if (!owner) throw new Error('Missing seed owner');
  const token = createAdminSessionToken(owner);
  if (!token) throw new Error('Expected signed owner token');
  return `${ADMIN_SESSION_COOKIE}=${token}`;
}

function resetIsolatedDb(): void {
  globalThis.nailsDbCache = undefined;
  globalThis.nailsDbCachePath = undefined;
  if (fs.existsSync(TEMP_DB_PATH)) {
    fs.unlinkSync(TEMP_DB_PATH);
  }
}

beforeAll(() => {
  originalDbPathEnv = process.env.NAILS_DEMO_DB_PATH;
  originalUploadsDirEnv = process.env.NAILS_DEMO_UPLOADS_DIR;
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  process.env.NAILS_DEMO_UPLOADS_DIR = TEMP_UPLOADS_DIR;
});

beforeEach(() => {
  vi.unstubAllEnvs();
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  process.env.NAILS_DEMO_UPLOADS_DIR = TEMP_UPLOADS_DIR;
  resetIsolatedDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env.NAILS_DEMO_DB_PATH = TEMP_DB_PATH;
  process.env.NAILS_DEMO_UPLOADS_DIR = TEMP_UPLOADS_DIR;
});

afterAll(() => {
  resetIsolatedDb();
  if (fs.existsSync(TEMP_UPLOADS_DIR)) {
    fs.rmSync(TEMP_UPLOADS_DIR, { recursive: true, force: true });
  }
  if (originalDbPathEnv === undefined) {
    delete process.env.NAILS_DEMO_DB_PATH;
  } else {
    process.env.NAILS_DEMO_DB_PATH = originalDbPathEnv;
  }
  if (originalUploadsDirEnv === undefined) {
    delete process.env.NAILS_DEMO_UPLOADS_DIR;
  } else {
    process.env.NAILS_DEMO_UPLOADS_DIR = originalUploadsDirEnv;
  }
});

describe('Admin brand landing customization & public gallery media security', () => {
  it('persists custom landing content, toggles, FAQs, and uploaded PNG hero image via PATCH /api/admin/brand', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'test-brand-secret-patch');

    const res = await patchAdminBrand(
      makeRequest('http://localhost:3000/api/admin/brand', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: getOwnerCookieHeader(),
        },
        body: JSON.stringify({
          coverImageUrl: TINY_PNG_DATA_URL,
          landingContent: {
            heroTitle: 'Tu estudio de uñas en Puebla',
            heroPrimaryCta: 'Apartar lugar',
            heroImageDesktopUrl: TINY_PNG_DATA_URL,
            marqueeItems: ['Promo de mayo', 'Solo con cita'],
            visitHoursDays: 'Lunes a viernes',
            visitHoursText: '10:00 a 19:00',
            galleryMode: 'custom_only',
            customFaqs: [
              {
                id: 'faq-1',
                question: '¿Aceptan transferencia?',
                answer: 'Sí, SPEI al apartar tu lugar.',
              },
            ],
            sections: {
              showConnect: false,
              showMapEmbed: false,
            },
          },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      settings: {
        coverImageUrl: string | null;
        landingContent: {
          heroTitle: string;
          heroPrimaryCta?: string;
          heroImageDesktopUrl?: string | null;
          galleryMode?: string;
          visitHoursDays?: string;
          customFaqs?: Array<{ question: string }>;
          sections?: { showConnect?: boolean; showMapEmbed?: boolean };
        };
      };
    };

    expect(json.settings.coverImageUrl).toMatch(/^\/api\/media\/gallery\/[a-zA-Z0-9_-]+\.png$/);
    expect(json.settings.landingContent.heroImageDesktopUrl).toMatch(
      /^\/api\/media\/gallery\/[a-zA-Z0-9_-]+\.png$/,
    );
    expect(json.settings.landingContent.heroTitle).toBe('Tu estudio de uñas en Puebla');
    expect(json.settings.landingContent.heroPrimaryCta).toBe('Apartar lugar');
    expect(json.settings.landingContent.galleryMode).toBe('custom_only');
    expect(json.settings.landingContent.visitHoursDays).toBe('Lunes a viernes');
    expect(json.settings.landingContent.customFaqs?.[0]?.question).toBe('¿Aceptan transferencia?');
    expect(json.settings.landingContent.sections?.showConnect).toBe(false);
    expect(json.settings.landingContent.sections?.showMapEmbed).toBe(false);
  });

  it('rejects external URLs and SVG data URLs on brand media fields', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'test-brand-secret-reject');

    const extRes = await patchAdminBrand(
      makeRequest('http://localhost:3000/api/admin/brand', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          cookie: getOwnerCookieHeader(),
        },
        body: JSON.stringify({
          logoUrl: 'https://evil.example/logo.png',
        }),
      }),
    );
    expect(extRes.status).toBe(400);

    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from('<svg></svg>').toString('base64')}`;
    const svgRes = await postAdminBrandGallery(
      makeRequest('http://localhost:3000/api/admin/brand', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: getOwnerCookieHeader(),
        },
        body: JSON.stringify({
          title: 'Intento SVG',
          category: 'Softgel',
          imageUrl: svgDataUrl,
        }),
      }),
    );
    expect(svgRes.status).toBe(400);
  });

  it('serves uploaded gallery items publicly with nosniff and immutable cache while keeping proofs strictly private', async () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'test-brand-secret-gallery');

    const postRes = await postAdminBrandGallery(
      makeRequest('http://localhost:3000/api/admin/brand', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: getOwnerCookieHeader(),
        },
        body: JSON.stringify({
          title: 'French cherry perlado',
          caption: 'Punta almendra',
          category: 'Acrílico escultural',
          imageUrl: TINY_PNG_DATA_URL,
          serviceId: null,
          isFeatured: true,
        }),
      }),
    );
    expect(postRes.status).toBe(200);
    const created = (await postRes.json()) as { item: { id: string; imageUrl: string } };
    expect(created.item.imageUrl).toMatch(/^\/api\/media\/gallery\/[a-zA-Z0-9_-]+\.png$/);

    const segments = created.item.imageUrl.replace('/api/media/', '').split('/');
    const publicMediaRes = await getMediaFile(
      makeRequest(`http://localhost:3000${created.item.imageUrl}`),
      { params: Promise.resolve({ path: segments }) },
    );
    expect(publicMediaRes.status).toBe(200);
    expect(publicMediaRes.headers.get('content-type')).toBe('image/png');
    expect(publicMediaRes.headers.get('x-content-type-options')).toBe('nosniff');
    expect(publicMediaRes.headers.get('cache-control')).toContain('public');
    expect(publicMediaRes.headers.get('content-security-policy')).toContain('sandbox');

    const storedProof = await storeMediaUpload({
      dataUrl: TINY_PNG_DATA_URL,
      folder: 'proofs',
    });
    const privateProofRes = await getMediaFile(
      makeRequest(`http://localhost:3000/api/media/${storedProof.storagePath}`),
      { params: Promise.resolve({ path: storedProof.storagePath.split('/') }) },
    );
    expect(privateProofRes.status).toBe(401);

    const delRes = await deleteAdminBrandGallery(
      makeRequest(
        `http://localhost:3000/api/admin/brand?id=${encodeURIComponent(created.item.id)}`,
        {
          method: 'DELETE',
          headers: { cookie: getOwnerCookieHeader() },
        },
      ),
    );
    expect(delRes.status).toBe(200);
    expect(getSnapshot().gallery.some((g) => g.id === created.item.id)).toBe(false);
  });
});
