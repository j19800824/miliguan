import { NextResponse } from 'next/server';
import { handlePurchaseOrderReceive } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'purchase-orders',
    action: '确认订货单入库',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }

      if (!hasPermission(user, 'purchase-orders:edit')) {
        return NextResponse.json({ message: '当前账号无权限确认订货单入库' }, { status: 403 });
      }

      const { id } = await context.params;

      try {
        const payload = (await request.json().catch(() => ({}))) as { note?: string };
        await handlePurchaseOrderReceive(id, payload, user.name ?? user.account ?? '后台用户', user);
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '确认订货单入库失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
