import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { query } from '@/lib/database.js';

interface MobileOrderRow {
  id: string | number;
  order_no?: string;
  status?: string;
  total_amount?: string | number;
  created_at?: string | Date;
  store_name?: string;
  item_count?: string | number;
  points_total?: string | number;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  if (!user.companyId) return NextResponse.json([]);
  try {
    const params: Array<number> = [Number(user.companyId)];
    const where = [`member_orders.company_id = $1`, `member_orders.delete_status = '正常'`];
    if (user.storeId) {
      params.push(Number(user.storeId));
      where.push(`member_orders.store_id = $${params.length}`);
    }
    const rows = (
      await query(
        `
          SELECT
            member_orders.id,
            member_orders.order_no,
            member_orders.status,
            member_orders.total_amount,
            member_orders.created_at,
            company_stores.name AS store_name,
            COUNT(member_order_items.id)::int AS item_count,
            COALESCE(SUM(product_skus.redeem_points_price * member_order_items.quantity), 0) AS points_total
          FROM member_orders
          LEFT JOIN company_stores ON company_stores.id = member_orders.store_id
          LEFT JOIN member_order_items ON member_order_items.member_order_id = member_orders.id
          LEFT JOIN product_skus ON product_skus.id = member_order_items.sku_id
          WHERE ${where.join(' AND ')}
          GROUP BY member_orders.id, company_stores.name
          ORDER BY member_orders.created_at DESC, member_orders.id DESC
          LIMIT 50
        `,
        params,
      )
    ).rows.map((row: MobileOrderRow) => ({
      id: String(row.id),
      orderId: String(row.id),
      orderNo: row.order_no ?? `#${row.id}`,
      storeName: row.store_name ?? '',
      status: row.status ?? '已完成',
      totalAmount: Number(row.total_amount ?? 0),
      itemCount: Number(row.item_count ?? 0),
      points: Number(row.points_total ?? 0),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? ''),
    }));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
