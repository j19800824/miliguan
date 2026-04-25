import { NextResponse } from 'next/server';
import { createOrderQuotaAdjustment, listOrderQuotaAdjustments } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { inferFieldErrors } from '@/lib/form-errors';

export async function GET(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'order-quota-adjustments',
    action: '查询订货额度调整',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'order-quota:view')) {
        return NextResponse.json({ message: '当前账号无权限查看订货额度调整' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const companyId = searchParams.get('companyId') ?? undefined;
      return NextResponse.json({ rows: await listOrderQuotaAdjustments({ companyId, user }) });
    }
  });
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'order-quota-adjustments',
    action: '发起订货额度调整',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'order-quota:edit')) {
        return NextResponse.json({ message: '当前账号无权限发起订货额度调整' }, { status: 403 });
      }

      try {
        const payload = await request.json();
        const id = await createOrderQuotaAdjustment({
          ...payload,
          created_by: user.name ?? user.account ?? '后台用户'
        }, user);
        return NextResponse.json({ id: String(id), message: '订货额度调整申请已提交' }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : '订货额度调整申请失败';
        return NextResponse.json({ message, fieldErrors: inferFieldErrors(message) }, { status: 400 });
      }
    }
  });
}
