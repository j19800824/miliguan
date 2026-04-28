import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getInventoryWarnings } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const list = await getInventoryWarnings(user.companyId);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
