import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getStoreTodayStats } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.storeId) {
    return NextResponse.json({
      storeVerifyCount: 0,
      myVerifyCount: 0,
      todayPoints: 0,
    });
  }
  try {
    const stats = await getStoreTodayStats(
      user.storeId,
      user.fullName ?? user.account ?? '',
    );
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
