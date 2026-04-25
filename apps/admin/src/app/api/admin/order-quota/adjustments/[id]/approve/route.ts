import { NextResponse } from 'next/server';
import { approveOrderQuotaAdjustment } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'order-quota-adjustments',
    action: '审核订货额度调整',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'order-quota:approve')) {
        return NextResponse.json({ message: '当前账号无权限审核订货额度调整' }, { status: 403 });
      }

      const { id } = await context.params;
      try {
        const payload = (await request.json()) as { result?: '通过' | '驳回'; note?: string };
        await approveOrderQuotaAdjustment(id, payload, user.name ?? user.account ?? '后台用户', user);
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '订货额度审核失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
