import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getPurchaseOrderDetail } from '@/lib/database.js';

interface PurchaseOrderItemRow {
  id: string;
  product_name: string;
  sku_code: string;
  spec?: string;
  quantity: number;
  order_quota_unit_price: number;
  subtotal_order_quota: number;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const detail = await getPurchaseOrderDetail(
      id,
      { itemsPage: 1, approvalsPage: 1, pageSize: 100 },
      user,
    );
    if (!detail) {
      return NextResponse.json({ message: '进货单不存在' }, { status: 404 });
    }

    const items = (detail.items?.rows ?? []) as PurchaseOrderItemRow[];
    return NextResponse.json({
      id: detail.id,
      orderNo: detail.order_no,
      status: detail.status,
      approvalStatus: detail.approval_status,
      companyName: detail.company_name,
      storeName: detail.store_name,
      totalAmount: detail.order_quota_total,
      totalQty: items.reduce((sum: number, item: PurchaseOrderItemRow) => sum + Number(item.quantity ?? 0), 0),
      remark: detail.remark ?? '',
      stockReceived: detail.stock_received,
      quotaDeducted: detail.order_quota_deducted,
      companyStockDeducted: detail.company_stock_deducted,
      createdAt: detail.created_at,
      updatedAt: detail.updated_at,
      items: items.map((item: PurchaseOrderItemRow) => ({
        id: item.id,
        productName: item.product_name,
        skuCode: item.sku_code,
        spec: item.spec ?? '',
        quantity: item.quantity,
        unitPrice: item.order_quota_unit_price,
        subtotal: item.subtotal_order_quota,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 400 },
    );
  }
}
