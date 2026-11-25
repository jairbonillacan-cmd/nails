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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin/login' || pathname.startsWith('/admin/login/')) {
    return NextResponse.next();
  }

  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) {
    return NextResponse.next();
  }

  const supabaseEnabled = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const isAuthenticated = supabaseEnabled
    ? hasSupabaseAuthCookie(request)
    : hasSignedDemoAdminCookie(request);

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
