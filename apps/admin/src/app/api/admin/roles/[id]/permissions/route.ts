import { NextResponse } from 'next/server';
import {
  getRoleDetail,
  getRolePermissionMatrix,
  replaceRolePermissions
} from '@/lib/database.js';
import { getAdminSession, hasPermission } from '@/lib/auth/server';

async function authorize() {
  const user = await getAdminSession();

  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  if (!hasPermission(user, 'roles:grant')) {
    return NextResponse.json({ message: '当前账号无权限分配角色权限' }, { status: 403 });
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await authorize();
  if (authError) return authError;
  const { id } = await context.params;
  const role = await getRoleDetail(id);

  if (!role) {
    return NextResponse.json({ message: '角色不存在' }, { status: 404 });
  }

  return NextResponse.json({
    role,
    permissions: await getRolePermissionMatrix(id)
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authError = await authorize();
  if (authError) return authError;
  const { id } = await context.params;

  try {
    const body = (await request.json()) as { permissionIds?: string[] };
    await replaceRolePermissions(id, body.permissionIds ?? []);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存角色权限失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
