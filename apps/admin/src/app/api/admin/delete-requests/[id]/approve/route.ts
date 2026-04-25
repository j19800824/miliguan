import { NextResponse } from 'next/server';
import { approveDeleteRequest } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'delete-requests',
    action: '审核删除申请',
    operator: user,
    handler: async () => {
      if (!user) {
        return NextResponse.json({ message: '请先登录' }, { status: 401 });
      }
      if (!hasPermission(user, 'delete:approve')) {
        return NextResponse.json({ message: '当前账号无权限审核删除申请' }, { status: 403 });
      }

      const { id } = await context.params;
      try {
        const payload = (await request.json()) as { result?: '通过' | '驳回'; note?: string };
        await approveDeleteRequest(id, payload, user.name ?? user.account ?? '后台用户');
        return NextResponse.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : '删除审核失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
