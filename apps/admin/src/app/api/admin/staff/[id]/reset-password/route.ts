import { NextResponse } from 'next/server';
import { getStaffRecordById, resetStaffPassword } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { auditRoute } from '@/lib/audit';

async function authorize() {
  const user = await getAdminSession();

  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (!hasPermission(user, 'staff:edit')) {
    return NextResponse.json({ message: '当前账号无权限重置员工密码' }, { status: 403 });
  }

  return null;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  return auditRoute(request, {
    module: 'staff',
    action: '重置员工密码',
    operator: user,
    handler: async () => {
      const authError = await authorize();
      if (authError) return authError;

      const { id } = await context.params;
      const staff = await getStaffRecordById(id);

      if (!staff) {
        return NextResponse.json({ message: '员工不存在' }, { status: 404 });
      }

      try {
        const result = await resetStaffPassword(id, undefined, user?.name ?? user?.account ?? '后台用户');
        return NextResponse.json({ success: true, message: result.message });
      } catch (error) {
        const message = error instanceof Error ? error.message : '重置密码失败';
        return NextResponse.json({ message }, { status: 400 });
      }
    }
  });
}
