import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import {
  createReplenishment,
  listReplenishmentsForUser,
} from '@/lib/database.js';
import { notifyReplenishmentSubmitted } from '@/lib/events';

interface CreateBody {
  items?: Array<{ sku_id: string | number; quantity: number }>;
  remark?: string;
}

interface CreateResult {
  id: string;
  orderNo: string;
  isStoreLevel: boolean;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const list = await listReplenishmentsForUser(user);
    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const body = (await req.json()) as CreateBody;
    const items = (body.items ?? [])
      .map((it) => ({ sku_id: it.sku_id, quantity: Number(it.quantity) }))
      .filter((it) => it.sku_id && it.quantity > 0);
    if (items.length === 0) {
      return NextResponse.json(
        { message: '请至少选择一个商品' },
        { status: 400 },
      );
    }
    const result = (await createReplenishment(
      user,
      items,
      body.remark ?? '',
    )) as CreateResult;
    void notifyReplenishmentSubmitted({
      orderNo: result.orderNo,
      companyId: user.companyId,
      storeId: user.storeId,
      isStoreLevel: result.isStoreLevel,
      submitter: user.fullName ?? user.account,
    });
    return NextResponse.json({ ok: true, id: result.id, orderNo: result.orderNo });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '提交失败' },
      { status: 400 },
    );
  }
}
