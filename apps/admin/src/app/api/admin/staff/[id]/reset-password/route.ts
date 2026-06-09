import { NextResponse } from 'next/server';

// 系统已改为手机号 + 短信验证码登录，密码功能整体弃用，无需重置密码。
// 保留路由仅为兼容旧前端调用，统一返回 410 Gone。
export async function PUT() {
  return NextResponse.json(
    { message: '系统已改为短信验证码登录，密码功能已弃用，无需重置密码' },
    { status: 410 }
  );
}
