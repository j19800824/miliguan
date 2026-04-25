import { NextResponse } from 'next/server';
import { createInventoryAdjustment, listInventoryAdjustments } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { inferFieldErrors } from '@/lib/form-errors';

export async function GET(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'inventory-adjustments',
    action: '查询库存调整',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'inventory:view')) {
        return NextResponse.json({ message: '当前账号无权限查看库存调整' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const status = searchParams.get('status') ?? 'all';
      return NextResponse.json({ rows: await listInventoryAdjustments({ status, user }) });
    }
  });
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'inventory-adjustments',
    action: '发起库存调整',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'inventory:edit')) {
        return NextResponse.json({ message: '当前账号无权限发起库存调整' }, { status: 403 });
      }

      try {
        const payload = await request.json();
        const id = await createInventoryAdjustment({
          ...payload,
          created_by: user.name ?? user.account ?? '后台用户'
        }, user);
        return NextResponse.json({ id: String(id), message: '库存调整申请已提交' }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : '库存调整申请失败';
        return NextResponse.json({ message, fieldErrors: inferFieldErrors(message) }, { status: 400 });
      }
    }
  });
}
