import { NextResponse } from 'next/server';
import { createPointAdjustment, listPointAdjustments } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function GET(request: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'points:view')) {
    return NextResponse.json({ message: '当前账号无权限查看积分调整' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId') ?? undefined;
  return NextResponse.json({ rows: await listPointAdjustments({ companyId }) });
}

export async function POST(request: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'points:edit')) {
    return NextResponse.json({ message: '当前账号无权限发起积分调整' }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const id = await createPointAdjustment(payload);
    return NextResponse.json({ id: String(id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '积分调整申请失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
