import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getStoreSummary } from '@/lib/database.js';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const summary = await getStoreSummary(id);
    if (!summary) {
      return NextResponse.json({ message: '门店不存在' }, { status: 404 });
    }
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
