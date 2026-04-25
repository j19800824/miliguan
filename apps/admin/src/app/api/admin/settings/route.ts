import { NextResponse } from 'next/server';
import { listSystemSettings } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function GET(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'settings',
    action: '查询系统设置',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'settings:view')) {
        return NextResponse.json({ message: '当前账号无权限查看系统设置' }, { status: 403 });
      }

      return NextResponse.json({ rows: await listSystemSettings() });
    }
  });
}
