import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_SESSION_COOKIE = 'nails_admin_session';
const SIGNED_TOKEN_SHAPE_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SUPABASE_AUTH_COOKIE_RE = /^sb-[a-z0-9-]+-auth-token(?:\.\d+)?$/i;

function hasSignedDemoAdminCookie(request: NextRequest): boolean {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value?.trim();
  return Boolean(token && SIGNED_TOKEN_SHAPE_RE.test(token));
}

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        SUPABASE_AUTH_COOKIE_RE.test(cookie.name) &&
        cookie.value.trim().length > 0,
    );
}

function isSupabaseRuntimeConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }

  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }

  const supabaseEnabled = isSupabaseRuntimeConfigured();
  const isAuthenticated = supabaseEnabled
    ? hasSupabaseAuthCookie(request)
    : hasSignedDemoAdminCookie(request);

  if (!isAuthenticated) {
    const redirectResponse = NextResponse.redirect(
      new URL('/admin/login', request.url),
    );
    redirectResponse.headers.set('Cache-Control', 'private, no-store');
    redirectResponse.headers.set('Vary', 'Cookie');
    return redirectResponse;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
