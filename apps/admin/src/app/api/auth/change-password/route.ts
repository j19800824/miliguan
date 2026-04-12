import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/server';
import { changeAdminPassword } from '@/lib/database.js';

export async function PUT(request: Request) {
  const user = await getAdminSession();
  if (!user) {
    return NextResponse.json({ message: '请先登录' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      currentPassword?: string;
      nextPassword?: string;
      confirmPassword?: string;
    };
    const currentPassword = body.currentPassword?.trim() ?? '';
    const nextPassword = body.nextPassword?.trim() ?? '';
    const confirmPassword = body.confirmPassword?.trim() ?? '';

    if (!currentPassword || !nextPassword || !confirmPassword) {
      return NextResponse.json({ message: '请完整填写密码信息' }, { status: 400 });
    }
    if (nextPassword.length < 6) {
      return NextResponse.json({ message: '新密码至少需要 6 位' }, { status: 400 });
    }
    if (nextPassword !== confirmPassword) {
      return NextResponse.json({ message: '两次输入的新密码不一致' }, { status: 400 });
    }

    await changeAdminPassword(user.id, currentPassword, nextPassword);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '修改密码失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
