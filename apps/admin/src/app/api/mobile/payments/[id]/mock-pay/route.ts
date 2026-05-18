import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { settlePayment } from '@/lib/payment/orchestrator';
import { getPaymentOrderById } from '@/lib/database.js';
import { isSqbConfigured } from '@/lib/shouqianba';

interface DbPayment {
  id: number;
  order_no: string;
  status: string;
  amount: number | string;
  sqb_sn: string;
  company_id?: number;
}

/**
 * Dev-only: simulate the customer paying. Only allowed when:
 *   1. SQB is NOT configured (mock mode), AND
 *   2. The order's sqb_sn starts with 'MOCK-'
 *
 * Triggers the same settlement path as a real webhook so all
 * downstream events (splits + push + SSE) fire identically.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  const { id } = await ctx.params;

  if (isSqbConfigured()) {
    return NextResponse.json(
      { message: '正式 SQB 已配置，请通过收钱吧回调触发' },
      { status: 400 },
    );
  }

  try {
    const order = (await getPaymentOrderById(id)) as DbPayment | null;
    if (!order) {
      return NextResponse.json({ message: '订单不存在' }, { status: 404 });
    }
    if (!String(order.sqb_sn ?? '').startsWith('MOCK-')) {
      return NextResponse.json(
        { message: '该订单不是 mock 订单' },
        { status: 400 },
      );
    }
    if (
      user.companyId &&
      order.company_id &&
      String(user.companyId) !== String(order.company_id)
    ) {
      return NextResponse.json({ message: '无权操作' }, { status: 403 });
    }
    const res = await settlePayment({
      paymentOrderId: id,
      paidAmount: Number(order.amount),
      payWay: 'MOCK',
      payerUid: 'mock-payer',
      sqbSn: order.sqb_sn,
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '操作失败' },
      { status: 500 },
    );
  }
}
