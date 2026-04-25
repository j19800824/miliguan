import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { initializeDatabase, listProductSkus, submitProductSkuCreateRequest } from '@/lib/database.js';
import { auditRoute } from '@/lib/audit';
import { inferFieldErrors } from '@/lib/form-errors';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  initializeDatabase();
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'products',
    action: '查询SKU列表',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }

      if (!hasPermission(user, 'products:view')) {
        return NextResponse.json({ message: '当前账号无权限查看 SKU' }, { status: 403 });
      }

      const { searchParams } = new URL(request.url);
      const page = Number(searchParams.get('page') ?? '1');
      const pageSize = Number(searchParams.get('pageSize') ?? '10');
      const { id } = await context.params;
      const result = await listProductSkus(id, { page, pageSize });
      return NextResponse.json(result);
    }
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  initializeDatabase();
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'products',
    action: '新增SKU',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }

      if (!hasPermission(user, 'products:edit')) {
        return NextResponse.json({ message: '当前账号无权限新增 SKU' }, { status: 403 });
      }

      try {
        const payload = await request.json();
        const { id } = await context.params;
        const requestId = await submitProductSkuCreateRequest(id, payload, user.name ?? user.account ?? '后台用户');
        return NextResponse.json(
          { id: String(requestId), message: 'SKU 新增申请已提交，待审核通过后生效' },
          { status: 201 }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : '新增 SKU 失败';
        return NextResponse.json({ message, fieldErrors: inferFieldErrors(message) }, { status: 400 });
      }
    }
  });
}
