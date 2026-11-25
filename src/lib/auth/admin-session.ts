import { cookies } from 'next/headers';
import { getSnapshot } from '../repositories/db';
import type { AdminRole, AdminUser } from '../types';

export const DEMO_ADMIN_COOKIE = 'nails_admin_email';

export interface AdminSession {
  user: AdminUser;
  isDemo: boolean;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const db = getSnapshot();
  const cookieStore = await cookies();
  const savedEmail = cookieStore.get(DEMO_ADMIN_COOKIE)?.value;

  if (savedEmail) {
    const matched = db.adminUsers.find(
      (u) => u.email.toLowerCase() === savedEmail.toLowerCase() && u.isActive,
    );
    if (matched) {
      return { user: matched, isDemo: true };
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const loggedOut = cookieStore.get('nails_demo_logged_out')?.value === '1';
    if (loggedOut) return null;
    const owner = db.adminUsers.find((u) => u.role === 'owner' && u.isActive) ?? db.adminUsers[0];
    return owner ? { user: owner, isDemo: true } : null;
  }

  return null;
}

export async function requireAdmin(
  allowedRoles?: AdminRole[],
): Promise<AdminSession | null> {
  const session = await getAdminSession();
  if (!session) return null;
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    return null;
  }
  return session;
}
