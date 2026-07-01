import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getMobileRanking } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const period = new URL(req.url).searchParams.get('period') || 'daily';
    return NextResponse.json(await getMobileRanking(user, period));
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询排行失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
