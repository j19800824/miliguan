import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { markAdminNotificationRead } from '@/lib/database.js';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'notifications',
    action: '标记通知已读',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'notifications:view')) {
        return NextResponse.json({ message: '当前账号无权限操作通知中心' }, { status: 403 });
      }

      try {
        const { id } = await context.params;
        const result = await markAdminNotificationRead(id, user);
        return NextResponse.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '通知已读失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
