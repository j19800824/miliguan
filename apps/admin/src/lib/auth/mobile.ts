import { verifyAdminJwt } from './jwt';
import { getAdminById, getSessionUserId, touchSession } from '@/lib/database.js';
import { getAdminDataScope, type AdminSessionUser } from './shared';

function readBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ', 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export async function getMobileSession(req: Request): Promise<AdminSessionUser | null> {
  const token = readBearerToken(req);
  if (!token) return null;
  try {
    const payload = await verifyAdminJwt(token);
    const userId = await getSessionUserId(payload.sessionId);
    if (!userId || userId !== payload.userId) return null;
    await touchSession(payload.sessionId);
    const user = await getAdminById(userId);
    return user ? { ...user, dataScope: getAdminDataScope(user) } : null;
  } catch {
    return null;
  }
}

export type MobileAuthResult =
  | { user: AdminSessionUser; error: null }
  | { user: null; error: { message: string; status: 401 } };

export async function requireMobileSession(req: Request): Promise<MobileAuthResult> {
  const user = await getMobileSession(req);
  if (!user) {
    return { user: null, error: { message: '未登录', status: 401 } };
  }
  return { user, error: null };
}
