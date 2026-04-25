import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { listAdminNotifications } from '@/lib/database.js';

export async function GET(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'notifications',
    action: '查询通知',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'notifications:view')) {
        return NextResponse.json({ message: '当前账号无权限查看通知中心' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const result = await listAdminNotifications(user, {
        status: searchParams.get('status') ?? 'all',
        page: Number(searchParams.get('page') ?? '1'),
        pageSize: Number(searchParams.get('pageSize') ?? '50')
      });
      return NextResponse.json(result);
    }
  });
}
