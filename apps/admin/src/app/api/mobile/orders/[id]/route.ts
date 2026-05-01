import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getMobileOrderDetail } from '@/lib/database.js';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const detail = await getMobileOrderDetail(id, user);
    if (!detail) {
      return NextResponse.json({ message: '订单不存在' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 400 },
    );
  }
}
