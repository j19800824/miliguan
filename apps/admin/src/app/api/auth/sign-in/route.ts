import { NextResponse } from 'next/server';
import { createSession, getAdminByPhone, verifyLoginOtp } from '@/lib/database.js';
import { signAdminJwt } from '@/lib/auth/jwt';
import { ADMIN_IDLE_MAX_AGE, ADMIN_SESSION_COOKIE } from '@/lib/auth/shared';
import { auditRoute } from '@/lib/audit';

export async function POST(req: Request) {
  return auditRoute(req, {
    module: 'auth',
    action: '后台登录',
    handler: async () => {
      try {
        const body = (await req.json()) as { phone?: string; code?: string };
        const phone = (body.phone ?? '').trim();

        // 先确认手机号已绑定后台账号，避免给未注册号码暴露验证码校验细节。
        const user = await getAdminByPhone(phone);
        if (!user) {
          return NextResponse.json({ message: '该手机号未绑定后台账号' }, { status: 401 });
        }

        try {
          await verifyLoginOtp(phone, body.code ?? '');
        } catch (verifyError) {
          const message = verifyError instanceof Error ? verifyError.message : '验证码校验失败';
          return NextResponse.json({ message }, { status: 401 });
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
          secure:
            process.env.NODE_ENV === 'production' &&
            process.env.COOKIE_INSECURE !== 'true',
          maxAge: ADMIN_IDLE_MAX_AGE
        });

        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : '登录失败，请检查数据库和 Redis 连接';
        return NextResponse.json({ message }, { status: 500 });
      }
    }
  });
}
