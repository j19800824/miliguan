import { NextResponse } from 'next/server';
import { createSession, getAdminByAccount } from '@/lib/database.js';
import { signAdminJwt } from '@/lib/auth/jwt';
import { ADMIN_IDLE_MAX_AGE, ADMIN_SESSION_COOKIE } from '@/lib/auth/shared';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { account?: string; password?: string };
    const user = await getAdminByAccount(body.account ?? '', body.password ?? '');

    if (!user) {
      return NextResponse.json({ message: '账号或密码不正确' }, { status: 401 });
    }

    const sessionId = await createSession(user.id);
    const token = await signAdminJwt({
      sub: user.id,
      sid: sessionId,
      roleName: user.roleName
    });
    const response = NextResponse.json({ user });
    response.cookies.set(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ADMIN_IDLE_MAX_AGE
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败，请检查数据库和 Redis 连接';
    return NextResponse.json({ message }, { status: 500 });
  }
}
