import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { registerMobilePushToken } from '@/lib/database.js';

interface RegisterBody {
  token?: string;
  platform?: string;
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as RegisterBody;
    const token = (body.token ?? '').trim();
    if (!token) {
      return NextResponse.json({ message: '缺少 token' }, { status: 400 });
    }
    await registerMobilePushToken(user.id, token, body.platform ?? 'unknown');
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '注册推送失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
