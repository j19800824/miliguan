import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }
  return NextResponse.json({ user });
}
