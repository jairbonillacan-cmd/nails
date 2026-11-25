import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { DEMO_ADMIN_COOKIE, getAdminSession } from '@/lib/auth/admin-session';
import { getSnapshot } from '@/lib/repositories/db';

export async function GET() {
  const session = await getAdminSession();
  const db = getSnapshot();
  return NextResponse.json({
    session,
    availableDemoUsers: !process.env.NEXT_PUBLIC_SUPABASE_URL
      ? db.adminUsers.filter((u) => u.isActive)
      : [],
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();
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

  const cookieStore = await cookies();
  cookieStore.set(DEMO_ADMIN_COOKIE, user.email, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  cookieStore.delete('nails_demo_logged_out');

  return NextResponse.json({ session: { user, isDemo: true } });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_ADMIN_COOKIE);
  cookieStore.set('nails_demo_logged_out', '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return NextResponse.json({ ok: true });
}
