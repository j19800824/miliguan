import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { updateAdminAvatar } from '@/lib/database.js';

interface AvatarBody {
  avatarUrl?: string;
}

export async function PUT(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as AvatarBody;
    await updateAdminAvatar(user.id, body.avatarUrl ?? '');
    return NextResponse.json({ ok: true, avatarUrl: body.avatarUrl ?? '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新头像失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
