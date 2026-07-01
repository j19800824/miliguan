import { NextResponse } from 'next/server';
import { createSession, getMobileAdminByPhone, markStaffLastLogin, verifyLoginOtp } from '@/lib/database.js';
import { signAdminJwt } from '@/lib/auth/jwt';
import { auditRoute } from '@/lib/audit';

export async function POST(req: Request) {
  return auditRoute(req, {
    module: 'mobile-auth',
    action: '移动端登录',
    handler: async () => {
      try {
        const body = (await req.json()) as { phone?: string; code?: string };
        const phone = (body.phone ?? '').trim();

        const user = await getMobileAdminByPhone(phone);
        if (!user) {
          return NextResponse.json({ message: '该手机号未绑定账号' }, { status: 401 });
        }

        try {
          await verifyLoginOtp(phone, body.code ?? '');
        } catch (verifyError) {
          const message = verifyError instanceof Error ? verifyError.message : '验证码校验失败';
          return NextResponse.json({ message }, { status: 401 });
        }

        const sessionId = await createSession(user.id);
        await markStaffLastLogin(user.id);
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
