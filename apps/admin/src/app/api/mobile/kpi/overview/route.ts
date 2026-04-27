import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getMobileKpiOverview } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }
  try {
    const kpi = await getMobileKpiOverview(user);
    return NextResponse.json(kpi);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询 KPI 失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
