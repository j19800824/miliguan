import { NextResponse } from 'next/server';
import { listInventoryAdjustments } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function GET(request: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'inventory:view')) {
    return NextResponse.json({ message: '当前账号无权限查看库存调整' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'all';
  return NextResponse.json({ rows: await listInventoryAdjustments({ status }) });
}
