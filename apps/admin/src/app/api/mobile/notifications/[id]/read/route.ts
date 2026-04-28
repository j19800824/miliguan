import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { markAdminNotificationRead } from '@/lib/database.js';

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await markAdminNotificationRead(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '操作失败' },
      { status: 400 },
    );
  }
}
