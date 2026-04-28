import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getPointsHistoryForUser } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const list = await getPointsHistoryForUser(user, { limit });
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
