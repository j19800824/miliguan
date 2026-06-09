import { NextResponse } from 'next/server';

// 系统已改为手机号 + 短信验证码登录，密码功能整体弃用，统一返回 410 Gone。
const GONE_MESSAGE = '密码功能已弃用，请使用手机号 + 短信验证码登录';

export async function POST() {
  return NextResponse.json({ message: GONE_MESSAGE }, { status: 410 });
}
