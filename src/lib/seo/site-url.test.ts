import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSiteMetadataBase, getSiteOrigin } from './site-url';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getSiteOrigin', () => {
  it('falls back to https://laikonanails.com when no env vars are set', () => {
    expect(getSiteOrigin({})).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: '   ', SITE_URL: '' }),
    ).toBe('https://laikonanails.com');
  });

  it('normalizes NEXT_PUBLIC_APP_URL and strips trailing slash, path, and query', () => {
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'https://laikonanails.mx/' }),
    ).toBe('https://laikonanails.mx');
    expect(
      getSiteOrigin({
        NEXT_PUBLIC_APP_URL: 'https://LaikonaNails.MX/reservar?utm=ig#top',
      }),
    ).toBe('https://laikonanails.mx');
  });

  it('prefers NEXT_PUBLIC_APP_URL over SITE_URL when both are valid', () => {
    expect(
      getSiteOrigin({
        NEXT_PUBLIC_APP_URL: 'https://app.laikonanails.com/',
        SITE_URL: 'https://site.laikonanails.com/',
      }),
    ).toBe('https://app.laikonanails.com');
  });

  it('falls back to SITE_URL when NEXT_PUBLIC_APP_URL is missing or invalid', () => {
    expect(
      getSiteOrigin({
        SITE_URL: 'https://laikonanails.mx///',
      }),
    ).toBe('https://laikonanails.mx');
    expect(
      getSiteOrigin({
        NEXT_PUBLIC_APP_URL: 'not-a-url',
        SITE_URL: 'http://staging.laikonanails.com:8080/path',
      }),
    ).toBe('http://staging.laikonanails.com:8080');
  });

  it('never emits localhost or loopback origins in canonical/sitemap/robots', () => {
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:1718/' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'http://[::1]:3000' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'http://0.0.0.0:3000' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'http://nails.localhost:3000' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
        SITE_URL: 'https://laikonanails.mx/',
      }),
    ).toBe('https://laikonanails.mx');
  });

  it('rejects non-http(s) schemes', () => {
    expect(
      getSiteOrigin({ NEXT_PUBLIC_APP_URL: 'javascript:alert(1)' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ SITE_URL: 'ftp://laikonanails.com' }),
    ).toBe('https://laikonanails.com');
    expect(
      getSiteOrigin({ SITE_URL: 'file:///etc/passwd' }),
    ).toBe('https://laikonanails.com');
  });

  it('reads process.env when called without arguments', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://puebla.laikonanails.com/');
    expect(getSiteOrigin()).toBe('https://puebla.laikonanails.com');

    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('SITE_URL', 'https://laikonanails.mx/');
    expect(getSiteOrigin()).toBe('https://laikonanails.mx');

    vi.stubEnv('SITE_URL', '');
    expect(getSiteOrigin()).toBe('https://laikonanails.com');
  });
});

describe('getSiteMetadataBase', () => {
  it('returns a URL instance built from the resolved site origin', () => {
    const base = getSiteMetadataBase({
      NEXT_PUBLIC_APP_URL: 'https://laikonanails.mx/',
    });
    expect(base).toBeInstanceOf(URL);
    expect(base.origin).toBe('https://laikonanails.mx');

    const fallbackBase = getSiteMetadataBase({});
    expect(fallbackBase).toBeInstanceOf(URL);
    expect(fallbackBase.origin).toBe('https://laikonanails.com');
  });
});
