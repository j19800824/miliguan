import { NextResponse } from 'next/server';
import { createRedeemItem, listRedeemItems } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function GET() {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  return NextResponse.json({ rows: await listRedeemItems() });
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'settings:view')) {
    return NextResponse.json({ message: '当前账号无权限新增兑换商品' }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const id = await createRedeemItem(payload);
    return NextResponse.json({ id: String(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '新增兑换商品失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
