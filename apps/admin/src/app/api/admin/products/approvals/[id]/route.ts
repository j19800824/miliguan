import { NextResponse } from 'next/server';
import { approveProductChangeRequest, initializeDatabase } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  initializeDatabase();
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'products',
    action: '审核商品变更',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }

      if (!hasPermission(user, 'products:approve')) {
        return NextResponse.json({ message: '当前账号无权限审核商品变更' }, { status: 403 });
      }

      try {
        const payload = await request.json();
        const { id } = await context.params;
        await approveProductChangeRequest(id, payload, user.name ?? user.account ?? '后台用户');
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '商品审核失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
