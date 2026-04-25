import { NextResponse } from 'next/server';
import { handleMemberOrder } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'member-orders',
    action: '处理散客订单',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }

      if (!hasPermission(user, 'member-orders:handle')) {
        return NextResponse.json({ message: '当前账号无权限处理散客订单异常' }, { status: 403 });
      }

      const { id } = await context.params;

      try {
        const payload = (await request.json()) as {
          action?: 'writeoff' | 'resolve' | 'refund';
          note?: string;
        };
        await handleMemberOrder(id, payload, user.name ?? user.account ?? '后台用户', user);
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '散客订单处理失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
