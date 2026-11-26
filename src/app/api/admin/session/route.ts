import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  findActiveSupabaseAdminByAuthUserId,
  getAdminCookieOptions,
  getAdminSession,
  isLocalDemoAuthEnabled,
} from '@/lib/auth/admin-session';
import { DemoLoginSchema, SupabaseLoginSchema } from '@/lib/contracts';
import { getRepository } from '@/lib/repositories/db';
import {
  createSupabaseServerClient,
  isSupabaseEnabled,
  type RecordedSupabaseCookie,
} from '@/lib/repositories/supabase-client';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

function applyRecordedSupabaseCookies(
  response: NextResponse,
  recordedCookies: RecordedSupabaseCookie[],
  recordedHeaders: Record<string, string>,
): void {
  for (const cookie of recordedCookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  for (const [key, value] of Object.entries(recordedHeaders)) {
    response.headers.set(key, value);
  }
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  const supabaseActive = isSupabaseEnabled();
  const demoEnabled = !supabaseActive && isLocalDemoAuthEnabled();
  const authMode: 'supabase' | 'demo' | 'disabled' = supabaseActive
    ? 'supabase'
    : demoEnabled
      ? 'demo'
      : 'disabled';
  const availableDemoUsers = demoEnabled
    ? (await getRepository().getSnapshot()).adminUsers.filter((u) => u.isActive)
    : [];

  return NextResponse.json({
    session,
    availableDemoUsers,
    authMode,
  });
}

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'admin:session-login',
    key: getRequestIp(request),
    limit: 25,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiados intentos de inicio de sesión. Espera unos segundos e intenta de nuevo.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud inválida.' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }

  if (isSupabaseEnabled()) {
    const parsed = SupabaseLoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Correo y contraseña válidos son requeridos.' },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }

    const recordedCookies: RecordedSupabaseCookie[] = [];
    const recordedHeaders: Record<string, string> = {};

    try {
      const supabase = await createSupabaseServerClient({
        request,
        onSetCookies(cookiesToSet, headers) {
          recordedCookies.push(...cookiesToSet);
          Object.assign(recordedHeaders, headers);
        },
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
      });

      if (error || !data.user) {
        return NextResponse.json(
          { error: 'Credenciales inválidas.' },
          { status: 401, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
        );
      }

      const adminUser = await findActiveSupabaseAdminByAuthUserId(data.user.id);
      if (!adminUser) {
        try {
          await supabase.auth.signOut();
        } catch {
          return NextResponse.json(
            { error: 'Usuario sin permisos de administrador activo.' },
            { status: 401, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
          );
        }
        return NextResponse.json(
          { error: 'Usuario sin permisos de administrador activo.' },
          { status: 401, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
        );
      }

      const response = NextResponse.json(
        { session: { user: adminUser, isDemo: false } },
        { headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
      applyRecordedSupabaseCookies(response, recordedCookies, recordedHeaders);
      response.cookies.set(ADMIN_SESSION_COOKIE, '', {
        ...getAdminCookieOptions(),
        maxAge: 0,
      });
      return response;
    } catch {
      return NextResponse.json(
        { error: 'No se pudo autenticar con Supabase.' },
        { status: 401, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
  }

  if (!isLocalDemoAuthEnabled()) {
    return NextResponse.json(
      { error: 'El inicio de sesión demo sin contraseña está deshabilitado en este entorno.' },
      { status: 503, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }

  const parsed = DemoLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Correo electrónico inválido.' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const db = await getRepository().getSnapshot();
  const user = db.adminUsers.find(
    (u) => u.email.toLowerCase() === email && u.isActive,
  );
  if (!user) {
    return NextResponse.json(
      { error: 'Correo no registrado como administrador activo.' },
      { status: 401, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }

  const token = createAdminSessionToken(user);
  if (!token) {
    return NextResponse.json(
      { error: 'Secreto de sesión no configurado.' },
      { status: 503, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }

  const response = NextResponse.json(
    { session: { user, isDemo: true } },
    { headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
  );
  response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions());
  return response;
}

export async function DELETE(request?: NextRequest) {
  const response = NextResponse.json({ ok: true });

  if (isSupabaseEnabled()) {
    const recordedCookies: RecordedSupabaseCookie[] = [];
    const recordedHeaders: Record<string, string> = {};
    try {
      const supabase = await createSupabaseServerClient({
        request,
        onSetCookies(cookiesToSet, headers) {
          recordedCookies.push(...cookiesToSet);
          Object.assign(recordedHeaders, headers);
        },
      });
      await supabase.auth.signOut();
      applyRecordedSupabaseCookies(response, recordedCookies, recordedHeaders);
    } catch {
      response.cookies.set(ADMIN_SESSION_COOKIE, '', {
        ...getAdminCookieOptions(),
        maxAge: 0,
      });
      return response;
    }
  }

  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    ...getAdminCookieOptions(),
    maxAge: 0,
  });
  return response;
}
