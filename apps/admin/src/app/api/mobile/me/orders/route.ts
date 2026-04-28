import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { listMemberOrdersByCompany } from '@/lib/database.js';

interface DbRow {
  id: string | number;
  order_no?: string;
  status?: string;
  total_amount?: number | string;
  created_at?: string | Date;
  store_name?: string;
  member_name?: string;
  item_count?: number | string;
}

interface DbListResult {
  rows?: DbRow[];
}

function shape(row: DbRow) {
  return {
    id: String(row.id),
    orderNo: row.order_no ?? `#${row.id}`,
    storeName: row.store_name ?? row.member_name ?? '',
    status: row.status ?? '已完成',
    totalAmount: Number(row.total_amount ?? 0),
    itemCount: Number(row.item_count ?? 0),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
  };
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.companyId) return NextResponse.json([]);
  try {
    const result = (await listMemberOrdersByCompany(user.companyId, {
      page: 1,
      pageSize: 50,
    })) as DbListResult;
    const rows = (result?.rows ?? []).map(shape);
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
