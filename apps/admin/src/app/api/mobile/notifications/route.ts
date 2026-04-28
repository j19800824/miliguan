import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listAdminNotifications } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') ?? 'all';
    const result = await listAdminNotifications(user, {
      status,
      page: 1,
      pageSize: 50,
    });
    return NextResponse.json(result.rows ?? result);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
