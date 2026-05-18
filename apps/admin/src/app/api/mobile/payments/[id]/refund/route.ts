import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { refundPayment } from '@/lib/payment/orchestrator';

interface RefundBody {
  amount?: number; // omit = full
  reason?: string;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as RefundBody;
    const res = await refundPayment({
      paymentOrderId: id,
      amount: body.amount,
      reason: body.reason,
      actor: user.fullName ?? user.account ?? '后台用户',
    });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '退款失败' },
      { status: 400 },
    );
  }
}
