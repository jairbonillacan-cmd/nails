import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  getAdminCookieOptions,
  getAdminSession,
  isLocalDemoAuthEnabled,
} from '@/lib/auth/admin-session';
import { getSnapshot } from '@/lib/repositories/db';

const demoLoginSchema = z.object({
  email: z.string().trim().email(),
});

export async function GET(request: NextRequest) {
  const session = await getAdminSession(request);
  const demoEnabled = isLocalDemoAuthEnabled();
  const availableDemoUsers = demoEnabled
    ? getSnapshot().adminUsers.filter((u) => u.isActive)
    : [];

  return NextResponse.json({
    session,
    availableDemoUsers,
  });
}

export async function POST(request: NextRequest) {
  if (!isLocalDemoAuthEnabled()) {
    return NextResponse.json(
      { error: 'El inicio de sesión demo sin contraseña está deshabilitado en este entorno.' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  const parsed = demoLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Correo electrónico inválido.' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const db = getSnapshot();
  const user = db.adminUsers.find(
    (u) => u.email.toLowerCase() === email && u.isActive,
  );
  if (!user) {
    return NextResponse.json(
      { error: 'Correo no registrado como administrador activo.' },
      { status: 401 },
    );
  }

  const token = createAdminSessionToken(user);
  if (!token) {
    return NextResponse.json(
      { error: 'Secreto de sesión no configurado.' },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ session: { user, isDemo: true } });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, '', {
    ...getAdminCookieOptions(),
    maxAge: 0,
  });
  return response;
}
