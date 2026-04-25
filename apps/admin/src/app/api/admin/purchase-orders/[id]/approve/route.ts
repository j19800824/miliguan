import { NextResponse } from 'next/server';
import { approvePurchaseOrder } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

async function authorize() {
  const user = await getAdminSession();

  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (!hasPermission(user, 'purchase-orders:approve')) {
    return NextResponse.json({ message: '当前账号无权限审核订货单' }, { status: 403 });
  }

  return null;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'purchase-orders',
    action: '审核订货单',
    operator: user,
    handler: async () => {
      const authError = await authorize();
      if (authError) return authError;

      const { id } = await context.params;

      try {
        const payload = (await request.json()) as {
          result?: '通过' | '驳回';
          note?: string;
          final_status?: '待入库' | '已入库';
        };
        await approvePurchaseOrder(id, payload, user?.name ?? user?.account ?? '后台用户', user ?? {});
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '审核订货单失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
