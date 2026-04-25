import { NextResponse } from 'next/server';
import { handlePurchaseOrderRefund } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'purchase-orders',
    action: '完成订货单退货',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }

      if (!hasPermission(user, 'purchase-orders:edit')) {
        return NextResponse.json({ message: '当前账号无权限执行订货单退货' }, { status: 403 });
      }

      const { id } = await context.params;

      try {
        const payload = (await request.json().catch(() => ({}))) as { note?: string };
        await handlePurchaseOrderRefund(id, payload, user.name ?? user.account ?? '后台用户', user);
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '订货单退货失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
