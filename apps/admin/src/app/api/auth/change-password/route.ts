import { NextResponse } from 'next/server';

// 系统已改为手机号 + 短信验证码登录，密码功能整体弃用。
// 保留路由仅为兼容旧前端调用，统一返回 410 Gone。
const GONE_MESSAGE = '密码功能已弃用，请使用手机号 + 短信验证码登录';

export async function PUT() {
  return NextResponse.json({ message: GONE_MESSAGE }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ message: GONE_MESSAGE }, { status: 410 });
}
