import { NextResponse } from 'next/server';
import { updateSystemSetting } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'settings',
    action: '更新系统设置',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'settings:view')) {
        return NextResponse.json({ message: '当前账号无权限修改系统设置' }, { status: 403 });
      }

      const { id } = await context.params;
      try {
        const payload = await request.json();
        await updateSystemSetting(id, payload);
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '保存系统设置失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
