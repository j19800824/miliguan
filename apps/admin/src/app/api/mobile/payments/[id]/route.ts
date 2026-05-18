import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { getPaymentOrderById, listPaymentSplits } from '@/lib/database.js';

interface DbPayment {
  id: number;
  order_no: string;
  status: string;
  amount: number | string;
  paid_amount: number | string;
  pay_way: string;
  sqb_sn: string;
  sqb_qr_code: string;
  paid_at?: Date | string;
  refund_amount: number | string;
  company_id?: number;
  store_id?: number;
}

interface DbSplit {
  id: number;
  recipient_type: string;
  amount: number | string;
  status: string;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const order = (await getPaymentOrderById(id)) as DbPayment | null;
    if (!order) {
      return NextResponse.json({ message: '订单不存在' }, { status: 404 });
    }
    if (
      user.companyId &&
      order.company_id &&
      String(user.companyId) !== String(order.company_id)
    ) {
      return NextResponse.json({ message: '无权查看' }, { status: 403 });
    }
    const splits = (await listPaymentSplits(id)) as DbSplit[];
    return NextResponse.json({
      id: String(order.id),
      orderNo: order.order_no,
      status: order.status,
      amount: Number(order.amount),
      paidAmount: Number(order.paid_amount ?? 0),
      refundAmount: Number(order.refund_amount ?? 0),
      payWay: order.pay_way ?? '',
      sqbSn: order.sqb_sn ?? '',
      qrCode: order.sqb_qr_code ?? '',
      paidAt: order.paid_at
        ? new Date(order.paid_at as string).toISOString()
        : null,
      splits: splits.map((s) => ({
        id: String(s.id),
        recipientType: s.recipient_type,
        amount: Number(s.amount),
        status: s.status,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '查询失败' },
      { status: 500 },
    );
  }
}
