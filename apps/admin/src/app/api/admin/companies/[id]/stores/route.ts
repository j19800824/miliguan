import { NextResponse } from 'next/server';
import { createCompanyStore, listCompanyStoresByCompany } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';
import { inferFieldErrors } from '@/lib/form-errors';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'company-stores',
    action: '查询门店',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'company-stores:view')) {
        return NextResponse.json({ message: '当前账号无权限查看门店' }, { status: 403 });
      }

      const { id } = await context.params;
      return NextResponse.json({ rows: await listCompanyStoresByCompany(id, { user }) });
    }
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'company-stores',
    action: '新增门店',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'company-stores:edit')) {
        return NextResponse.json({ message: '当前账号无权限新增门店' }, { status: 403 });
      }

      const { id } = await context.params;
      try {
        const payload = await request.json();
        const storeId = await createCompanyStore(id, payload, user.name ?? user.account ?? '后台用户', user);
        return NextResponse.json({ id: String(storeId) }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : '新增门店失败';
        return NextResponse.json({
          message,
          fieldErrors: {
            ...inferFieldErrors(message),
            ...(message.includes('负责人手机号') || message.includes('负责人手机') || message.includes('负责人电话')
              ? { manager_phone: message }
              : {}),
            ...(message.includes('负责人姓名') ? { manager_name: message } : {}),
            ...(message.includes('门店名称') ? { name: message } : {}),
            ...(message.includes('地址') ? { address: message } : {})
          }
        }, { status: 400 });
      }
    }
  });
}
