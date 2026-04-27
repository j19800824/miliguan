import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listMemberOrdersByCompany, listMemberOrders } from '@/lib/database.js';

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
