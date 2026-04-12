import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import {
  initializeDatabase,
  submitProductSkuDeleteRequest,
  submitProductSkuUpdateRequest
} from '@/lib/database.js';

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
  request: Request,
  context: { params: Promise<{ id: string; skuId: string }> }
) {
  initializeDatabase();
  const authResult = await authorize();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const payload = await request.json();
    const { id, skuId } = await context.params;
    await submitProductSkuUpdateRequest(id, skuId, payload, authResult.name ?? authResult.account ?? '后台用户');
    return NextResponse.json({ success: true, message: 'SKU 修改申请已提交，待审核通过后生效' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新 SKU 失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; skuId: string }> }
) {
  initializeDatabase();
  const authResult = await authorize();
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
