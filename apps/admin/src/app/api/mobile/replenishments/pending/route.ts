import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listPendingReplenishmentsForBranch } from '@/lib/database.js';

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  // Only branch-level users (companyId set, no storeId) see pending requests
  // from their stores. Store-level accounts are submitters, not approvers.
  if (!user.companyId || user.storeId) {
    return NextResponse.json([]);
  }
  try {
    const list = await listPendingReplenishmentsForBranch(user);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
