import { NextResponse } from 'next/server';
import { getAdminSession, hasPermission } from '@/lib/auth/server';
import { deleteAppRelease, setAppReleaseActive } from '@/lib/database.js';

async function guard() {
  const user = await getAdminSession();
  if (!user) {
    return { error: NextResponse.json({ message: '请先登录' }, { status: 401 }) };
  }
  if (!hasPermission(user, 'app-releases:edit')) {
    return { error: NextResponse.json({ message: '当前账号无权限操作应用版本' }, { status: 403 }) };
  }
  return { user };
}

// 设为当前版本
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await guard();
  if (error) return error;
  const { id } = await params;
  const release = await setAppReleaseActive(id);
  if (!release) {
    return NextResponse.json({ message: '版本不存在' }, { status: 404 });
  }
  return NextResponse.json({ release });
}

// 删除版本
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await guard();
  if (error) return error;
  const { id } = await params;
  await deleteAppRelease(id);
  return NextResponse.json({ ok: true });
}
