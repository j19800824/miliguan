import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { markAllAdminNotificationsRead } from '@/lib/database.js';

export async function PUT(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'notifications',
    action: '全部通知已读',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'notifications:view')) {
        return NextResponse.json({ message: '当前账号无权限操作通知中心' }, { status: 403 });
      }

      const result = await markAllAdminNotificationsRead(user);
      return NextResponse.json(result);
    }
  });
}
