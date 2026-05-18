import { NextResponse } from 'next/server';
import { getMobileSession } from '@/lib/auth/mobile';
import { createPayment } from '@/lib/payment/orchestrator';

interface CreateBody {
  sourceType?: 'writeoff' | 'topup' | 'standalone';
  sourceId?: string | number;
  amount?: number;
  subject?: string;
}

export async function POST(req: Request) {
  const user = await getMobileSession(req);
  if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 });
  try {
    const body = (await req.json()) as CreateBody;
    const result = await createPayment({
      sourceType: body.sourceType ?? 'writeoff',
      sourceId: body.sourceId,
      amount: body.amount,
      subject: body.subject ?? '米粒冠门店核销',
      user,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { message: e instanceof Error ? e.message : '创建支付失败' },
      { status: 400 },
    );
  }
}
