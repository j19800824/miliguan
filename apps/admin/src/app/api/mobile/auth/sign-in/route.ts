import { NextResponse } from 'next/server';
import { createSession, getMobileAdminByAccount } from '@/lib/database.js';
import { signAdminJwt } from '@/lib/auth/jwt';
import { auditRoute } from '@/lib/audit';

export async function POST(req: Request) {
  return auditRoute(req, {
    module: 'mobile-auth',
    action: '移动端登录',
    handler: async () => {
      try {
        const body = (await req.json()) as { account?: string; password?: string };
        const user = await getMobileAdminByAccount(body.account ?? '', body.password ?? '');

        if (!user) {
          return NextResponse.json({ message: '账号或密码不正确' }, { status: 401 });
        }

        const sessionId = await createSession(user.id);
        const token = await signAdminJwt({
          sub: user.id,
          sid: sessionId,
          roleName: user.roleName,
        });

        return NextResponse.json({ token, user });
      } catch (error) {
        const message = error instanceof Error ? error.message : '登录失败';
        return NextResponse.json({ message }, { status: 500 });
      }
    },
  });
}
