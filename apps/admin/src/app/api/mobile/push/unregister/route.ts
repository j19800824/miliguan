import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { unregisterMobilePushToken } from '@/lib/database.js';

interface UnregisterBody {
  token?: string;
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as UnregisterBody;
    const token = (body.token ?? '').trim();
    if (token) {
      await unregisterMobilePushToken(token);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
