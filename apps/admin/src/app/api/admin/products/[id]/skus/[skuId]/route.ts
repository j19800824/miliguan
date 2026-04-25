import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import {
  initializeDatabase,
  submitProductSkuDeleteRequest
} from '@/lib/database.js';
import { auditRoute } from '@/lib/audit';

async function authorize() {
  const user = await getAdminSession();

  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (!hasPermission(user, 'products:edit')) {
    return NextResponse.json({ message: '当前账号无权限维护 SKU' }, { status: 403 });
  }

  return user;
}

export async function PUT(
  _request: Request,
  context: { params: Promise<{ id: string; skuId: string }> }
) {
  initializeDatabase();
  const authResult = await authorize();
  return auditRoute(_request, {
    module: 'products',
    action: '修改SKU',
    operator: authResult instanceof NextResponse ? null : authResult,
    handler: async () => {
      if (authResult instanceof NextResponse) return authResult;
      await context.params;
      return NextResponse.json({ message: 'SKU 创建后不允许修改基础信息' }, { status: 400 });
    }
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; skuId: string }> }
) {
  initializeDatabase();
  const authResult = await authorize();
  return auditRoute(_request, {
    module: 'products',
    action: '删除SKU',
    operator: authResult instanceof NextResponse ? null : authResult,
    handler: async () => {
      if (authResult instanceof NextResponse) return authResult;

      try {
        const { id, skuId } = await context.params;
        await submitProductSkuDeleteRequest(id, skuId, authResult.name ?? authResult.account ?? '后台用户');
        return NextResponse.json({ success: true, message: 'SKU 删除申请已提交，待审核通过后执行' });
      } catch (error) {
        const message = error instanceof Error ? error.message : '删除 SKU 失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
