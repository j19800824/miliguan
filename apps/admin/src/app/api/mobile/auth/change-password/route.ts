import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { changeMobilePassword } from '@/lib/database.js';

interface ChangeBody {
  current?: string;
  next?: string;
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const body = (await req.json()) as ChangeBody;
    await changeMobilePassword(user.id, body.current ?? '', body.next ?? '');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '修改失败' },
      { status: 400 },
    );
  }
}
