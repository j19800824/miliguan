import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { query } from '@/lib/database.js';

interface VerifyOrderRow {
  id: string | number;
  order_no?: string;
  status?: string;
  sales_staff_name?: string;
  total_amount?: string | number;
  created_at?: string | Date;
  store_name?: string;
  item_count?: string | number;
  points_total?: string | number;
  product_summary?: string;
}

export async function GET(req: Request) {
  const user = await getMobileSession(req);
  if (!user) {
    return NextResponse.json({ message: '未登录' }, { status: 401 });
  }

  try {
    const params: Array<number | string> = [];
    const where = [`member_orders.delete_status = '正常'`];
    if (user.storeId) {
      params.push(Number(user.storeId));
      where.push(`member_orders.store_id = $${params.length}`);
    } else if (user.companyId) {
      params.push(Number(user.companyId));
      where.push(`member_orders.company_id = $${params.length}`);
    }
    const rows = (
      await query(
        `
          SELECT
            member_orders.id,
            member_orders.order_no,
            member_orders.status,
            member_orders.sales_staff_name,
            member_orders.total_amount,
            member_orders.created_at,
            company_stores.name AS store_name,
            COUNT(member_order_items.id)::int AS item_count,
            COALESCE(SUM(product_skus.redeem_points_price * member_order_items.quantity), 0) AS points_total,
            COALESCE(
              STRING_AGG(DISTINCT products.name, '、')
                FILTER (WHERE products.name IS NOT NULL),
              '核销订单'
            ) AS product_summary
          FROM member_orders
          LEFT JOIN company_stores ON company_stores.id = member_orders.store_id
          LEFT JOIN member_order_items ON member_order_items.member_order_id = member_orders.id
          LEFT JOIN product_skus ON product_skus.id = member_order_items.sku_id
          LEFT JOIN products ON products.id = product_skus.product_id
          WHERE ${where.join(' AND ')}
          GROUP BY member_orders.id, company_stores.name
          ORDER BY member_orders.created_at DESC, member_orders.id DESC
          LIMIT 50
        `,
        params,
      )
    ).rows;
    const records = rows.map((row: VerifyOrderRow) => {
      const createdAt =
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? '');
      const time = row.created_at
        ? new Date(row.created_at).toLocaleString('zh-CN', { hour12: false })
        : '';
      return {
        id: String(row.id),
        orderId: String(row.id),
        orderNo: row.order_no ?? `#${row.id}`,
        product: row.product_summary ?? '核销订单',
        barcode: row.order_no ?? '',
        time,
        createdAt,
        staff: row.sales_staff_name ?? '-',
        status: row.status === '异常' || row.status === '已取消' ? 'fail' : 'success',
        pts: Number(row.points_total ?? 0),
        amount: Number(row.total_amount ?? 0),
        itemCount: Number(row.item_count ?? 0),
        storeName: row.store_name ?? '',
      };
    });
    return NextResponse.json(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询核销记录失败';
    return NextResponse.json({ message }, { status: 500 });
  }
}
