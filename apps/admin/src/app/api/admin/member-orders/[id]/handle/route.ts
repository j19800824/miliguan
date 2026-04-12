import { NextResponse } from 'next/server';
import { handleMemberOrder } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();

  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (!hasPermission(user, 'member-orders:handle')) {
    return NextResponse.json({ message: '当前账号无权限处理会员订单异常' }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const payload = (await request.json()) as {
      action?: 'writeoff' | 'resolve';
      note?: string;
    };
    await handleMemberOrder(id, payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '会员订单处理失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
