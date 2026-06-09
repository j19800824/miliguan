import { NextResponse } from 'next/server';
import { requestLoginOtp } from '@/lib/database.js';
import { auditRoute } from '@/lib/audit';

export async function POST(req: Request) {
  return auditRoute(req, {
    module: 'auth',
    action: '后台发送登录验证码',
    handler: async () => {
      try {
        const body = (await req.json()) as { phone?: string };
        const result = await requestLoginOtp(body.phone ?? '');
        return NextResponse.json({
          ok: true,
          resendAfter: result.resendAfter,
          message: result.message
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '验证码发送失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
