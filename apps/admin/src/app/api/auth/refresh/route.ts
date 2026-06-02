import { NextResponse } from 'next/server';
import { ADMIN_IDLE_MAX_AGE, ADMIN_SESSION_COOKIE } from '@/lib/auth/shared';
import { signAdminJwt, verifyAdminJwt } from '@/lib/auth/jwt';
import { deleteSession, getAdminById, getSessionUserId, touchSession } from '@/lib/database.js';

function readSessionCookie(cookieHeader: string) {
  return cookieHeader
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.split('=')[1];
}

export async function POST(req: Request) {
  const token = readSessionCookie(req.headers.get('cookie') ?? '');

  if (!token) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const payload = await verifyAdminJwt(token);
    const userId = await getSessionUserId(payload.sessionId);

    if (!userId || userId !== payload.userId) {
      return NextResponse.json({ message: '会话已失效' }, { status: 401 });
    }

    const user = await getAdminById(userId);
    if (!user) {
      await deleteSession(payload.sessionId);
      return NextResponse.json({ message: '账号已失效' }, { status: 401 });
    }

    await touchSession(payload.sessionId);
    const nextToken = await signAdminJwt({
      sub: user.id,
      sid: payload.sessionId,
      roleName: user.roleName
    });

    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_SESSION_COOKIE, nextToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure:
        process.env.NODE_ENV === 'production' &&
        process.env.COOKIE_INSECURE !== 'true',
      maxAge: ADMIN_IDLE_MAX_AGE
    });
    return response;
  } catch {
    return NextResponse.json({ message: '会话已过期' }, { status: 401 });
  }
}
