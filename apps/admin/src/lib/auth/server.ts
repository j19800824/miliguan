import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAdminById, getSessionUserId, touchSession } from '@/lib/database.js';
import { ADMIN_SESSION_COOKIE, getAdminDataScope, type AdminSessionUser } from './shared';
import { verifyAdminJwt } from './jwt';

export async function getAdminSession(): Promise<AdminSessionUser | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!session) {
    return null;
  }

  try {
    const token = await verifyAdminJwt(session);
    const userId = await getSessionUserId(token.sessionId);
    if (!userId || userId !== token.userId) {
      return null;
    }

    await touchSession(token.sessionId);
    const user = await getAdminById(userId);
    return user ? { ...user, dataScope: getAdminDataScope(user) } : null;
  } catch {
    return null;
  }
}

export function hasPermission(user: AdminSessionUser | null, permission?: string) {
  if (!permission) return true;
  if (!user) return false;
  return user.permissions.includes(permission);
}

export async function requireAdminSession() {
  const user = await getAdminSession();

  if (!user) {
    redirect('/auth/sign-in');
  }

  return user;
}

export async function requirePermission(permission?: string) {
  const user = await requireAdminSession();

  if (!hasPermission(user, permission)) {
    const query = permission ? `?permission=${encodeURIComponent(permission)}` : '';
    redirect(`/dashboard/forbidden${query}`);
  }

  return user;
}
