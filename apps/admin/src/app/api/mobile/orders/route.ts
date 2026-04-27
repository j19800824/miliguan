import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import {
  createRecord,
  listMemberOrdersByCompany,
  listMemberOrders,
} from '@/lib/database.js';

interface DbRow {
  id: string | number;
  order_no?: string;
  member_name?: string;
  store_name?: string;
  status?: string;
  total_amount?: number | string;
  created_at?: string | Date;
}

function shapeRow(row: DbRow) {
  const date = row.created_at
    ? new Date(row.created_at).toISOString().slice(5, 10)
    : '';
  return {
    id: String(row.order_no ?? row.id),
    sku: row.member_name ?? row.store_name ?? '会员订单',
    qty: 1,
    points: Number(row.total_amount ?? 0),
    status: row.status ?? '待确认',
    date,
  };
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    if (user.companyId) {
      const result = await listMemberOrdersByCompany(user.companyId, {
        page: 1,
        pageSize: 50,
      });
      return NextResponse.json((result.rows ?? []).map(shapeRow));
    }
    const result = await listMemberOrders({
      page: 1,
      pageSize: 50,
      user,
    });
    return NextResponse.json((result.rows ?? []).map(shapeRow));
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询订单失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}

interface CreateOrderBody {
  items?: Array<{ sku_id: string | number; quantity: number }>;
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  if (!user.companyId) {
    return NextResponse.json(
      { message: '当前账号未绑定分公司，无法下单' },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json()) as CreateOrderBody;
    const items = (body.items ?? [])
      .map((it) => ({ sku_id: it.sku_id, quantity: Number(it.quantity) }))
      .filter((it) => it.sku_id && it.quantity > 0);

    if (items.length === 0) {
      return NextResponse.json(
        { message: '请至少选择一个 SKU 并填写数量' },
        { status: 400 },
      );
    }

    const result = await createRecord(
      'purchase-orders',
      { company_id: user.companyId, items },
      user.fullName ?? user.name ?? '移动端用户',
      user,
    );
    return NextResponse.json({ ok: true, id: result.id, message: result.message });
  } catch (error) {
    const message = error instanceof Error ? error.message : '下单失败';
    return NextResponse.json({ message }, { status: 400 });
  }
}
