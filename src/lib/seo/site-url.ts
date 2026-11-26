const FALLBACK_SITE_ORIGIN = 'https://laikonanails.com';
const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

function parsePublicOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (LOOPBACK_HOSTS.has(hostname) || hostname.endsWith('.localhost')) {
      return null;
    }
    return parsed.origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getSiteOrigin(
  raw?: Readonly<Record<string, string | undefined>>,
): string {
  const nextPublicAppUrl =
    raw !== undefined
      ? raw.NEXT_PUBLIC_APP_URL
      : typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_APP_URL
        : undefined;
  const siteUrl =
    raw !== undefined
      ? raw.SITE_URL
      : typeof process !== 'undefined'
        ? process.env.SITE_URL
        : undefined;

  return (
    parsePublicOrigin(nextPublicAppUrl) ??
    parsePublicOrigin(siteUrl) ??
    FALLBACK_SITE_ORIGIN
  );
}

export function getSiteMetadataBase(
  raw?: Readonly<Record<string, string | undefined>>,
): URL {
  return new URL(getSiteOrigin(raw));
}
