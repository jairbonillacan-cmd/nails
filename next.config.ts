import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

if (process.env.CLOUDFLARE_DEV === '1') {
  void initOpenNextCloudflareForDev();
}

const isProduction = process.env.NODE_ENV === 'production';

function extractHttpOrigin(rawUrl: string | undefined): string | null {
  const trimmed = rawUrl?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return parsed.origin;
    if (!isProduction && parsed.protocol === 'http:') return parsed.origin;
    return null;
  } catch {
    return null;
  }
}

function extractWsOrigin(rawUrl: string | undefined): string | null {
  const origin = extractHttpOrigin(rawUrl);
  if (!origin) return null;
  if (origin.startsWith('https://')) return `wss://${origin.slice('https://'.length)}`;
  if (!isProduction && origin.startsWith('http://')) {
    return `ws://${origin.slice('http://'.length)}`;
  }
  return null;
}

function uniqueTokens(tokens: ReadonlyArray<string | null | undefined>): string[] {
  return Array.from(new Set(tokens.filter((token): token is string => Boolean(token))));
}

const rawSupabaseOrigin = extractHttpOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const rawSupabaseWsOrigin = extractWsOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseOrigin =
  rawSupabaseOrigin && !rawSupabaseOrigin.endsWith('.supabase.co')
    ? rawSupabaseOrigin
    : null;
const supabaseWsOrigin =
  rawSupabaseWsOrigin && !rawSupabaseWsOrigin.endsWith('.supabase.co')
    ? rawSupabaseWsOrigin
    : null;
const r2PublicOrigin = extractHttpOrigin(process.env.R2_PUBLIC_BASE_URL);

const SAFE_FRAME_ANCESTOR_RE =
  /^(?:'self'|'none'|\*|https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d+)?|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/i;

function resolveEmbedFrameAncestors(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim();
  if (!trimmed) return '*';
  const tokens = uniqueTokens(
    trimmed
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter((token) => SAFE_FRAME_ANCESTOR_RE.test(token)),
  );
  return tokens.length > 0 ? tokens.join(' ') : "'self'";
}

const imgSrcTokens = uniqueTokens([
  "'self'",
  'data:',
  'blob:',
  r2PublicOrigin,
  supabaseOrigin,
  'https://*.r2.dev',
  'https://*.supabase.co',
  'https://www.google-analytics.com',
  'https://www.facebook.com',
]);

const connectSrcTokens = uniqueTokens([
  "'self'",
  supabaseOrigin,
  supabaseWsOrigin,
  r2PublicOrigin,
  'https://*.supabase.co',
  'wss://*.supabase.co',
  'https://www.google-analytics.com',
  'https://region1.google-analytics.com',
  'https://www.facebook.com',
  'https://cloudflareinsights.com',
  isProduction ? null : 'ws:',
]);

function buildContentSecurityPolicy(frameAncestors: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://www.googletagmanager.com https://connect.facebook.net${isProduction ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrcTokens.join(' ')}`,
    "font-src 'self' data:",
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    `connect-src ${connectSrcTokens.join(' ')}`,
    'frame-src https://www.google.com https://maps.google.com',
    `frame-ancestors ${frameAncestors}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

const strictContentSecurityPolicy = buildContentSecurityPolicy("'none'");
const embedContentSecurityPolicy = buildContentSecurityPolicy(
  resolveEmbedFrameAncestors(process.env.EMBED_FRAME_ANCESTORS),
);

const baseSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  ...(isProduction
    ? [
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ]
    : []),
];

const strictFrameHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: strictContentSecurityPolicy },
];

const embedFrameHeaders = [
  { key: 'Content-Security-Policy', value: embedContentSecurityPolicy },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
];

const immutableAssetHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
];

const publicGalleryMediaHeaders = [
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
];

const serviceWorkerHeaders = [
  { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
  { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
  { key: 'Service-Worker-Allowed', value: '/' },
];

const privateManageHeaders = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'Vary', value: 'Cookie' },
];

const distDir = process.env.NEXT_DIST_DIR?.trim() || '.next';

const extraDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedDevOrigins = Array.from(
  new Set(['192.168.1.186', ...extraDevOrigins]),
);

const nextConfig: NextConfig = {
  distDir,
  poweredByHeader: false,
  allowedDevOrigins,
  experimental: {
    optimizePackageImports: ['@astryxdesign/core', 'lucide-react'],
  },
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: baseSecurityHeaders,
      },
      {
        source: '/((?!reservar(?:/|$)).*)',
        headers: strictFrameHeaders,
      },
      {
        source: '/reservar',
        missing: [{ type: 'query', key: 'embed', value: '1' }],
        headers: strictFrameHeaders,
      },
      {
        source: '/reservar/:path*',
        missing: [{ type: 'query', key: 'embed', value: '1' }],
        headers: strictFrameHeaders,
      },
      {
        source: '/reservar',
        has: [{ type: 'query', key: 'embed', value: '1' }],
        headers: embedFrameHeaders,
      },
      {
        source: '/reservar/:path*',
        has: [{ type: 'query', key: 'embed', value: '1' }],
        headers: embedFrameHeaders,
      },
      {
        source: '/cita/:path*',
        headers: privateManageHeaders,
      },
      {
        source: '/admin',
        headers: privateManageHeaders,
      },
      {
        source: '/admin/:path*',
        headers: privateManageHeaders,
      },
      {
        source: '/mis-citas',
        headers: privateManageHeaders,
      },
      {
        source: '/api/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Vary', value: 'Cookie' },
        ],
      },
      {
        source: '/api/media/gallery/:path*',
        headers: publicGalleryMediaHeaders,
      },
      {
        source: '/landing/:path*',
        headers: immutableAssetHeaders,
      },
      {
        source: '/brand/:path*',
        headers: immutableAssetHeaders,
      },
      {
        source: '/sw.js',
        headers: serviceWorkerHeaders,
      },
    ];
  },
};

export default nextConfig;
