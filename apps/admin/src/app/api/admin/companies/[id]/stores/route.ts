import { NextResponse } from 'next/server';
import { createCompanyStore, listCompanyStoresByCompany } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'company-stores:view')) {
    return NextResponse.json({ message: '当前账号无权限查看门店' }, { status: 403 });
  }

  const { id } = await context.params;
  return NextResponse.json({ rows: await listCompanyStoresByCompany(id) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'company-stores:edit')) {
    return NextResponse.json({ message: '当前账号无权限新增门店' }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const payload = await request.json();
    const storeId = await createCompanyStore(id, payload);
    return NextResponse.json({ id: String(storeId) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '新增门店失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
