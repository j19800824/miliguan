import { NextResponse } from 'next/server';
import { updateStaffOrganization } from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }
  if (!hasPermission(user, 'staff:edit')) {
    return NextResponse.json({ message: '当前账号无权限调整员工组织关系' }, { status: 403 });
  }

  const { id } = await context.params;
  try {
    const payload = await request.json();
    await updateStaffOrganization(id, payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存员工组织关系失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
