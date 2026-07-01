import { NextResponse } from 'next/server';
import { getMobileAppSplashConfig } from '@/lib/database.js';

export async function GET(req: Request) {
  try {
    const config = await getMobileAppSplashConfig('/mobile-splash-default.png');
    return NextResponse.json(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询启动图失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
