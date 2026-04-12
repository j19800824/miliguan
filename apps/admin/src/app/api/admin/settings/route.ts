import { NextResponse } from 'next/server';
import { listSystemSettings } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function GET() {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'settings:view')) {
    return NextResponse.json({ message: '当前账号无权限查看系统设置' }, { status: 403 });
  }

  return NextResponse.json({ rows: await listSystemSettings() });
}
