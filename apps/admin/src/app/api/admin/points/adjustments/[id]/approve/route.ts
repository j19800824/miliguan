import { NextResponse } from 'next/server';
import { approvePointAdjustment } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'points:approve')) {
    return NextResponse.json({ message: '当前账号无权限审核积分调整' }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const payload = (await request.json()) as { result?: '通过' | '驳回'; note?: string };
    await approvePointAdjustment(id, payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '积分审核失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
