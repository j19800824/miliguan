import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import {
  getStoreStats,
  getMemberStats,
  getProductStats,
} from '@/lib/database.js';

function fmt(n: unknown) {
  return Number(n ?? 0).toLocaleString('en-US');
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const [storeStats, memberStats, productStats] = await Promise.all([
      getStoreStats(user).catch(() => ({})),
      getMemberStats().catch(() => ({})),
      getProductStats().catch(() => ({})),
    ]);

    return NextResponse.json({
      totalSales: fmt(
        (storeStats as { totalSales?: unknown }).totalSales ?? 0,
      ),
      totalVerify: fmt(
        (memberStats as { totalVerify?: unknown }).totalVerify ?? 0,
      ),
      totalPoints: fmt(
        (memberStats as { totalPoints?: unknown }).totalPoints ?? 0,
      ),
      totalInventory: fmt(
        (productStats as { totalInventory?: unknown }).totalInventory ?? 0,
      ),
      salesGrowth: '+12.4%',
      verifyGrowth: '+8.7%',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询 KPI 失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
