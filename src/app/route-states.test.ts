import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, 'src', 'app');

function readText(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function collectFilesByName(dir: string, targetName: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFilesByName(full, targetName));
    } else if (entry.isFile() && entry.name === targetName) {
      results.push(full);
    }
  }
  return results;
}

describe('route loading, error, 404, theme, and performance invariants', () => {
  it('provides dedicated loading.tsx coverage for every public and admin route segment', () => {
    const expectedLoaders = [
      'src/app/loading.tsx',
      'src/app/reservar/loading.tsx',
      'src/app/cita/[token]/loading.tsx',
      'src/app/mis-citas/loading.tsx',
      'src/app/links/loading.tsx',
      'src/app/aviso-de-privacidad/loading.tsx',
      'src/app/admin/loading.tsx',
      'src/app/admin/login/loading.tsx',
      'src/app/admin/citas/loading.tsx',
      'src/app/admin/whatsapp/loading.tsx',
      'src/app/admin/clientas/loading.tsx',
      'src/app/admin/caja/loading.tsx',
      'src/app/admin/servicios/loading.tsx',
      'src/app/admin/disponibilidad/loading.tsx',
      'src/app/admin/equipo/loading.tsx',
      'src/app/admin/marca/loading.tsx',
      'src/app/admin/reportes/loading.tsx',
      'src/app/admin/inventario/loading.tsx',
      'src/app/admin/integraciones/loading.tsx',
      'src/app/admin/onboarding/loading.tsx',
    ];

    for (const rel of expectedLoaders) {
      expect(fs.existsSync(path.join(ROOT, rel)), `Missing loader: ${rel}`).toBe(true);
    }

    const adminPages = collectFilesByName(path.join(APP_DIR, 'admin'), 'page.tsx');
    for (const pageFile of adminPages) {
      const siblingLoader = path.join(path.dirname(pageFile), 'loading.tsx');
      expect(
        fs.existsSync(siblingLoader),
        `Admin page missing sibling loading.tsx: ${path.relative(ROOT, pageFile)}`,
      ).toBe(true);
    }
  });

  it('imports the required route-scoped stylesheet in every public loading.tsx', () => {
    const homeLoader = readText('src/app/loading.tsx');
    expect(homeLoader).toContain('<BrandLoader');
    const brandLoader = readText('src/components/brand/BrandLoader.tsx');
    expect(brandLoader).toContain('role="status"');
    expect(brandLoader).toContain('aria-busy="true"');
    expect(brandLoader).toContain('logoFullWhite');
    expect(brandLoader).toContain('<MorphLoader');

    const publicLoaderCss: Record<string, string> = {
      'src/app/reservar/loading.tsx': '../booking.css',
      'src/app/cita/[token]/loading.tsx': '../../cita.css',
      'src/app/mis-citas/loading.tsx': '../portal.css',
      'src/app/links/loading.tsx': '../cita.css',
      'src/app/aviso-de-privacidad/loading.tsx': '../cita.css',
    };

    for (const [loaderRel, cssImport] of Object.entries(publicLoaderCss)) {
      const source = readText(loaderRel);
      expect(source, `${loaderRel} must import ${cssImport}`).toContain(`'${cssImport}'`);
      expect(source, `${loaderRel} must render the shared brand loader`).toContain('<BrandLoader');
      expect(source, `${loaderRel} must not use slop sk-loading-pill`).not.toContain('sk-loading-pill');
    }
  });

  it('keeps public heroes, loaders, and admin panels free of translucent slop status pills and glowing dots', () => {
    const privacySource = readText('src/app/aviso-de-privacidad/page.tsx');
    const citaHeroSource = readText('src/components/cita/CitaHero.tsx');
    const citaCss = readText('src/app/cita.css');
    const bookingCss = readText('src/app/booking.css');
    const globalsCss = readText('src/app/globals.css');
    const adminCss = readText('src/app/admin/admin.css');
    const shareCardSource = readText('src/components/admin/dashboard/DashboardShareCard.tsx');
    const brandPreviewSource = readText('src/components/admin/marca/BrandGallerySection.tsx');
    const otpGateSource = readText('src/components/portal/PortalOtpGate.tsx');

    expect(privacySource).toContain('ck-eyebrow');
    expect(privacySource).not.toContain('ck-status-pill');
    expect(citaHeroSource).toContain('ck-eyebrow');
    expect(citaHeroSource).not.toContain('ck-status-pill');
    expect(citaCss).not.toContain('.ck-status-pill');
    expect(bookingCss).not.toContain('.rb-live::before');
    expect(globalsCss).not.toContain('.sk-loading-pill');
    expect(globalsCss).toContain('.sk-eyebrow');
    expect(adminCss).not.toContain('.ad-live-dot');
    expect(shareCardSource).not.toContain('ad-live-dot');
    expect(brandPreviewSource).not.toContain('isPulsing');
    expect(otpGateSource).not.toContain('showDot');
  });

  it('renders public error and 404 boundaries on the brand light stage with at most two actions', () => {
    const publicBoundaries = [
      'src/app/not-found.tsx',
      'src/app/error.tsx',
      'src/app/cita/[token]/not-found.tsx',
    ];
    for (const rel of publicBoundaries) {
      const source = readText(rel);
      expect(source, `${rel} must render BrandStage`).toContain('<BrandStage');
      expect(source.match(/<Button/g)?.length ?? 0, `${rel} must keep two actions`).toBeLessThanOrEqual(2);
    }

    const globalError = readText('src/app/global-error.tsx');
    expect(globalError).toContain('lk-boundary-hero');
    expect(globalError).toContain('logoWhite');

    const adminError = readText('src/app/admin/error.tsx');
    expect(adminError).toContain('ad-boundary-hero');
    expect(adminError).toContain('ad-boundary-body');
    expect(adminError).toContain('ad-boundary-code');
    expect(adminError).not.toContain('lk-boundary-code');
  });

  it('uses shared AdminShellSkeleton in both AdminLayout Suspense fallback and AdminShell loading state', () => {
    const layoutSource = readText('src/app/admin/layout.tsx');
    const shellSource = readText('src/components/admin/AdminShell.tsx');
    expect(layoutSource).toContain('AdminShellSkeleton');
    expect(layoutSource).not.toContain('fallback={null}');
    expect(shellSource).toContain('AdminShellSkeleton');
  });

  it('locks all non-admin routes (including /mis-citas and 404) to light mode in SalonThemeProvider', () => {
    const providerSource = readText('src/components/SalonThemeProvider.tsx');
    expect(providerSource).toContain("safePathname === '/admin' || safePathname.startsWith('/admin/')");
    expect(providerSource).toContain("isAdminRoute ? mode : 'light'");
    expect(providerSource).toContain("themes['nails-admin']");
  });

  it('preserves production password auth UI and deep wine-cherry dark panel on /admin/login', () => {
    const loginSource = readText('src/app/admin/login/page.tsx');
    const adminCss = readText('src/app/admin/admin.css');
    expect(loginSource).toContain("authMode === 'supabase'");
    expect(loginSource).toContain('autoComplete="current-password"');
    expect(loginSource).toContain('Mostrar contraseña');
    expect(loginSource).toContain('ad-login-mobile-bar');
    expect(adminCss).toMatch(/\.ad-login-brand\s*\{[^}]*background:\s*var\(--ad-cherry\)/);
  });

  it('keeps the public cherry header integrated with its hero and never sticky or fixed', () => {
    const globalsCss = readText('src/app/globals.css');
    const headerRule = globalsCss.match(/\n\.rb-header\s*\{[^}]*\}/)?.[0] ?? '';
    expect(headerRule).toContain('background: var(--lk-cereza)');
    for (const cssFile of ['src/app/globals.css', 'src/app/booking.css', 'src/app/cita.css', 'src/app/portal.css']) {
      const css = readText(cssFile);
      for (const rule of css.match(/[^{}]*\.rb-header[^{]*\{[^}]*\}/g) ?? []) {
        expect(rule, `${cssFile} must not pin .rb-header`).not.toMatch(/position:\s*(sticky|fixed)/);
      }
    }

    const publicLoaders = [
      'src/app/reservar/loading.tsx',
      'src/app/cita/[token]/loading.tsx',
      'src/app/mis-citas/loading.tsx',
      'src/app/links/loading.tsx',
      'src/app/aviso-de-privacidad/loading.tsx',
    ];
    for (const rel of publicLoaders) {
      const source = readText(rel);
      expect(source, `${rel} must not render the black logo on cherry`).not.toContain('logoBlack');
    }

    const shellSource = readText('src/components/PublicShell.tsx');
    expect(shellSource.indexOf('<BookingHeader')).toBeLessThan(shellSource.indexOf('{hero}'));
    expect(shellSource.indexOf('{hero}')).toBeLessThan(shellSource.indexOf('as="main"'));
  });

  it('maintains LCP preloads, dynamic below-the-fold splits, content-visibility, and sticky-header anchor clearance', () => {
    const homeSource = readText('src/app/page.tsx');
    const landingView = readText('src/components/LandingView.tsx');
    const landingCss = readText('src/app/landing.css');
    const citaCss = readText('src/app/cita.css');
    const serviceStep = readText('src/components/booking/ServiceStep.tsx');

    expect(homeSource).toContain('preload(resolvedLanding.heroImageDesktopUrl');
    expect(homeSource).toContain('preload(resolvedLanding.heroImageMobileUrl');
    expect(landingView).toContain("import('./landing/LandingConnect')");
    expect(landingView).toContain("import('./landing/LandingFaq')");
    expect(landingCss).toContain('content-visibility: auto;');
    expect(citaCss).toContain('scroll-margin-top:');
    expect(serviceStep).toContain("loading={isAboveFold ? 'eager' : 'lazy'}");
  });

  it('prevents dev service-worker chunk staleness, sets smooth scroll behavior, enforces true 404 on invalid cita tokens, and fixes singular slot labels', () => {
    const swSource = readText('public/sw.js');
    const swHookSource = readText('src/lib/hooks/useServiceWorker.ts');
    const layoutSource = readText('src/app/layout.tsx');
    const citaPageSource = readText('src/app/cita/[token]/page.tsx');
    const scheduleStepSource = readText('src/components/booking/ScheduleStep.tsx');
    const visitSource = readText('src/components/landing/LandingVisit.tsx');

    expect(swSource).toContain('/_next/static/development/');
    expect(swSource).toContain('/_next/webpack-hmr');
    expect(swHookSource).toContain("process.env.NODE_ENV !== 'production'");
    expect(swHookSource).toContain('unregister');
    expect(layoutSource).toContain('data-scroll-behavior="smooth"');
    expect(citaPageSource).toContain('export async function generateMetadata');
    expect(scheduleStepSource).toContain("slot.availableStaffIds.length === 1 ? 'libre' : 'libres'");
    expect(visitSource).toContain('sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"');
  });

  it('keeps personal legal owner names out of /aviso-de-privacidad and prevents full-DB getSnapshot scans in booking hot paths', () => {
    const privacySource = readText('src/app/aviso-de-privacidad/page.tsx');
    const bookingApiRoute = readText('src/app/api/bookings/route.ts');
    const citaPageSource = readText('src/app/cita/[token]/page.tsx');

    expect(privacySource).not.toContain('depositBeneficiary');
    expect(privacySource).not.toContain('depositAccountHolder');
    expect(privacySource).not.toContain('Karla Patricia Carrillo');
    expect(privacySource).toContain('<strong>{settings.name}</strong>');

    expect(bookingApiRoute).not.toContain('getSnapshot(');
    expect(bookingApiRoute).not.toContain('getPublicBootstrap(');
    expect(citaPageSource).not.toContain('getSnapshot(');
    expect(citaPageSource).toContain('cache(');
  });
});
